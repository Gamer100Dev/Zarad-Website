# Nginx deployment

Zarad's Node.js server remains responsible for serving the website and its
assets. Nginx sits in front of it as a reverse proxy.

## Termux

Install Nginx:

```sh
pkg install nginx
```

Start Zarad in one Termux session from the repository root:

```sh
cd ~/Zarad-Website
./zarad
```

In a second session, install the Nginx server block:

```sh
mkdir -p "$PREFIX/etc/nginx/conf.d"
cp deploy/nginx.conf "$PREFIX/etc/nginx/conf.d/zarad.conf"
```

Check that the main Nginx configuration includes the conf.d directory from
inside its `http { ... }` block. The include should look like:

```nginx
include conf.d/*.conf;
```

Validate and start Nginx:

```sh
nginx -t
nginx
```

Open:

- Website: http://127.0.0.1:8080/
- Nginx health check: http://127.0.0.1:8080/nginx-health
- Zarad application health check: http://127.0.0.1:8080/api/health

To reload Nginx after changing its configuration:

```sh
nginx -s reload
```

To stop Nginx:

```sh
nginx -s quit
```

## Linux server

The supplied server block listens on port 8080 to work without privileged
ports in Termux. On a conventional Linux server, change both `listen 8080`
directives to `listen 80` (or configure TLS on your server), then enable the
server block using your distribution's Nginx configuration layout.

Keep Zarad running on port 3000. Nginx forwards requests to
`http://127.0.0.1:3000`, preserving paths such as `/assets/`, `/catalog`,
and `/api/health`.
