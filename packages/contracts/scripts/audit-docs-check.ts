import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const artifactsDir = path.resolve(import.meta.dirname, "..", "artifacts");
const coreContracts = new Set([
  "ActionAttestation",
  "ActionAttestationV2",
  "AgentRegistry",
  "AttestorCommittee",
  "DisputeEscrow",
  "PolicyGuardedExecutor",
  "PolicyRegistry",
  "ReputationOracle",
]);

const files = await readdir(artifactsDir);
const failures: string[] = [];

for (const file of files) {
  if (!file.endsWith(".json")) continue;
  const artifact = JSON.parse(await readFile(path.join(artifactsDir, file), "utf8"));
  if (!coreContracts.has(artifact.contractName)) continue;

  if (!artifact.userdoc || typeof artifact.userdoc !== "object") {
    failures.push(`${artifact.contractName}: missing userdoc object`);
  }
  if (!artifact.devdoc || typeof artifact.devdoc !== "object") {
    failures.push(`${artifact.contractName}: missing devdoc object`);
  }
}

for (const contractName of coreContracts) {
  if (!files.includes(`${contractName}.json`)) failures.push(`${contractName}: missing artifact`);
}

if (failures.length > 0) {
  console.error("Contract audit docs check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Contract audit docs check passed for ${coreContracts.size} core contracts.`);
