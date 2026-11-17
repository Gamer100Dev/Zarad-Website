package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type websiteService struct {
	directory string
	script    string
	port      string
	build     bool
}

func newWebsiteService() (*websiteService, error) {
	directory, err := findWebsiteDirectory()
	if err != nil {
		return nil, err
	}

	content, err := os.ReadFile(filepath.Join(directory, "package.json"))
	if err != nil {
		return nil, fmt.Errorf("could not read package.json: %w", err)
	}

	var manifest struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(content, &manifest); err != nil {
		return nil, fmt.Errorf("could not read package.json: %w", err)
	}

	script := strings.TrimSpace(os.Getenv("NPM_SCRIPT"))
	if script == "" {
		for _, candidate := range []string{"start", "preview", "dev"} {
			if _, ok := manifest.Scripts[candidate]; ok {
				script = candidate
				break
			}
		}
	}
	if script == "" {
		return nil, fmt.Errorf("no start, preview, or dev script is defined in %s", filepath.Join(directory, "package.json"))
	}
	if _, ok := manifest.Scripts[script]; !ok {
		return nil, fmt.Errorf("npm script %q is not defined in package.json", script)
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "3000"
	}

	_, hasBuild := manifest.Scripts["build"]

	return &websiteService{
		directory: directory,
		script:    script,
		port:      port,
		build:     hasBuild && script != "dev",
	}, nil
}

func findWebsiteDirectory() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("WEBSITE_DIR")); configured != "" {
		directory, err := filepath.Abs(configured)
		if err != nil {
			return "", err
		}
		if _, err := os.Stat(filepath.Join(directory, "package.json")); err != nil {
			return "", fmt.Errorf("WEBSITE_DIR does not contain a package.json: %w", err)
		}
		return directory, nil
	}

	current, err := os.Getwd()
	if err != nil {
		return "", err
	}

	candidates := []string{
		filepath.Join(current, "src", "website"),
		filepath.Join(current, "website"),
	}

	if _, source, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(source), "website"))
	}

	candidates = append(candidates, current)

	for _, candidate := range candidates {
		if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
			return filepath.Abs(candidate)
		}
	}

	return "", fmt.Errorf("could not find the website package; set WEBSITE_DIR to the folder containing package.json")
}

func (s *websiteService) runNPM(ctx context.Context, args ...string) error {
	var cmd *exec.Cmd

	if runtime.GOOS == "android" {
		prefix := os.Getenv("PREFIX")
		if prefix == "" {
			prefix = "/data/data/com.termux/files/usr"
		}
		node := filepath.Join(prefix, "bin", "node")
		npmCLI := filepath.Join(prefix, "lib", "node_modules", "npm", "bin", "npm-cli.js")
		if _, err := os.Stat(node); err != nil {
			return fmt.Errorf("Node.js not found at %s: %w", node, err)
		}
		if _, err := os.Stat(npmCLI); err != nil {
			return fmt.Errorf("npm CLI not found at %s: %w", npmCLI, err)
		}
		cmd = exec.CommandContext(ctx, node, append([]string{npmCLI}, args...)...)
	} else {
		npm := strings.TrimSpace(os.Getenv("NPM"))
		if npm == "" {
			npm = "npm"
		}
		cmd = exec.CommandContext(ctx, npm, args...)
	}

	cmd.Dir = s.directory
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.Env = append(os.Environ(), "HOST=0.0.0.0", "PORT="+s.port)
	return cmd.Run()
}

