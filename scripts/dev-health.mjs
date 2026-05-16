import { request } from "node:http";

const targets = [
  {
    name: "frontend",
    host: process.env.FRONTEND_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.FRONTEND_PORT ?? "3001", 10),
    path: "/",
    expectedStatus: 200,
    expectedBodySnippets: ["Upload", "Dashboard"]
  },
  {
    name: "backend",
    host: process.env.BACKEND_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.BACKEND_PORT ?? "8000", 10),
    path: "/openapi.json",
    expectedStatus: 200,
    expectedBodySnippets: ["openapi", "upload"]
  }
];

const maxAttempts = Number.parseInt(process.env.HEALTH_ATTEMPTS ?? "20", 10);
const delayMs = Number.parseInt(process.env.HEALTH_DELAY_MS ?? "1000", 10);

for (const target of targets) {
  const result = await waitForTarget(target, maxAttempts, delayMs);
  if (!result.ok) {
    console.error(`[health] ${target.name} failed: ${result.message}`);
    process.exit(1);
  }
  console.log(`[health] ${target.name} ok on http://${target.host}:${target.port}${target.path}`);
}

async function waitForTarget(target, attempts, delay) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await probeTarget(target);
    if (result.ok) {
      return result;
    }
    await sleep(delay);
  }
  return {
    ok: false,
    message: `did not become healthy after ${attempts} attempts`
  };
}

function probeTarget(target) {
  return new Promise((resolve) => {
    const req = request(
      {
        host: target.host,
        port: target.port,
        path: target.path,
        method: "GET",
        timeout: 5000
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const statusOk = res.statusCode === target.expectedStatus;
          const bodyOk = target.expectedBodySnippets.every((snippet) => body.includes(snippet));
          if (statusOk && bodyOk) {
            resolve({ ok: true });
            return;
          }
          resolve({
            ok: false,
            message: `unexpected response status=${res.statusCode ?? "unknown"}`
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({ ok: false, message: error.message });
    });
    req.end();
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
