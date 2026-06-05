import {
  InterlockFirewall,
  createAgentFirewallTool,
  evaluatePolicy,
  withInterlockFirewall,
} from "../packages/sdk/dist/index.js";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "../packages/shared/dist/index.js";

const requiredSdkExports = {
  InterlockFirewall,
  createAgentFirewallTool,
  evaluatePolicy,
  withInterlockFirewall,
};

for (const [name, value] of Object.entries(requiredSdkExports)) {
  if (typeof value !== "function") {
    throw new Error(`Missing SDK function export: ${name}`);
  }
}

if (mantleSepolia.id !== 5003) {
  throw new Error(`Unexpected Mantle Sepolia chain id: ${mantleSepolia.id}`);
}

if (!deployedAddresses.mantleSepolia || !Array.isArray(agentRegistryAbi)) {
  throw new Error("Missing shared package exports.");
}

console.log("Package smoke passed");
