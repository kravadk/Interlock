import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const gitCheck = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (gitCheck.status !== 0 || gitCheck.stdout.trim() !== "true") {
  console.log("Changeset status skipped: this workspace is not a Git repository checkout.");
  console.log("CI release-check runs changeset status after actions/checkout provides git history.");
  process.exit(0);
}

const since = process.env.CHANGESET_SINCE ?? "main";
const status = spawnSync(pnpm, ["changeset", "status", "--verbose", "--since", since], {
  stdio: "inherit",
  shell: false,
});

process.exit(status.status ?? 1);
