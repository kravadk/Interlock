# Contract Verification

The current Mantle Sepolia Dev Alpha deployment is live, but explorer source verification may still need to be completed through Mantlescan UI or an explorer API key.

Mantle Sepolia explorer:

- [AgentRegistry](https://sepolia.mantlescan.xyz/address/0xa8d6f3478b683ee674ff5a9167e6838c589162b4)
- [PolicyRegistry](https://sepolia.mantlescan.xyz/address/0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0)
- [ActionAttestation](https://sepolia.mantlescan.xyz/address/0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3)

## Compiler Settings

Use the same settings as `packages/contracts/scripts/compile.ts` and the installed `solc` package:

```text
Compiler: Solidity 0.8.35
EVM version: paris
viaIR: true
Optimizer: enabled
Optimizer runs: 200
License: MIT
```

Before submitting source verification, confirm the generated Etherscan V2 payload:

```bash
pnpm contracts:verify -- --dry-run
pnpm contracts:verify:test
```

To export the exact files needed for manual Mantlescan verification:

```bash
pnpm contracts:verify:export
```

This creates:

- `verification-artifacts/mantle-sepolia/standard-json-input.json`
- `verification-artifacts/mantle-sepolia/contracts.json`
- `verification-artifacts/mantle-sepolia/README.md`

## Contracts And Constructor Arguments

### AgentRegistry

- Address: `0xa8d6f3478b683ee674ff5a9167e6838c589162b4`
- Source: `packages/contracts/contracts/AgentRegistry.sol`
- Contract name: `AgentRegistry`
- Constructor arguments: none

### PolicyRegistry

- Address: `0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0`
- Source: `packages/contracts/contracts/PolicyRegistry.sol`
- Contract name: `PolicyRegistry`
- Constructor arguments:

```text
0x000000000000000000000000a8d6f3478b683ee674ff5a9167e6838c589162b4
```

Decoded:

```text
agentRegistryAddress = 0xa8d6f3478b683ee674ff5a9167e6838c589162b4
```

### ActionAttestation

- Address: `0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3`
- Source: `packages/contracts/contracts/ActionAttestation.sol`
- Contract name: `ActionAttestation`
- Constructor arguments:

```text
0x000000000000000000000000a8d6f3478b683ee674ff5a9167e6838c589162b400000000000000000000000016a02f6ed0d3db730fd60d5c51ec99e7825e41e0
```

Decoded:

```text
agentRegistryAddress = 0xa8d6f3478b683ee674ff5a9167e6838c589162b4
policyRegistryAddress = 0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0
```

## Post-Verification Checks

After verification:

1. Open each explorer link and confirm the `Contract` tab shows verified source.
2. Confirm `AgentRegistry.actionAttestation()` equals `0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3`.
3. Confirm `PolicyRegistry.VERSION()` returns `1.2.0`.
4. Confirm `PolicyRegistry.supportsPolicyEnumeration()` returns `true`.
5. Run:

```bash
pnpm deployment:manifest:doctor
pnpm live:verify
pnpm submission:doctor:live
```

To check explorer source-verification status without submitting anything, run:

```bash
pnpm contracts:verification-status
```

This command is read-only. With `ETHERSCAN_API_KEY` or `MANTLESCAN_API_KEY` it uses the Etherscan V2 `getsourcecode` endpoint for chain id `5003`; without an API key it falls back to the public Mantlescan contract pages and reports whether each page appears verified or unverified.

## Current Blocker

Automated verification requires either a working Foundry installation or a Mantlescan-compatible API key/endpoint. If neither is available, use the Mantlescan manual verification UI with the exact settings and constructor arguments above.

For manual verification, run `pnpm contracts:verify:export` first and upload `verification-artifacts/mantle-sepolia/standard-json-input.json` through Mantlescan's Solidity Standard JSON flow. Copy the constructor arguments from `verification-artifacts/mantle-sepolia/contracts.json`.

## Etherscan V2 API

Etherscan V2 lists Mantle Sepolia Testnet `5003` as supported for source code and ABI endpoints. If you have an API key, run:

```bash
ETHERSCAN_API_KEY=<key> pnpm contracts:verify -- --poll
```

The script submits all three contracts with Solidity Standard JSON input, chain id `5003`, `viaIR: true`, optimizer runs `200`, EVM version `paris`, and the constructor arguments from this file.
