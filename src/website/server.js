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
  ".glb": "model/gltf-binary",
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
      const isServiceWorker = pathname === "/service-worker.js";
      const etag = "\"" +
        Math.trunc(stats.mtimeMs * 1000).toString(16) +
        "-" + stats.size.toString(16) + "\"";
      const lastModified = stats.mtime.toUTCString();
      const cacheControl = isServiceWorker
        ? "no-cache, no-store, must-revalidate"
        : "no-cache, must-revalidate";
      const validatorHeaders = {
        ETag: etag,
        "Last-Modified": lastModified,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff"
      };

      const ifNoneMatch = request.headers["if-none-match"];
      const etagMatches = typeof ifNoneMatch === "string" &&
        ifNoneMatch.split(",").some(value => value.trim() === "*" || value.trim() === etag);
      const ifModifiedSince = request.headers["if-modified-since"];
      const modifiedSinceTime = typeof ifModifiedSince === "string"
        ? Date.parse(ifModifiedSince)
        : NaN;
      const notModifiedByDate = !ifNoneMatch &&
        Number.isFinite(modifiedSinceTime) &&
        Math.floor(stats.mtimeMs / 1000) <= Math.floor(modifiedSinceTime / 1000);

      if (etagMatches || notModifiedByDate) {
        response.writeHead(304, validatorHeaders);
        response.end();
        return;
      }

      const responseHeaders = {
        ...validatorHeaders,
        "Content-Type": contentTypes[extension] || "application/octet-stream"
      };

      if (extension === ".html") {
        // Inject the updater centrally so every present and future HTML route
        // receives it without having to maintain separate page templates.
        fs.readFile(filePath, (readError, contents) => {
          if (readError) {
            console.error("[zarad] Unable to read " + filePath + ": " + readError.message);
            if (!response.headersSent) {
              response.writeHead(readError.code === "EACCES" || readError.code === "EPERM" ? 403 : 500);
            }
            response.end("Server error");
            return;
          }

          const html = contents.toString("utf8");
          const updaterTag = '<script src="/asset-refresh.js" defer></script>';
          const updatedHtml = html.includes(updaterTag)
            ? html
            : html.replace(/<\/head\s*>/i, "  " + updaterTag + "\n</head>");
          const body = Buffer.from(updatedHtml, "utf8");

          responseHeaders["Content-Length"] = body.length;
          response.writeHead(200, responseHeaders);
          if (request.method === "HEAD") {
            response.end();
          } else {
            response.end(body);
          }
        });
        return;
      }

      responseHeaders["Content-Length"] = stats.size;
      response.writeHead(200, responseHeaders);

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.on("error", streamError => {
        console.error("[zarad] Unable to stream " + filePath + ": " + streamError.message);
        if (!response.headersSent) {
          response.writeHead(streamError.code === "EACCES" || streamError.code === "EPERM" ? 403 : 500);
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

  // Events are currently disabled in the public site. Keep the source pages
  // available in the repository, but send old public URLs to the catalog.
  if (
    pathname === "/events" || pathname === "/events/" ||
    pathname === "/events.html" || pathname.startsWith("/events/") ||
    pathname === "/event-list" || pathname === "/event-list/" ||
    pathname === "/event-list.html"
  ) {
    response.writeHead(302, { Location: "/catalog", "Cache-Control": "no-store" });
    response.end();
    return;
  }

  if (pathname === "/events.json") {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("Events are disabled");
    return;
  }

  if (
    pathname === "/about" || pathname === "/about/" ||
    pathname === "/despre-noi" || pathname === "/despre-noi/"
  ) {
    pathname = "/about.html";
  }

  if (pathname === "/catalog" || pathname === "/catalog/") {
    pathname = "/catalog.html";
  }

  if (pathname === "/contact" || pathname === "/contact/") {
    pathname = "/contact.html";
  }

  if (pathname === "/cart" || pathname === "/cart/") pathname = "/cart.html";
  if (pathname === "/checkout" || pathname === "/checkout/") pathname = "/checkout.html";
  if (pathname === "/terms" || pathname === "/terms/") pathname = "/terms.html";


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
