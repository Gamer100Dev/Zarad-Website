# Nginx deployment

Zarad automatically manages an optional Nginx reverse proxy when the Nginx
executable is installed and available in `PATH`. The Go launcher generates a
private runtime configuration, validates it with `nginx -t`, starts Nginx in
the foreground, and stops it when Zarad exits.

The Node.js server remains the application backend.

## Termux

Install Nginx once:

```sh
pkg install nginx
```

Pull the latest Zarad changes, rebuild, and launch:

```sh
git pull
go build -o zarad ./src
./zarad
```

By default:

- Zarad's Node.js server listens on port 3000.
- Nginx listens on port 8080 and proxies requests to Zarad.
- The generated Nginx configuration and PID file are stored under the
  operating system's user cache directory.
- If Nginx is not installed, Zarad continues to serve directly on port 3000.

Open `http://127.0.0.1:8080/` when Nginx starts successfully, or
`http://127.0.0.1:3000/` when running without Nginx.

## Configuration

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Zarad backend port |
| `NGINX_PORT` | `8080` | Nginx public/listening port |
| `NGINX_BIN` | `nginx` from PATH | Explicit Nginx executable path |
| `NGINX` | enabled when Nginx is installed | Set to `off` or `0` to disable Nginx |
| `NPM` | `npm` | npm executable on non-Android systems |

Example:

```sh
NGINX_PORT=8081 PORT=3001 ./zarad
```

To run Zarad without Nginx:

```sh
NGINX=off ./zarad
```

## Linux server

The default Nginx port is 8080 so the launcher can run without privileged
ports. For a public production deployment, configure TLS and a firewall using
your distribution's normal Nginx deployment practices. Do not expose the
backend port directly unless that is intentional.
