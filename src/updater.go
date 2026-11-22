package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	autoUpdateRepository = "github.com/gamer100dev/zarad-website"
	defaultUpdatePeriod  = 5 * time.Minute
	minimumUpdatePeriod  = 30 * time.Second
)

// autoUpdatesEnabled is opt-out: automatic updates are enabled unless explicitly disabled.
func autoUpdatesEnabled() bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv("AUTO_UPDATE")))
	switch value {
	case "0", "false", "off", "no":
		return false
	default:
		return true
	}
}

func autoUpdateInterval() time.Duration {
	value := strings.TrimSpace(os.Getenv("AUTO_UPDATE_INTERVAL"))
	if value == "" {
		return defaultUpdatePeriod
	}

	interval, err := time.ParseDuration(value)
	if err != nil || interval < minimumUpdatePeriod {
		log.Printf("Invalid AUTO_UPDATE_INTERVAL %q; using %s", value, defaultUpdatePeriod)
		return defaultUpdatePeriod
	}
	return interval
}

// findRepositoryRoot checks the current directory, executable directory, and
// source directory. This also works when the compiled launcher is in a cache.
func findRepositoryRoot() (string, error) {
	if _, err := exec.LookPath("git"); err != nil {
		return "", fmt.Errorf("Git is not installed or not on PATH: %w", err)
	}

	var candidates []string
	if current, err := os.Getwd(); err == nil {
		candidates = append(candidates, current)
	}
	if executable, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Dir(executable))
	}
	if _, source, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Dir(source))
	}

	seen := make(map[string]bool)
	for _, candidate := range candidates {
		absolute, err := filepath.Abs(candidate)
		if err != nil {
			continue
		}
		for directory := absolute; ; directory = filepath.Dir(directory) {
			if seen[directory] {
				break
			}
			seen[directory] = true

			command := exec.Command("git", "-C", directory, "rev-parse", "--show-toplevel")
			output, err := command.Output()
			if err == nil {
				return filepath.Clean(strings.TrimSpace(string(output))), nil
			}

			parent := filepath.Dir(directory)
			if parent == directory {
				break
			}
		}
	}

	return "", fmt.Errorf("could not locate a Git checkout; automatic updates require the Zarad repository")
}

func gitOutput(ctx context.Context, repositoryRoot string, args ...string) (string, error) {
	commandArgs := append([]string{"-C", repositoryRoot}, args...)
	command := exec.CommandContext(ctx, "git", commandArgs...)
	command.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")

	output, err := command.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(output))
		if detail != "" {
			return "", fmt.Errorf("git %s failed: %w: %s", strings.Join(args, " "), err, detail)
		}
		return "", fmt.Errorf("git %s failed: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(output)), nil
}

func normalizeGitRemote(remote string) string {
	remote = strings.TrimSpace(remote)
	remote = strings.TrimSuffix(remote, ".git")
	for _, prefix := range []string{"https://", "http://", "ssh://"} {
		remote = strings.TrimPrefix(remote, prefix)
	}
	remote = strings.TrimPrefix(remote, "git@")
	if strings.Contains(remote, ":") {
		remote = strings.Replace(remote, ":", "/", 1)
	}
	return strings.TrimSuffix(strings.ToLower(remote), "/")
}

func trackedWorkingTreeIsClean(ctx context.Context, repositoryRoot string) (bool, error) {
	status, err := gitOutput(ctx, repositoryRoot, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return false, err
	}
	return status == "", nil
}

func cacheUpdateDirectory() (string, error) {
	cacheRoot, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(cacheRoot) == "" {
		cacheRoot = os.TempDir()
	}
	directory := filepath.Join(cacheRoot, "zarad", "updates")
	if err := os.MkdirAll(directory, 0700); err != nil {
		return "", fmt.Errorf("could not create update cache %s: %w", directory, err)
	}
	return directory, nil
}

