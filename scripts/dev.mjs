import { spawn } from "node:child_process";

const commands = [
  {
    name: "server",
    command: "npm",
    args: ["--workspace", "server", "run", "dev"],
  },
  {
    name: "client",
    command: "npm",
    args: ["--workspace", "client", "run", "dev"],
  },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: "pipe",
    shell: false,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
      stopAll();
    }
  });

  return child;
});

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});
