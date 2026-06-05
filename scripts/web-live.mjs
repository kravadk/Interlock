import { spawn } from "node:child_process";

process.env.PORT = process.env.WEB_PORT ?? "3000";

await run("pnpm", ["build:packages"]);

const child = spawnCommand("pnpm", ["--filter", "@interlock/web", "dev"]);

const spawned = spawn(child.command, child.args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

spawned.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Web server terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

spawned.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

function spawnCommand(value, commandArgs) {
  if (process.platform !== "win32") {
    return { command: value, args: commandArgs };
  }

  const commandLine = [value, ...commandArgs].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function quoteWindowsArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

function run(command, args) {
  const child = spawnCommand(command, args);
  return new Promise((resolve, reject) => {
    const spawned = spawn(child.command, child.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    spawned.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`${command} exited with ${code}`));
        return;
      }
      resolve();
    });

    spawned.on("error", reject);
  });
}
