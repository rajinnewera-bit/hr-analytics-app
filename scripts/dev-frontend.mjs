import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const cwd = process.cwd();
const args = process.argv.slice(2);
const port = readPort(args, process.env.PORT ?? "3001");
const hostname = readHostname(args, process.env.NEXT_DEV_HOST ?? "0.0.0.0");
const distDir = join(cwd, ".next-dev");

cleanupPort(port);
cleanupPath(distDir);

const nextBin = join(
  cwd,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

const nextArgs = ["dev", ...args];
if (!args.includes("--port") && !args.includes("-p")) {
  nextArgs.push("--port", port);
}
if (!args.includes("--hostname") && !args.includes("-H")) {
  nextArgs.push("--hostname", hostname);
}

const child = spawn(nextBin, nextArgs, {
  cwd,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
});

function readPort(argv, fallbackPort) {
  for (let index = 0; index < argv.length; index += 1) {
    if ((argv[index] === "--port" || argv[index] === "-p") && argv[index + 1]) {
      return argv[index + 1];
    }
  }
  return fallbackPort;
}

function readHostname(argv, fallbackHostname) {
  for (let index = 0; index < argv.length; index += 1) {
    if ((argv[index] === "--hostname" || argv[index] === "-H") && argv[index + 1]) {
      return argv[index + 1];
    }
  }
  return fallbackHostname;
}

function cleanupPath(targetPath) {
  if (existsSync(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true });
  }
}

function cleanupPort(portValue) {
  const pidResult = spawnSync("lsof", ["-ti", `tcp:${portValue}`], {
    encoding: "utf8"
  });
  const pids = pidResult.stdout
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  for (const pid of pids) {
    spawnSync("kill", ["-TERM", pid], { stdio: "ignore" });
  }

  if (pids.length > 0) {
    sleep(800);
    const remaining = spawnSync("lsof", ["-ti", `tcp:${portValue}`], {
      encoding: "utf8"
    }).stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);

    for (const pid of remaining) {
      spawnSync("kill", ["-KILL", pid], { stdio: "ignore" });
    }
  }
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