func (s *websiteService) startNginx(ctx context.Context) (func(), error) {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("NGINX")), "off") ||
		strings.TrimSpace(os.Getenv("NGINX")) == "0" {
		log.Printf("Nginx integration disabled; website will be served directly")
		return func() {}, nil
	}

	nginxPath := strings.TrimSpace(os.Getenv("NGINX_BIN"))
	if nginxPath == "" {
		var err error
		nginxPath, err = exec.LookPath("nginx")
		if err != nil {
			log.Printf("Nginx not found; website will be served directly on port %s", s.port)
			return func() {}, nil
		}
	}

	backendPort, err := strconv.Atoi(s.port)
	if err != nil || backendPort < 1 || backendPort > 65535 {
		return nil, fmt.Errorf("invalid website PORT %q; cannot configure Nginx", s.port)
	}

	nginxPort := strings.TrimSpace(os.Getenv("NGINX_PORT"))
	if nginxPort == "" {
		nginxPort = "8080"
	}
	listenPort, err := strconv.Atoi(nginxPort)
	if err != nil || listenPort < 1 || listenPort > 65535 {
		return nil, fmt.Errorf("invalid NGINX_PORT %q", nginxPort)
	}

	cacheDir, err := os.UserCacheDir()
	if err != nil || cacheDir == "" {
		cacheDir = os.TempDir()
	}
	runtimeDir := filepath.Join(cacheDir, "zarad", "nginx")
	// Nginx creates its temporary request/proxy buffers beneath its prefix.
	// Create the full directory tree up front; otherwise nginx -t fails on a
	// fresh installation with CreateDirectory(.../temp/client_body_temp).
	requiredDirs := []string{
		filepath.Join(runtimeDir, "logs"),
		filepath.Join(runtimeDir, "temp", "client_body_temp"),
		filepath.Join(runtimeDir, "temp", "proxy_temp"),
		filepath.Join(runtimeDir, "temp", "fastcgi_temp"),
		filepath.Join(runtimeDir, "temp", "uwsgi_temp"),
		filepath.Join(runtimeDir, "temp", "scgi_temp"),
	}
	for _, dir := range requiredDirs {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, fmt.Errorf("could not create Nginx runtime directory %s: %w", dir, err)
		}
	}

	configPath := filepath.Join(runtimeDir, "nginx.conf")

	// Nginx parses configuration paths itself. On Windows, native backslashes
	// can be treated as escape characters (for example, \\n in a path).
	// Use forward slashes in every path written into nginx.conf and in -p.
	nginxPrefix := filepath.ToSlash(runtimeDir)
	nginxConfigPath := filepath.ToSlash(configPath)

	// Keep the PID path relative to the Nginx prefix to avoid Windows path escaping.
	config := fmt.Sprintf(`worker_processes 1;
pid logs/nginx.pid;
error_log stderr warn;

events {
    worker_connections 256;
}

http {
    access_log off;

    server {
        listen 0.0.0.0:%s;
        server_name _;

        # Stream large images directly; do not spill upstream asset responses
        # into proxy_temp, which may be inaccessible to an unprivileged worker.
        location ^~ /assets/ {
            proxy_pass http://127.0.0.1:%s;
            proxy_http_version 1.1;
            proxy_buffering off;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }

        location / {
            proxy_pass http://127.0.0.1:%s;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }
    }
}
`, nginxPort, s.port, s.port)

	if err := os.WriteFile(configPath, []byte(config), 0600); err != nil {
		return nil, fmt.Errorf("could not write Nginx configuration: %w", err)
	}

	test := exec.CommandContext(ctx, nginxPath, "-t", "-p", nginxPrefix, "-c", nginxConfigPath)
	test.Stdout = os.Stdout
	test.Stderr = os.Stderr
	if err := test.Run(); err != nil {
		log.Printf("Nginx configuration test failed; continuing without Nginx: %v", err)
		return func() {}, nil
	}

	cmd := exec.CommandContext(ctx, nginxPath, "-p", nginxPrefix, "-c", nginxConfigPath, "-g", "daemon off;")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		log.Printf("Could not start Nginx; continuing without reverse proxy: %v", err)
		return func() {}, nil
	}

	wait := make(chan error, 1)
	go func() {
		wait <- cmd.Wait()
	}()

	select {
	case err := <-wait:
		log.Printf("Nginx exited during startup; continuing without reverse proxy: %v", err)
		return func() {}, nil
	case <-time.After(250 * time.Millisecond):
		log.Printf("Nginx reverse proxy listening on port %s; forwarding to Zarad on port %s", nginxPort, s.port)
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		<-wait
		return func() {}, ctx.Err()
	}

	stop := func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			<-wait
		}
	}
	return stop, nil
}

func (s *websiteService) Run(ctx context.Context) error {
	installCommand := "install"
	if _, err := os.Stat(filepath.Join(s.directory, "package-lock.json")); err == nil {
		installCommand = "ci"
	}

	log.Printf("Installing website dependencies in %s", s.directory)
	if err := s.runNPM(ctx, installCommand); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("npm %s failed: %w", installCommand, err)
	}

	if s.build {
		log.Printf("Building website")
		if err := s.runNPM(ctx, "run", "build"); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("npm run build failed: %w", err)
		}
	}

	if err := ctx.Err(); err != nil {
		return nil
	}

	// Avoid starting a duplicate Node process when the backend port is already occupied.
	backendAddr := net.JoinHostPort("127.0.0.1", s.port)
	conn, dialErr := net.DialTimeout("tcp", backendAddr, 500*time.Millisecond)
	backendAlreadyListening := dialErr == nil
	if conn != nil {
		_ = conn.Close()
	}

	stopNginx, err := s.startNginx(ctx)
	if err != nil {
		return err
	}
	defer stopNginx()

	if backendAlreadyListening {
		log.Printf("Port %s is already in use; not starting a duplicate Zarad Node process", s.port)
		log.Printf("Keep this launcher open for Nginx, or stop the process using port %s before restarting Zarad", s.port)
		<-ctx.Done()
		return nil
	}

	log.Printf("Starting website with npm run %s on port %s", s.script, s.port)
	delay := 2 * time.Second
	for {
		started := time.Now()
		err := s.runNPM(ctx, "run", s.script)
		if ctx.Err() != nil {
			return nil
		}
		if err != nil {
			log.Printf("Website process stopped: %v. Restarting in %s", err, delay)
		} else {
			log.Printf("Website process exited. Restarting in %s", delay)
		}

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return nil
		case <-timer.C:
		}

		if time.Since(started) > time.Minute {
			delay = 2 * time.Second
		} else if delay < 30*time.Second {
			delay *= 2
			if delay > 30*time.Second {
				delay = 30 * time.Second
			}
		}
	}
}
