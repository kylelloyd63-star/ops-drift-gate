import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/report.js", ["report.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/tokens.css", ["tokens.css", "text/css; charset=utf-8"]]
]);

export async function startViewer() {
  const files = new Map(await Promise.all([...assets].map(async ([route, [name, type]]) =>
    [route, { type, body: await readFile(new URL(`../web/${name}`, import.meta.url)) }]
  )));
  const bindAddress = "127.0.0.1";
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (request.headers.host !== `${bindAddress}:${server.address().port}`) {
      response.writeHead(400).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const file = files.get(request.url.split("?", 1)[0]);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": file.type, "Content-Length": file.body.length });
    response.end(request.method === "GET" ? file.body : undefined);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, bindAddress, resolve);
  });
  return `http://${bindAddress}:${server.address().port}/`;
}
