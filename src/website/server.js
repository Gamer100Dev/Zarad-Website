const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const publicDirectory = path.join(__dirname, "public");
const assetDirectories = [
  path.resolve(__dirname, "..", "..", "assets"),
  path.join(publicDirectory, "assets")
];
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendFile(request, response, pathname) {
  let baseDirectories;
  let relativePath;

  try {
    if (pathname.startsWith("/assets/")) {
      baseDirectories = assetDirectories;
      relativePath = decodeURIComponent(pathname.slice("/assets/".length));
    } else {
      baseDirectories = [publicDirectory];
      relativePath = decodeURIComponent(pathname === "/" ? "index.html" : pathname.slice(1));
    }
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  function tryDirectory(index) {
    if (index >= baseDirectories.length) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const baseDirectory = baseDirectories[index];
    const filePath = path.resolve(baseDirectory, relativePath);
    const relative = path.relative(baseDirectory, filePath);

    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error) {
        if ((error.code === "ENOENT" || error.code === "ENOTDIR") && index + 1 < baseDirectories.length) {
          tryDirectory(index + 1);
          return;
        }

        const status = error.code === "EACCES" || error.code === "EPERM" ? 403 : 404;
        console.error("[zarad] Unable to access " + filePath + ": " + error.message);
        response.writeHead(status);
        response.end(status === 403 ? "Forbidden" : "Not found");
        return;
      }

      if (!stats.isFile()) {
        if (index + 1 < baseDirectories.length) {
          tryDirectory(index + 1);
        } else {
          response.writeHead(404);
          response.end("Not found");
        }
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "Content-Type": contentTypes[extension] || "application/octet-stream",
        "Content-Length": stats.size,
        "Cache-Control": extension === ".html" || extension === ".json" ? "no-cache" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on("error", error => {
        console.error("[zarad] Unable to stream " + filePath + ": " + error.message);
        if (!response.headersSent) {
          response.writeHead(error.code === "EACCES" || error.code === "EPERM" ? 403 : 500);
        }
        response.end("Server error");
      });
      stream.pipe(response);
    });
  }

  tryDirectory(0);
}

const server = http.createServer((request, response) => {
  let pathname;

  try {
    const address = new URL(request.url, "http://" + (request.headers.host || "localhost"));
    pathname = address.pathname;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "zarad-website"
    });
    return;
  }

  if (pathname === "/catalog" || pathname === "/catalog/") {
    pathname = "/catalog.html";
  }

  if (pathname === "/events" || pathname === "/events/") {
    pathname = "/events/index.html";
  }

  sendFile(request, response, pathname);
});

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number");
}

server.listen(port, host, () => {
  process.stdout.write("Zarad is running at http://" + host + ":" + port + "\n");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
