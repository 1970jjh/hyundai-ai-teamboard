import { createServer } from "node:http";

/**
 * 구글 Apps Script 웹 앱 대신 받는 가짜 서버(globalSetup).
 * POST 본문을 쌓아 두고, GET /received 로 돌려준다.
 */
export default async function globalSetup() {
  const received: unknown[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET" && req.url === "/received") return res.end(JSON.stringify(received));
      try {
        received.push({ at: Date.now(), ...JSON.parse(body) });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400).end(JSON.stringify({ ok: false, error: "bad json" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(3199, "127.0.0.1", r));
  return async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
}