// buildAndApplyUpdate builds the incoming commit in a temporary Git worktree
// before fast-forwarding the user's checkout. A failed build never replaces
// the running launcher or changes the checked-out branch.
func buildAndApplyUpdate(ctx context.Context, repositoryRoot string) (string, bool, error) {
	if _, err := exec.LookPath("go"); err != nil {
		return "", false, fmt.Errorf("Go is required to build an updated launcher: %w", err)
	}

	remote, err := gitOutput(ctx, repositoryRoot, "remote", "get-url", "origin")
	if err != nil {
		return "", false, err
	}
	if normalizeGitRemote(remote) != autoUpdateRepository {
		return "", false, fmt.Errorf("automatic updates skipped: origin is %q, not %s", remote, autoUpdateRepository)
	}

	branch, err := gitOutput(ctx, repositoryRoot, "branch", "--show-current")
	if err != nil {
		return "", false, err
	}
	if branch != "main" {
		return "", false, fmt.Errorf("automatic updates skipped: current branch is %q, not main", branch)
	}

	clean, err := trackedWorkingTreeIsClean(ctx, repositoryRoot)
	if err != nil {
		return "", false, err
	}
	if !clean {
		return "", false, fmt.Errorf("automatic updates skipped because tracked files have local changes")
	}

	if _, err := gitOutput(ctx, repositoryRoot, "fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"); err != nil {
		return "", false, err
	}

	currentHead, err := gitOutput(ctx, repositoryRoot, "rev-parse", "HEAD")
	if err != nil {
		return "", false, err
	}
	remoteHead, err := gitOutput(ctx, repositoryRoot, "rev-parse", "--verify", "refs/remotes/origin/main")
	if err != nil {
		return "", false, err
	}
	if currentHead == remoteHead {
		return "", false, nil
	}

	ancestorCommand := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "merge-base", "--is-ancestor", "HEAD", "origin/main")
	ancestorCommand.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	if err := ancestorCommand.Run(); err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) && exitError.ExitCode() == 1 {
			return "", false, fmt.Errorf("automatic updates skipped: local main has commits or has diverged from origin/main")
		}
		return "", false, fmt.Errorf("could not compare local and remote history: %w", err)
	}

	goTool, err := exec.LookPath("go")
	if err != nil {
		return "", false, err
	}
	updateDirectory, err := cacheUpdateDirectory()
	if err != nil {
		return "", false, err
	}

	shortCommit := remoteHead
	if len(shortCommit) > 12 {
		shortCommit = shortCommit[:12]
	}
	executableSuffix := ""
	if runtime.GOOS == "windows" {
		executableSuffix = ".exe"
	}
	updatedExecutable := filepath.Join(updateDirectory, "zarad-"+shortCommit+executableSuffix)
	temporaryExecutable := updatedExecutable + ".building"
	_ = os.Remove(temporaryExecutable)

	worktreePath, err := os.MkdirTemp("", "zarad-update-"+shortCommit+"-")
	if err != nil {
		return "", false, fmt.Errorf("could not create temporary update worktree: %w", err)
	}
	if err := os.Remove(worktreePath); err != nil {
		return "", false, fmt.Errorf("could not prepare temporary update worktree: %w", err)
	}
	defer func() {
		cleanupContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if _, cleanupErr := gitOutput(cleanupContext, repositoryRoot, "worktree", "remove", "--force", worktreePath); cleanupErr != nil {
			_ = os.RemoveAll(worktreePath)
		}
	}()

	if _, err := gitOutput(ctx, repositoryRoot, "worktree", "add", "--detach", worktreePath, "origin/main"); err != nil {
		return "", false, err
	}

	log.Printf("Building Zarad update %s", shortCommit)
	build := exec.CommandContext(ctx, goTool, "build", "-C", worktreePath, "-o", temporaryExecutable, "./src")
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	build.Env = os.Environ()
	if err := build.Run(); err != nil {
		_ = os.Remove(temporaryExecutable)
		return "", false, fmt.Errorf("could not build update %s: %w", shortCommit, err)
	}
	if err := os.Chmod(temporaryExecutable, 0700); err != nil {
		_ = os.Remove(temporaryExecutable)
		return "", false, fmt.Errorf("could not set permissions on updated launcher: %w", err)
	}
	_ = os.Remove(updatedExecutable)
	if err := os.Rename(temporaryExecutable, updatedExecutable); err != nil {
		_ = os.Remove(temporaryExecutable)
		return "", false, fmt.Errorf("could not install updated launcher in cache: %w", err)
	}

	// Recheck the checkout immediately before applying the fast-forward.
	clean, err = trackedWorkingTreeIsClean(ctx, repositoryRoot)
	if err != nil || !clean {
		_ = os.Remove(updatedExecutable)
		if err != nil {
			return "", false, err
		}
		return "", false, fmt.Errorf("local tracked files changed while the update was being built; leaving the checkout untouched")
	}
	latestHead, err := gitOutput(ctx, repositoryRoot, "rev-parse", "HEAD")
	if err != nil || latestHead != currentHead {
		_ = os.Remove(updatedExecutable)
		if err != nil {
			return "", false, err
		}
		return "", false, fmt.Errorf("local branch moved while the update was being built; leaving the checkout untouched")
	}

	if _, err := gitOutput(ctx, repositoryRoot, "merge", "--ff-only", "origin/main"); err != nil {
		_ = os.Remove(updatedExecutable)
		return "", false, fmt.Errorf("could not fast-forward to the built update: %w", err)
	}

	appliedHead, err := gitOutput(ctx, repositoryRoot, "rev-parse", "HEAD")
	if err != nil || appliedHead != remoteHead {
		_ = os.Remove(updatedExecutable)
		if err != nil {
			return "", false, err
		}
		return "", false, fmt.Errorf("checkout did not reach the expected update commit")
	}

	log.Printf("Updated source checkout to %s; restarting the Zarad launcher", shortCommit)
	return updatedExecutable, true, nil
}

