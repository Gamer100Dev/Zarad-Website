# Nginx deployment

Zarad automatically manages an optional Nginx reverse proxy when the Nginx
executable is installed and available in `PATH`. The Go launcher generates a
private runtime configuration, validates it with `nginx -t`, starts Nginx in
the foreground, and stops it when Zarad exits.

The Node.js server remains the application backend.

## Automatic updates

The Go launcher checks the repository's `origin/main` branch at startup and
then every five minutes by default. When a newer commit is available, it:

1. Fetches the latest `main` commit from the configured GitHub remote.
2. Builds the updated Go launcher in a temporary Git worktree.
3. Fast-forwards the local checkout only after that build succeeds.
4. Stops the current Node.js server and Nginx process cleanly.
5. Starts the newly built launcher with the same environment and working
   directory. The normal startup process then installs any updated npm
   dependencies and starts the website again.

Automatic updates are deliberately conservative. They run only when the
checkout is on `main`, its `origin` remote is
`github.com/Gamer100Dev/Zarad-Website`, and there are no tracked local
modifications or divergent local commits. Untracked files are left untouched.
If the network, GitHub authentication, or an update build temporarily
fails, the current server keeps running and the next scheduled check retries.
Git must be installed and the launcher must be started from a Git checkout;
the Go toolchain must be available before an update can be built. If Git or the
checkout is missing, restart the launcher after fixing that setup.

The machine running the launcher therefore needs Git, Go 1.22 or newer, and
working Git credentials for the repository. This is intended for a local
development checkout; production deployments that do not contain a Git
checkout can disable the feature.

Disable automatic updates:

```sh
AUTO_UPDATE=off ./zarad
```

Change the check interval (durations such as `2m`, `10m`, or `1h` are
accepted; the minimum is 30 seconds):

```sh
AUTO_UPDATE_INTERVAL=2m ./zarad
```

## Termux

Install Nginx once:

```sh
pkg install nginx
```

Build and launch:

```sh
go build -o zarad ./src
./zarad
```

By default:

- Zarad's Node.js server listens on port 3000.
- Nginx listens on port 8080 and proxies requests to Zarad.
- The generated Nginx configuration and PID file are stored under the
  operating system's user cache directory.
- If Nginx is not installed, Zarad continues to serve directly on port 3000.
- The launcher checks for updates every five minutes and restarts itself when
  a clean, buildable update is available.

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
| `AUTO_UPDATE` | enabled | Set to `off` or `0` to disable self-updates |
| `AUTO_UPDATE_INTERVAL` | `5m` | How often the launcher checks GitHub; minimum `30s` |

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
