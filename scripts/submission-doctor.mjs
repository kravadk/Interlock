import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { liveBundleCommand } from "./submission-defaults.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const requireLive = args.includes("--require-live");
const requireFinalLinks = args.includes("--require-final-links");
const noFail = args.includes("--no-fail");

const requiredFiles = [
  "README.md",
  ".env.example",
  "SECURITY.md",
  "LICENSE",
  "package.json",
  ".github/workflows/ci.yml",
  "packages/contracts/contracts/AgentRegistry.sol",
  "packages/contracts/contracts/PolicyRegistry.sol",
  "packages/contracts/contracts/ActionAttestation.sol",
  "packages/sdk/src/index.ts",
  "packages/mcp/src/index.ts",
  "packages/cli/src/index.ts",
  "packages/indexer/src/index.ts",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/app/page.tsx",
  "apps/web/src/app/docs/[[...slug]]/page.tsx",
  "apps/web/src/app/changelog/page.tsx",
  "apps/web/src/app/manifest.ts",
  "apps/web/src/app/opengraph-image.tsx",
  "apps/web/public/.well-known/security.txt",
  "examples/raw-viem/README.md",
  "examples/agent-framework/README.md",
  "examples/goat-adapter/README.md",
  "examples/agentkit-adapter/README.md",
  "examples/vercel-ai-adapter/README.md",
  "examples/langchain-adapter/README.md",
  "examples/backend-automation/README.md",
  "examples/preflight-api/README.md",
  "schemas/policy-pack.schema.json",
  "policies/conservative-defi.example.json",
  "docs/getting-started.md",
  "docs/integration-guide.md",
  "docs/api-reference.md",
  "docs/architecture.md",
  "docs/product-logic.md",
  "docs/competitive-analysis.md",
  "docs/competitive-landscape.md",
  "docs/mcp.md",
  "docs/benchmark-arena.md",
  "docs/deployment.md",
  "docs/threat-model.md",
  "docs/demo-runbook.md",
  "docs/demo-video-script.md",
  "docs/hosting.md",
  "docs/contract-verification.md",
  "docs/package-release.md",
  "docs/production-roadmap.md",
  "docs/wallet-qa-checklist.md",
  "docs/submission-package.md",
  "docs/dorahacks-requirements-audit.md",
  "docs/screenshots/dashboard-desktop-qa.png",
  "docs/screenshots/dashboard-mobile-qa.png",
  "docs/screenshots/dashboard-judge-qa.png",
  "docs/submission-readiness.md",
  ".changeset/config.json",
  ".github/workflows/release.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
];

const requiredScripts = [
  "build",
  "check",
  "test",
  "smoke:all",
  "smoke:pack",
  "smoke:consumer",
  "web:smoke",
  "browser:qa",
  "screenshots:capture",
  "security:slither",
  "security:adversarial",
  "deployment:manifest:doctor",
  "deployment:manifest:test",
  "deployment:manifest:env",
  "deployment:manifest:env:test",
  "deployment:report",
  "deployment:report:test",
  "live:verify",
  "live:verify:test",
  "live:readiness",
  "live:readiness:test",
  "live:services",
  "live:demo",
  "live:demo:check",
  "live:demo:test",
  "deploy:preflight",
  "deploy:mantle-sepolia",
  "contracts:verify",
  "contracts:verify:export",
  "contracts:verify:test",
  "contracts:verification-status",
  "contracts:verification-status:test",
  "live:smoke",
  "dev",
  "indexer",
  "cli",
  "cli:built",
  "mcp",
  "mcp:check",
  "docs:links",
  "submission:doctor",
  "submission:doctor:final",
  "submission:bundle",
  "submission:bundle:test",
  "release:check",
  "release:pack",
  "release:draft",
  "release:dry",
  "release:changeset:check",
];

const requiredEnvKeys = [
  "MANTLE_RPC_URL",
  "PRIVATE_KEY",
  "AGENT_REGISTRY",
  "POLICY_REGISTRY",
  "ACTION_ATTESTATION",
  "ACTION_TARGET",
  "INDEXER_URL",
  "NEXT_PUBLIC_MANTLE_RPC_URL",
  "NEXT_PUBLIC_AGENT_REGISTRY",
  "NEXT_PUBLIC_POLICY_REGISTRY",
  "NEXT_PUBLIC_ACTION_ATTESTATION",
  "NEXT_PUBLIC_POLICY_GUARDED_EXECUTOR",
  "NEXT_PUBLIC_DISPUTE_ESCROW",
  "NEXT_PUBLIC_REPUTATION_ORACLE",
  "NEXT_PUBLIC_ACTION_ATTESTATION_FROM_BLOCK",
  "NEXT_PUBLIC_INDEXER_URL",
];

const report = buildReport();
console.log(JSON.stringify(report, null, 2));

if (!report.ok && !noFail) {
  process.exitCode = 1;
}

