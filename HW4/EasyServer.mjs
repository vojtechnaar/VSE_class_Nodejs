import http from "http";
import fs from "fs";
import path from "path";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    fs.readFile("index.html", (err, data) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  } else {
    const filePath = path.join("public", req.url.slice(1));

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile("404.html", (err, data404) => {
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          res.end(data404);
        });
      } else {
        res.writeHead(200);
        res.end(data);
      }
    });
  }
});

server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});