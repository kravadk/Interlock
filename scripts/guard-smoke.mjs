import { createPublicClient, http } from "viem";

const guard = "0xd12a01a676f66c7660119e1c9a0fe3521ccdd564";
const rpc = process.env.MANTLE_RPC_URL ?? "https://rpc.sepolia.mantle.xyz";
const client = createPublicClient({ transport: http(rpc) });

const abi = [
  {
    type: "function",
    name: "previewExecute",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "policyId", type: "uint256" },
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "reasonCode", type: "uint8" },
    ],
  },
  { type: "function", name: "policyRegistry", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
];

const preview = (target, value, data) =>
  client.readContract({ address: guard, abi, functionName: "previewExecute", args: [1n, 1n, target, value, data] });

const reg = await client.readContract({ address: guard, abi, functionName: "policyRegistry" });
console.log("guard.policyRegistry =", reg);

// Non-allowlisted target (the attestation contract) → expect blocked.
console.log("blocked (non-allowlisted target):", await preview("0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3", 0n, "0x2de5aaf7"));
// agentRegistry + getAgent(1) selector — allowed iff Policy #1 allowlists it.
console.log(
  "agentRegistry getAgent(1):",
  await preview(
    "0xa8d6f3478b683ee674ff5a9167e6838c589162b4",
    0n,
    "0x2de5aaf70000000000000000000000000000000000000000000000000000000000000001",
  ),
);
