const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 8080;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

http
  .createServer((request, response) => {
    const url = decodeURIComponent(request.url.split("?")[0]);
    const fileName = url === "/" ? "index.html" : url.slice(1);
    const filePath = path.resolve(__dirname, fileName);

    if (!filePath.startsWith(path.resolve(__dirname)) || !contentTypes[path.extname(filePath).toLowerCase()]) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(500);
        response.end("Server error");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(fileName).toLowerCase()],
      });
      response.end(content);
    });
  })
  .listen(port, () => {
    console.log(`MusicBlock Community is running at http://localhost:${port}`);
  });
