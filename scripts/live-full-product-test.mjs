import { createPublicClient, getAddress, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  InterlockFirewall,
  actionableError,
  agentRegistryGetAgentCalldata,
  agentRegistryGetAgentSelector,
} from "../packages/sdk/dist/index.js";
import { deployedAddresses, mantleSepolia } from "../packages/shared/dist/index.js";

const zeroAddress = "0x0000000000000000000000000000000000000000";
const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const contracts = {
  agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
  policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
  actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
};

if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
  throw new Error("Set PRIVATE_KEY in .env before running the full live product test.");
}

for (const [name, address] of Object.entries(contracts)) {
  if (!isAddress(address) || address === zeroAddress) {
    throw new Error(`Missing ${name}. Set ${name.toUpperCase()} in env or update shared deployed addresses.`);
  }
}

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
const firewall = new InterlockFirewall({
  chain: mantleSepolia,
  rpcUrl,
  privateKey,
  contracts,
});

const evidence = {
  network: {},
  policyEngine: {},
  actionSimulator: {},
  firewallDecision: {},
  flightRecorder: {},
  reputation: {},
};

try {
  await verifyNetwork();

  const agent = await firewall.registerAgentAndWait({
    metadataURI: `ipfs://interlock-full-live-test-${Date.now()}`,
  });
  assert(agent.agentId > 0n, "AgentRegistry did not return a live agent id.");

  const selector = agentRegistryGetAgentSelector;
  const policy = await firewall.createPolicyAndWait({
    agentId: agent.agentId,
    maxNativeValue: parseEther("0.02"),
    maxSlippageBps: 100,
    targets: [contracts.agentRegistry],
    selectors: [selector],
  });
  assert(policy.policyId > 0n, "PolicyRegistry did not return a live policy id.");

  const policyDetail = await waitForPolicy(policy.policyId);
  const [targetAllowed, selectorAllowed, allowedTargets, allowedSelectors] = await Promise.all([
    firewall.isTargetAllowed(policy.policyId, contracts.agentRegistry),
    firewall.isSelectorAllowed(policy.policyId, selector),
    firewall.getAllowedTargets(policy.policyId),
    firewall.getAllowedSelectors(policy.policyId),
  ]);

  assert(policyDetail.agentId === agent.agentId, "Created policy belongs to a different agent.");
  assert(policyDetail.maxNativeValue === parseEther("0.02"), "Policy maxNativeValue mismatch.");
  assert(policyDetail.maxSlippageBps === 100, "Policy maxSlippageBps mismatch.");
  assert(policyDetail.active === true, "Policy should be active.");
  assert(targetAllowed, "Allowed target was not allowlisted.");
  assert(selectorAllowed, "Allowed selector was not allowlisted.");
  assert(allowedTargets.some((target) => sameAddress(target, contracts.agentRegistry)), "Enumerable targets missed AgentRegistry.");
  assert(allowedSelectors.map((item) => item.toLowerCase()).includes(selector.toLowerCase()), "Enumerable selectors missed getAgent selector.");

  evidence.policyEngine = {
    agentId: agent.agentId.toString(),
    policyId: policy.policyId.toString(),
    registerTx: agent.transactionHash,
    policyTx: policy.transactionHash,
    maxNativeValue: policyDetail.maxNativeValue.toString(),
    maxSlippageBps: policyDetail.maxSlippageBps,
    active: policyDetail.active,
    allowedTargetCount: allowedTargets.length,
    allowedSelectorCount: allowedSelectors.length,
  };

  const safeAction = action(agent.agentId, policy.policyId, {
    to: contracts.agentRegistry,
    value: 0n,
    data: agentRegistryGetAgentCalldata(agent.agentId),
    expectedSlippageBps: 0,
    intent: "Safe read against an allowlisted AgentRegistry function.",
  });
  const overspendAction = action(agent.agentId, policy.policyId, {
    to: contracts.agentRegistry,
    value: parseEther("0.25"),
    data: agentRegistryGetAgentCalldata(agent.agentId),
    expectedSlippageBps: 0,
    intent: "Overspend attempt against an allowlisted target.",
  });
  const unknownTargetAction = action(agent.agentId, policy.policyId, {
    to: contracts.policyRegistry,
    value: 0n,
    data: "0x",
    expectedSlippageBps: 0,
    intent: "Unknown target should be blocked by policy.",
  });
  const slippageAction = action(agent.agentId, policy.policyId, {
    to: contracts.agentRegistry,
    value: 0n,
    data: agentRegistryGetAgentCalldata(agent.agentId),
    expectedSlippageBps: 500,
    intent: "Slippage metadata exceeds policy limit.",
  });
  const failedSimulationAction = action(agent.agentId, policy.policyId, {
    to: contracts.agentRegistry,
    value: 0n,
    data: agentRegistryGetAgentCalldata(agent.agentId + 999999999n),
    expectedSlippageBps: 0,
    intent: "Allowlisted call that reverts during eth_call simulation.",
  });

  const decisions = {
    safe: await firewall.checkAction(safeAction),
    overspend: await firewall.checkAction(overspendAction),
    unknownTarget: await firewall.checkAction(unknownTargetAction),
    slippage: await firewall.checkAction(slippageAction),
    failedSimulation: await firewall.checkAction(failedSimulationAction),
  };

  expectDecision(decisions.safe, true, "ALLOW", "POLICY_PASSED");
  expectDecision(decisions.overspend, false, "BLOCK", "VALUE_LIMIT_EXCEEDED");
  expectDecision(decisions.unknownTarget, false, "BLOCK", "TARGET_NOT_ALLOWED");
  expectDecision(decisions.slippage, false, "BLOCK", "SLIPPAGE_LIMIT_EXCEEDED");
  expectDecision(decisions.failedSimulation, false, "BLOCK", "SIMULATION_FAILED");

  evidence.actionSimulator = {
    safeSimulation: decisions.safe.simulation.success,
    failedSimulation: decisions.failedSimulation.simulation.success,
    failedSimulationHasError: Boolean(decisions.failedSimulation.simulation.error),
    safeSelector: decisions.safe.selector,
    failedSelector: decisions.failedSimulation.selector,
  };
  evidence.firewallDecision = Object.fromEntries(
    Object.entries(decisions).map(([name, decision]) => [
      name,
      {
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        allowed: decision.allowed,
        riskScore: decision.riskScore,
      },
    ]),
  );

  const recorded = {};
  for (const [name, decision] of Object.entries(decisions)) {
    const result = await firewall.recordDecisionAndWait(decision);
    recorded[name] = {
      actionCheckId: result.actionCheckId.toString(),
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber.toString(),
    };
  }

  const expectedReasons = new Set([
    "POLICY_PASSED",
    "VALUE_LIMIT_EXCEEDED",
    "TARGET_NOT_ALLOWED",
    "SLIPPAGE_LIMIT_EXCEEDED",
    "SIMULATION_FAILED",
  ]);
  const history = await waitForActionHistory({
    agentId: agent.agentId,
    policyId: policy.policyId,
    fromBlock: BigInt(recorded.safe.blockNumber),
    expectedReasons,
  });

  evidence.flightRecorder = {
    recorded,
    historyCount: history.length,
    reasons: [...new Set(history.map((entry) => entry.reasonCode))],
  };

  const stats = await waitForAgentStats(agent.agentId);
  assert(stats.allowedActions === 1n, `Expected 1 allowed action, got ${stats.allowedActions}.`);
  assert(stats.blockedActions === 4n, `Expected 4 blocked actions, got ${stats.blockedActions}.`);
  assert(stats.failedSimulations === 1n, `Expected 1 failed simulation, got ${stats.failedSimulations}.`);

  evidence.reputation = {
    owner: stats.owner,
    allowedActions: stats.allowedActions.toString(),
    blockedActions: stats.blockedActions.toString(),
    failedSimulations: stats.failedSimulations.toString(),
  };

  console.log("Interlock Firewall full live product test passed");
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  const actionable = actionableError(error);
  console.error(
    JSON.stringify(
      {
        ok: false,
        ...actionable,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

async function verifyNetwork() {
  const [chainId, balance] = await Promise.all([publicClient.getChainId(), publicClient.getBalance({ address: account.address })]);
  assert(chainId === mantleSepolia.id, `Wrong chain id ${chainId}. Expected ${mantleSepolia.id}.`);
  assert(balance > 0n, "PRIVATE_KEY account has zero Mantle Sepolia balance.");

  const bytecodes = await Promise.all(
    Object.entries(contracts).map(async ([name, address]) => ({
      name,
      address,
      bytecode: await publicClient.getBytecode({ address }),
    })),
  );
  for (const item of bytecodes) {
    assert(item.bytecode && item.bytecode !== "0x", `No bytecode at ${item.name}: ${item.address}.`);
  }

  evidence.network = {
    chainId,
    account: account.address,
    balanceWei: balance.toString(),
    contracts,
  };
}

function action(agentId, policyId, input) {
  return {
    agentId,
    policyId,
    tx: {
      to: input.to,
      value: input.value,
      data: input.data,
    },
    metadata: {
      intent: input.intent,
      expectedSlippageBps: input.expectedSlippageBps,
    },
  };
}

async function waitForAgentStats(agentId) {
  let last;
  for (let attempt = 1; attempt <= 12; attempt++) {
    last = await firewall.getAgentStats(agentId);
    if (last.allowedActions === 1n && last.blockedActions === 4n && last.failedSimulations === 1n) {
      return last;
    }
    await sleep(2_000);
  }
  return last;
}

async function waitForActionHistory({ agentId, policyId, fromBlock, expectedReasons }) {
  const deadline = Date.now() + 90_000;
  let lastHistory = [];

  while (Date.now() < deadline) {
    lastHistory = await firewall.getActionHistory({ agentId, policyId, fromBlock });
    const missing = [...expectedReasons].filter((reason) => !lastHistory.some((entry) => entry.reasonCode === reason));
    if (missing.length === 0) {
      return lastHistory;
    }
    await sleep(3_000);
  }

  const missing = [...expectedReasons].filter((reason) => !lastHistory.some((entry) => entry.reasonCode === reason));
  throw new Error(`Flight Recorder history missing ${missing.join(", ")}.`);
}

async function waitForPolicy(policyId) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      return await firewall.getPolicy(policyId);
    } catch (error) {
      lastError = error;
      await sleep(2_000);
    }
  }
  throw lastError ?? new Error(`Policy ${policyId} was not readable after waiting for RPC consistency.`);
}

function expectDecision(decision, allowed, decisionName, reasonCode) {
  assert(decision.allowed === allowed, `Expected allowed=${allowed} for ${reasonCode}, got ${decision.allowed}.`);
  assert(decision.decision === decisionName, `Expected decision=${decisionName}, got ${decision.decision}.`);
  assert(decision.reasonCode === reasonCode, `Expected reason=${reasonCode}, got ${decision.reasonCode}.`);
}

function envAddress(name, defaultAddress) {
  const value = process.env[name] ?? defaultAddress;
  return getAddress(value);
}

function sameAddress(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
