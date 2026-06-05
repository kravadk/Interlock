import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const packages = [
  {
    name: "@interlock/shared",
    dir: "packages/shared",
    required: ["dist/index.js", "dist/index.d.ts", "README.md"],
  },
  {
    name: "@interlock/firewall-sdk",
    dir: "packages/sdk",
    required: ["dist/index.js", "dist/index.d.ts", "dist/firewall.js", "dist/agent-adapter.js", "README.md"],
  },
  {
    name: "@interlock/indexer",
    dir: "packages/indexer",
    required: ["dist/index.js", "dist/index.d.ts", "dist/server.js", "README.md"],
  },
  {
    name: "@interlock/mcp",
    dir: "packages/mcp",
    required: ["dist/index.js", "dist/index.d.ts", "README.md"],
    bin: "dist/index.js",
    binName: "interlock-mcp",
  },
  {
    name: "@interlock/cli",
    dir: "packages/cli",
    required: ["dist/index.js", "dist/index.d.ts", "README.md"],
    bin: "dist/index.js",
    binName: "interlock",
  },
];

function runPackDryRun(pkg) {
  const cwd = join(root, pkg.dir);
  const destination = join(cwd, ".pack-smoke");
  rmSync(destination, { recursive: true, force: true });
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm pack --pack-destination .pack-smoke --json"]
      : ["pack", "--pack-destination", ".pack-smoke", "--json"];

  try {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new Error(
        `pnpm pack failed for ${pkg.name}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      );
    }

    const output = result.stdout.trim();
    if (!output) {
      throw new Error(`pnpm pack produced no JSON for ${pkg.name}`);
    }

    const summary = JSON.parse(output);
    if (!summary || summary.name !== pkg.name) {
      throw new Error(`Unexpected pack summary for ${pkg.name}: ${output}`);
    }

    return {
      files: summary.files.map((file) => file.path.replaceAll("\\", "/")),
      packedPackageJson: readPackedPackageJson(summary.filename),
    };
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

for (const pkg of packages) {
  const cwd = join(root, pkg.dir);
  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const { files, packedPackageJson } = runPackDryRun(pkg);
  const fileSet = new Set(files);

  for (const requiredFile of pkg.required) {
    if (!existsSync(join(cwd, requiredFile))) {
      throw new Error(`${pkg.name} is missing built file ${requiredFile}`);
    }
    if (!fileSet.has(requiredFile)) {
      throw new Error(`${pkg.name} pack output does not include ${requiredFile}`);
    }
  }

  const unexpected = files.filter((file) => file.startsWith("src/") || file.includes(".test."));
  if (unexpected.length > 0) {
    throw new Error(`${pkg.name} pack output includes source/test files: ${unexpected.join(", ")}`);
  }

  if (packedPackageJson.private === true) {
    throw new Error(`${pkg.name} packed package.json is private.`);
  }

  assertNoWorkspaceDependencies(pkg.name, packedPackageJson);

  if (pkg.bin) {
    const binPath = packageJson.bin?.[pkg.binName ?? "interlock"];
    if (binPath !== pkg.bin) {
      throw new Error(`${pkg.name} bin path mismatch: expected ${pkg.bin}, got ${binPath}`);
    }
    const binContents = readFileSync(join(cwd, pkg.bin), "utf8");
    if (!binContents.startsWith("#!/usr/bin/env node")) {
      throw new Error(`${pkg.name} CLI bin is missing node shebang`);
    }
  }

  console.log(`${pkg.name} pack smoke passed (${files.length} files)`);
}

function readPackedPackageJson(filename) {
  const result = spawnSync("tar", ["-xOf", filename, "package/package.json"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to read packed package.json from ${filename}\n${result.stderr ?? ""}`);
  }

  return JSON.parse(result.stdout);
}

function assertNoWorkspaceDependencies(name, packageJson) {
  const dependencyFields = ["dependencies", "peerDependencies", "optionalDependencies"];

  for (const field of dependencyFields) {
    const entries = Object.entries(packageJson[field] ?? {});
    const workspaceEntries = entries.filter(([, version]) => String(version).startsWith("workspace:"));
    if (workspaceEntries.length > 0) {
      throw new Error(
        `${name} packed package.json contains workspace dependencies in ${field}: ${workspaceEntries
          .map(([dependency]) => dependency)
          .join(", ")}`,
      );
    }
  }
}