// startAutoUpdateWatcher periodically checks origin/main. When a tested build
// is ready, it signals the main process to stop the website and restart itself.
func startAutoUpdateWatcher(parent context.Context, cancelServer context.CancelFunc) <-chan string {
	restart := make(chan string, 1)
	if !autoUpdatesEnabled() {
		log.Printf("Automatic updates are disabled (AUTO_UPDATE=off)")
		return restart
	}

	interval := autoUpdateInterval()
	go func() {
		repositoryRoot, err := findRepositoryRoot()
		if err != nil {
			log.Printf("Automatic updates unavailable: %v", err)
			return
		}
		log.Printf("Automatic updates enabled for %s (checking every %s)", repositoryRoot, interval)

		check := func() bool {
			checkContext, cancel := context.WithTimeout(parent, 3*time.Minute)
			defer cancel()

			executable, updated, err := buildAndApplyUpdate(checkContext, repositoryRoot)
			if err != nil {
				if parent.Err() == nil {
					log.Printf("Automatic update check: %v", err)
				}
				return false
			}
			if !updated {
				return false
			}

			restart <- executable
			cancelServer()
			return true
		}

		if check() {
			return
		}

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-parent.Done():
				return
			case <-ticker.C:
				if check() {
					return
				}
			}
		}
	}()
	return restart
}

// startUpdatedExecutable starts the freshly built launcher with the same
// working directory, arguments, environment, and terminal streams.
func startUpdatedExecutable(executable string) error {
	workingDirectory, err := os.Getwd()
	if err != nil {
		return err
	}

	command := exec.Command(executable, os.Args[1:]...)
	command.Dir = workingDirectory
	command.Env = os.Environ()
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		return fmt.Errorf("could not start updated Zarad launcher: %w", err)
	}
	if err := command.Process.Release(); err != nil {
		return fmt.Errorf("updated Zarad launcher started but its process handle could not be released: %w", err)
	}
	return nil
}
