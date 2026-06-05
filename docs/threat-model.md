# Threat Model

Interlock Firewall reduces execution risk for autonomous agents. It does not guarantee complete transaction safety.

## Assets Protected

- user funds controlled by an agent runtime;
- protocol integrations exposed to agents;
- audit history of agent decisions;
- reputation counters for agent behavior;
- developer trust in automated execution.

## Trust Boundaries

```text
LLM / agent planner
  -> untrusted proposal

Interlock SDK
  -> policy + simulation decision

Wallet/runtime
  -> actual transaction execution

Contracts
  -> public audit and reputation layer

Indexer
  -> convenience read layer, not source of truth
```

## Threats

### Malicious Or Compromised Agent

Agent proposes an unknown target, overspend, risky selector or malformed calldata.

Mitigation:

- target allowlist;
- selector allowlist;
- value limit;
- simulation;
- block attestation.

### Prompt Injection

LLM is instructed to ignore policy and send a transaction.

Mitigation:

- LLM cannot bypass deterministic policy checks if runtime calls the firewall before execution.

Limitation:

- prompt security itself is outside the firewall.

### Malicious Recorder

A recorder writes false `ALLOW` history.

Current mitigation:

- on-chain sanity checks reject `ALLOW` for disallowed target, selector or value.

Future mitigation:

- authorized recorders;
- EIP-712 signed receipts;
- nonces and deadlines.

### Policy Owner Misconfiguration

Owner allowlists a malicious contract or sets limits too high.

Mitigation:

- dashboard warnings;
- strict presets;
- Flight Recorder visibility.

Limitation:

- owner can still configure unsafe policy.

### Malicious RPC

RPC lies about simulation or state.

Mitigation:

- use reputable RPC;
- compare providers in production;
- record hashes and chain ID.

Future mitigation:

- multiple simulation providers;
- signed simulation receipts.

### Allowlisted Protocol Exploit

Target is allowed, but the protocol itself is exploited.

Mitigation:

- none at firewall layer beyond limiting value and scope.

Limitation:

- Interlock Firewall is not a protocol audit.

## Security Invariants

- A blocked action should be recordable.
- An allowed action should satisfy on-chain target/selector/value policy.
- Reputation counters should update only through the attestation path.
- The SDK should never store private keys outside the caller's runtime.
- The dashboard should never require custody.

## Production Hardening Checklist

- authorized recorder model;
- EIP-712 receipts;
- replay protection;
- policy deactivation;
- emergency pause;
- stale simulation deadlines;
- chain ID in signed payloads;
- fuzz tests;
- Slither/static analysis;
- external review before mainnet.
