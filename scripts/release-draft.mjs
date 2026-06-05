#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const runtimePackages = [
  "packages/shared",
  "packages/sdk",
  "packages/indexer",
  "packages/cli",
  "packages/mcp",
];

const packageSummaries = runtimePackages.map((relativePath) => {
  const pkg = JSON.parse(readFileSync(path.join(root, relativePath, "package.json"), "utf8"));
  return {
    name: pkg.name,
    version: pkg.version,
    path: relativePath,
    bin: pkg.bin ? Object.keys(pkg.bin) : [],
    files: pkg.files ?? [],
  };
});

const tarballs = findTarballs(root).map((file) => ({
  file: path.relative(root, file).replaceAll("\\", "/"),
  sha256: sha256(file),
}));

const markdown = [
  `# Interlock Release Draft v${packageJson.version}`,
  "",
  "## Positioning",
  "",
  "Mantle Agent Safety & Benchmark Control Plane for autonomous AI agents.",
  "",
  "## Runtime Packages",
  "",
  ...packageSummaries.map((pkg) => `- \`${pkg.name}@${pkg.version}\` (${pkg.path})${pkg.bin.length ? ` - bin: ${pkg.bin.join(", ")}` : ""}`),
  "",
  "## Required Gates",
  "",
  "- `pnpm check`",
  "- `pnpm test`",
  "- `pnpm smoke:all`",
  "- `pnpm security:adversarial`",
  "- `pnpm smoke:pack`",
  "",
  "## Tarball Checksums",
  "",
  ...(tarballs.length ? tarballs.map((item) => `- \`${item.file}\` - \`${item.sha256}\``) : ["- No package tarballs found yet. Run `pnpm smoke:pack` first."]),
  "",
  "## Demo Flow",
  "",
  "1. Run `interlock doctor --no-fail`.",
  "2. Run `interlock benchmark run --agent-id <id> --policy-id <id>`.",
  "3. Open the dashboard and `/agent/:id` safety card.",
  "4. Show Mantle Sepolia attestations and copy SDK/MCP snippets.",
  "",
].join("\n");

console.log(markdown);

function findTarballs(directory) {
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTarballs(fullPath));
    } else if (entry.name.endsWith(".tgz")) {
      files.push(fullPath);
    }
  }
  return files;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
