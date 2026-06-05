import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, parseEther } from "viem";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const node = process.execPath;
const cli = resolve(root, "packages/cli/dist/index.js");
const target = "0xe4dfef03e107225f2239cfff955a378a9a8158be";

const sdk = await import("../packages/sdk/dist/index.js");

expectThrows(
  () =>
    sdk.evaluatePolicy({
      targetAllowed: true,
      selectorAllowed: true,
      simulationSuccess: true,
      expectedSlippageBps: -50,
      tx: { value: 0n, data: "0x12345678" },
      policy: {
        owner: target,
        agentId: 1n,
        maxNativeValue: parseEther("0.01"),
        maxSlippageBps: 100,
        active: true,
      },
    }),
  "negative expectedSlippageBps must throw",
);

expectThrows(() => sdk.calldataHash("0x0"), "odd-length calldata must throw");
assert(sdk.calldataHash("0x") === keccak256("0x"), "empty calldata hash must equal keccak256(0x)");
assert(sdk.calldataHash("0x") !== sdk.calldataHash("0x00"), "empty calldata and zero byte calldata must hash differently");

expectThrows(
  () =>
    sdk.validatePolicyPack({
      version: "interlock.policy.v1",
      name: "bad",
      maxNativeValue: "1",
      maxSlippageBps: 20_000,
      targets: [{ address: target }],
      selectors: [{ selector: "0x12345678" }],
    }),
  "policy pack slippage above 10000 must throw",
);

expectCliFail(["preflight", "--agent-id", "1", "--policy-id", "1", "--to", target, "--value", "0", "--data", "0x0"], "Input error");
expectCliFail(["preflight", "--agent-id", "1", "--policy-id", "1", "--to", target, "--value", "-1", "--data", "0x"], "Input error");
expectCliFail(
  ["preflight", "--agent-id", "1", "--policy-id", "1", "--to", target, "--value", "0", "--data", "0x", "--slippage-bps", "-1"],
  "Input error",
);
expectCliFail(["policy-pack", "--name", "conservative-defi", "--target", target, "--max-native", "0.01", "--max-slippage-bps", "20000"], "Input error");

console.log("Adversarial smoke passed");

function expectCliFail(args, expectedText) {
  const result = spawnSync(node, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert(result.status !== 0, `Expected CLI command to fail: ${args.join(" ")}`);
  assert(
    `${result.stdout}\n${result.stderr}`.includes(expectedText),
    `Expected CLI failure to include ${expectedText}, got:\n${result.stdout}\n${result.stderr}`,
  );
}

function expectThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
