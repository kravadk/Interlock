import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifestPath = resolve(root, option("--manifest") ?? "deployments/mantle-sepolia/latest.json");
const explorerBaseUrl = (option("--explorer") ?? "https://sepolia.mantlescan.xyz").replace(/\/$/, "");
const apiUrl = option("--api-url") ?? process.env.ETHERSCAN_V2_API_URL ?? "https://api.etherscan.io/v2/api";
const apiKey = option("--api-key") ?? process.env.ETHERSCAN_API_KEY ?? process.env.MANTLESCAN_API_KEY;
const htmlDir = option("--html-dir");
const noFail = args.includes("--no-fail");
const apiOnly = args.includes("--api-only");

if (!existsSync(manifestPath)) {
  finish({
    ok: false,
    manifestPath,
    error: `Deployment manifest not found: ${manifestPath}`,
    contracts: [],
  });
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  const contracts = contractTargets(manifest);
  const results = [];

  for (const contract of contracts) {
    results.push(await checkContract(manifest, contract));
  }

  finish({
    ok: results.every((result) => result.verified),
    manifestPath,
    explorerBaseUrl,
    apiUrl: apiKey ? apiUrl : undefined,
    method: htmlDir ? "fixture-html" : apiKey ? "api-with-html-fallback" : "html",
    summary: {
      total: results.length,
      verified: results.filter((result) => result.verified).length,
      unverified: results.filter((result) => !result.verified).length,
    },
    contracts: results,
  });
}

async function checkContract(manifest, contract) {
  if (apiKey) {
    const apiResult = await checkViaApi(manifest, contract);
    if (apiResult.ok || apiOnly) return apiResult;
  }

  if (apiOnly) {
    return {
      ...contract,
      verified: false,
      method: "api",
      detail: "API key is missing and --api-only was used.",
    };
  }

  return checkViaHtml(contract);
}

async function checkViaApi(manifest, contract) {
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      chainid: String(manifest.chainId),
      module: "contract",
      action: "getsourcecode",
      address: contract.address,
    });
    const response = await fetch(`${apiUrl}?${params.toString()}`);
    const json = await response.json();
    const first = Array.isArray(json.result) ? json.result[0] : undefined;
    const sourceCode = String(first?.SourceCode ?? "");
    const abi = String(first?.ABI ?? "");
    const verified = json.status === "1" && sourceCode.trim().length > 0 && !abi.toLowerCase().includes("not verified");

    return {
      ...contract,
      verified,
      ok: verified,
      method: "api",
      detail: verified ? "Source code returned by explorer API." : String(json.result ?? json.message ?? "No source code returned."),
    };
  } catch (error) {
    return {
      ...contract,
      verified: false,
      ok: false,
      method: "api",
      detail: errorMessage(error),
    };
  }
}

async function checkViaHtml(contract) {
  try {
    const html = htmlDir
      ? readFileSync(resolve(root, htmlDir, `${contract.label}.html`), "utf8")
      : await fetchText(`${explorerBaseUrl}/address/${contract.address}#code`);
    const status = inferHtmlVerificationStatus(html);
    return {
      ...contract,
      verified: status.verified,
      ok: status.verified,
      method: htmlDir ? "fixture-html" : "html",
      explorerUrl: `${explorerBaseUrl}/address/${contract.address}#code`,
      detail: status.detail,
    };
  } catch (error) {
    return {
      ...contract,
      verified: false,
      ok: false,
      method: htmlDir ? "fixture-html" : "html",
      explorerUrl: `${explorerBaseUrl}/address/${contract.address}#code`,
      detail: errorMessage(error),
    };
  }
}

function inferHtmlVerificationStatus(html) {
  const normalized = html.toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes("unverified")) {
    return { verified: false, detail: normalized.includes("similar match") ? "Explorer reports unverified source with similar match only." : "Explorer reports unverified source." };
  }
  if (
    normalized.includes("contract source code verified") ||
    (normalized.includes("contract source code") && normalized.includes("contract abi")) ||
    (normalized.includes("read contract") && normalized.includes("write contract"))
  ) {
    return { verified: true, detail: "Explorer page appears to expose verified contract source/ABI." };
  }
  return { verified: false, detail: "Could not confidently detect verified source on explorer page." };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function contractTargets(manifest) {
  return [
    {
      label: "AgentRegistry",
      address: manifest.addresses?.agentRegistry,
    },
    {
      label: "PolicyRegistry",
      address: manifest.addresses?.policyRegistry,
    },
    {
      label: "ActionAttestation",
      address: manifest.addresses?.actionAttestation,
    },
  ].filter((contract) => isAddress(contract.address));
}

function finish(report) {
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && !noFail) {
    process.exitCode = 1;
  }
}

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
