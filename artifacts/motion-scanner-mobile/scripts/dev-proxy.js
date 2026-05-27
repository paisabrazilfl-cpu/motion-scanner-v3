#!/usr/bin/env node
/**
 * Dev proxy wrapper for Expo in Replit.
 *
 * Replit's workflow health check requires the declared localPort to be open on
 * 0.0.0.0 (IPv4). This script:
 *   1. Immediately binds a lightweight HTTP/WebSocket proxy on 0.0.0.0:PORT.
 *   2. Starts Expo Metro on PORT+1 (internal port) with explicit --port flag.
 *   3. Forwards all incoming HTTP/WebSocket traffic from PORT → PORT+1.
 */

const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const PORT = parseInt(process.env.PORT || "22528", 10);
const EXPO_PORT = PORT + 1;

// Set Replit-specific Expo env vars so Metro has correct QR code URLs
if (process.env.REPLIT_EXPO_DEV_DOMAIN) {
  process.env.EXPO_PACKAGER_PROXY_URL = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
}
if (process.env.REPLIT_DEV_DOMAIN) {
  process.env.EXPO_PUBLIC_DOMAIN = process.env.REPLIT_DEV_DOMAIN;
  process.env.REACT_NATIVE_PACKAGER_HOSTNAME = process.env.REPLIT_DEV_DOMAIN;
}
if (process.env.REPL_ID) {
  process.env.EXPO_PUBLIC_REPL_ID = process.env.REPL_ID;
}

// Forward HTTP requests
const proxy = http.createServer((req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: EXPO_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${EXPO_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("Expo Metro starting...");
    }
  });

  req.pipe(proxyReq, { end: true });
});

// Forward WebSocket upgrades (Metro HMR / Expo Go)
proxy.on("upgrade", (req, clientSocket, head) => {
  const serverSocket = net.connect(EXPO_PORT, "127.0.0.1", () => {
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    serverSocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`
    );
    if (head && head.length) serverSocket.write(head);
    clientSocket.pipe(serverSocket);
    serverSocket.pipe(clientSocket);
  });

  serverSocket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => serverSocket.destroy());
});

proxy.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[dev-proxy] Listening on 0.0.0.0:${PORT} → forwarding to :${EXPO_PORT}`
  );

  const projectRoot = path.resolve(__dirname, "..");
  const expoCliArgs = process.argv.slice(2); // e.g. ["start", "--localhost"]
  const expoBin = path.join(projectRoot, "node_modules/.bin/expo");
  const expoCmd = [expoBin, ...expoCliArgs, "--port", String(EXPO_PORT)].join(" ");

  const expo = spawn(expoCmd, {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(EXPO_PORT) },
    stdio: "inherit",
    shell: true,
  });

  expo.on("exit", (code) => {
    process.exit(code ?? 0);
  });
});

proxy.on("error", (err) => {
  console.error("[dev-proxy] Proxy error:", err.message);
  process.exit(1);
});