function buildReport() {
  const checks = [];

  for (const file of requiredFiles) {
    checks.push({
      name: `file:${file}`,
      ok: existsSync(resolve(root, file)),
      severity: "required",
    });
  }

  const packageJson = readJson("package.json");
  if (packageJson.ok) {
    for (const script of requiredScripts) {
      checks.push({
        name: `script:${script}`,
        ok: Boolean(packageJson.value.scripts?.[script]),
        severity: "required",
      });
    }
  } else {
    checks.push({
      name: "package-json-parse",
      ok: false,
      severity: "required",
      detail: packageJson.error,
    });
  }

  const envExample = readText(".env.example");
  if (envExample.ok) {
    for (const key of requiredEnvKeys) {
      checks.push({
        name: `env:${key}`,
        ok: new RegExp(`(^|\\n)${escapeRegExp(key)}=`).test(envExample.value),
        severity: "required",
      });
    }
  }

  const policySchema = readJson("schemas/policy-pack.schema.json");
  checks.push({
    name: "policy-pack-schema-valid-json",
    ok: policySchema.ok,
    severity: "required",
    detail: policySchema.error,
  });

  const policyExample = readJson("policies/conservative-defi.example.json");
  checks.push({
    name: "policy-example-valid-json",
    ok: policyExample.ok,
    severity: "required",
    detail: policyExample.error,
  });

  if (policyExample.ok) {
    checks.push({
      name: "policy-example-has-targets-and-selectors",
      ok: Array.isArray(policyExample.value.targets) &&
        policyExample.value.targets.length > 0 &&
        Array.isArray(policyExample.value.selectors) &&
        policyExample.value.selectors.length > 0,
      severity: "required",
    });
  }

  const manifest = readJson("deployments/mantle-sepolia/latest.json");
  const liveSeverity = requireLive ? "required" : "optional";
  checks.push({
    name: "live-manifest-present",
    ok: manifest.ok,
    severity: liveSeverity,
    detail: manifest.error,
  });

  if (manifest.ok) {
    for (const check of checkManifest(manifest.value)) {
      checks.push({ ...check, severity: liveSeverity });
    }
  }

  if (requireFinalLinks) {
    const bundle = readText("submission/interlock-firewall-submission.md");
    checks.push({
      name: "final-submission-bundle-present",
      ok: bundle.ok,
      severity: "required",
      detail: bundle.error,
    });

    if (bundle.ok) {
      for (const check of checkFinalSubmissionLinks(bundle.value)) {
        checks.push({ ...check, severity: "required" });
      }
    }
  }

  const requiredFailures = checks.filter((check) => check.severity === "required" && !check.ok);
  const optionalFailures = checks.filter((check) => check.severity === "optional" && !check.ok);

  return {
    ok: requiredFailures.length === 0,
    requireLive,
    requireFinalLinks,
    summary: {
      total: checks.length,
      passed: checks.filter((check) => check.ok).length,
      requiredFailures: requiredFailures.length,
      optionalFailures: optionalFailures.length,
    },
    nextCommands: [
      "pnpm check",
      "pnpm test",
      "pnpm smoke:all",
      "pnpm deploy:preflight",
      "pnpm deploy:mantle-sepolia",
      "pnpm deployment:manifest:doctor",
      "pnpm live:smoke",
      liveBundleCommand(),
      "pnpm submission:doctor:final",
    ],
    checks,
  };
}

function checkManifest(manifest) {
  const checks = [
    { name: "live-manifest-chain", ok: manifest.chain === "mantleSepolia" },
    { name: "live-manifest-chain-id", ok: manifest.chainId === 5003 },
    {
      name: "live-manifest-policy-registry-compatibility",
      ok: manifest.compatibility?.policyRegistry?.version === "1.2.0" &&
        manifest.compatibility?.policyRegistry?.supportsPolicyEnumeration === true,
    },
  ];

  const addresses = manifest.addresses ?? {};
  for (const key of ["agentRegistry", "policyRegistry", "actionAttestation"]) {
    checks.push({
      name: `live-address:${key}`,
      ok: isAddress(addresses[key]) && addresses[key] !== "0x0000000000000000000000000000000000000000",
    });
  }

  return checks;
}

function readText(path) {
  try {
    return { ok: true, value: readFileSync(resolve(root, path), "utf8") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readJson(path) {
  const text = readText(path);
  if (!text.ok) return text;

  try {
    return { ok: true, value: JSON.parse(text.value.replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function checkFinalSubmissionLinks(markdown) {
  const repository = fieldValue(markdown, "Repository");
  const dashboard = fieldValue(markdown, "Dashboard");
  const demoVideo = fieldValue(markdown, "Demo video");

  return [
    {
      name: "final-link:repository",
      ok: isHttpUrl(repository) && !isTodo(repository),
      detail: repository || "Missing Repository field",
    },
    {
      name: "final-link:dashboard",
      ok: isHttpUrl(dashboard) && !isTodo(dashboard) && !dashboard.includes("127.0.0.1") && !dashboard.includes("localhost"),
      detail: dashboard || "Missing Dashboard field",
    },
    {
      name: "final-link:demo-video",
      ok: isHttpUrl(demoVideo) && !isTodo(demoVideo),
      detail: demoVideo || "Missing Demo video field",
    },
  ];
}

function fieldValue(markdown, label) {
  const escaped = escapeRegExp(label);
  const match = markdown.match(new RegExp(`^- ${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(value);
}

function isTodo(value) {
  return /\bTODO\b|add final|add deployed|add demo/i.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
