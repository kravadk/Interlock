import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = rootPackage.version ?? "0.0.0";
const outputDir = join(root, "release-artifacts", `v${version}`);

const packages = [
  { name: "@interlock/shared", dir: "packages/shared" },
  { name: "@interlock/firewall-sdk", dir: "packages/sdk" },
  { name: "@interlock/indexer", dir: "packages/indexer" },
  { name: "@interlock/mcp", dir: "packages/mcp" },
  { name: "@interlock/cli", dir: "packages/cli" },
];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const artifacts = [];

for (const pkg of packages) {
  const cwd = join(root, pkg.dir);
  const result = runPack(cwd, outputDir);
  const summary = JSON.parse(result.stdout.trim());

  if (!summary || summary.name !== pkg.name) {
    throw new Error(`Unexpected pack summary for ${pkg.name}: ${result.stdout}`);
  }

  const filename = resolve(cwd, summary.filename);
  const checksum = sha256(filename);
  artifacts.push({
    name: pkg.name,
    file: filename,
    checksum,
  });
}

const sums = artifacts.map((artifact) => `${artifact.checksum}  ${basename(artifact.file)}`).join("\n");
writeFileSync(join(outputDir, "SHA256SUMS.txt"), `${sums}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      version,
      outputDir: relative(root, outputDir).replaceAll("\\", "/"),
      artifacts: artifacts.map((artifact) => ({
        name: artifact.name,
        file: relative(root, artifact.file).replaceAll("\\", "/"),
        sha256: artifact.checksum,
      })),
      checksums: relative(root, join(outputDir, "SHA256SUMS.txt")).replaceAll("\\", "/"),
    },
    null,
    2,
  ),
);

function runPack(cwd, destination) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `pnpm pack --pack-destination ${quoteWindowsArg(destination)} --json`]
      : ["pack", "--pack-destination", destination, "--json"];

  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `pnpm pack failed in ${cwd}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  if (!result.stdout.trim()) throw new Error(`pnpm pack produced no JSON in ${cwd}`);
  return result;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function quoteWindowsArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
