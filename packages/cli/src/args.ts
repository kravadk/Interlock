import { isAddress, isHex, parseEther, type Address, type Hex } from "viem";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import type { InterlockContracts } from "@interlock/firewall-sdk";
import { maxSlippageBps } from "@interlock/firewall-sdk";

export type ParsedCli = {
  command: string;
  flags: Record<string, string | boolean | string[]>;
};

export class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

export function parseCli(argv: string[]): ParsedCli {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [rawCommand, rawSubcommand, ...rawRest] = normalizedArgv;
  const hasNestedCommand =
    (rawCommand === "benchmark" || rawCommand === "gateway" || rawCommand === "policy-version") &&
    rawSubcommand &&
    !rawSubcommand.startsWith("--");
  const command = hasNestedCommand ? `${rawCommand}-${rawSubcommand}` : rawCommand;
  const rest = hasNestedCommand ? rawRest : normalizedArgv.slice(1);
  const flags: ParsedCli["flags"] = {};

  if (!command) {
    throw new CliInputError("Missing command.");
  }

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new CliInputError(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const next = rest[i + 1];
    const value = next && !next.startsWith("--") ? next : true;

    if (value !== true) {
      i++;
    }

    if (flags[key] === undefined) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      (flags[key] as string[]).push(String(value));
    } else {
      flags[key] = [String(flags[key]), String(value)];
    }
  }

  return { command, flags };
}

export function flagString(flags: ParsedCli["flags"], key: string, defaultValue?: string): string | undefined {
  const value = flags[key];
  if (value === undefined || value === true) return defaultValue;
  if (typeof value !== "string" && !Array.isArray(value)) return defaultValue;
  return Array.isArray(value) ? value[value.length - 1] : value;
}

export function flagBool(flags: ParsedCli["flags"], key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}

export function flagStrings(flags: ParsedCli["flags"], key: string): string[] {
  const value = flags[key];
  if (value === undefined || value === true) return [];
  if (typeof value !== "string" && !Array.isArray(value)) return [];
  return Array.isArray(value) ? value : [value];
}

export function requiredString(flags: ParsedCli["flags"], key: string): string {
  const value = flagString(flags, key);
  if (!value) {
    throw new CliInputError(`Missing required --${key}.`);
  }
  return value;
}

export function bigintFlag(flags: ParsedCli["flags"], key: string, defaultValue?: bigint): bigint {
  const value = flagString(flags, key);
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new CliInputError(`Missing required --${key}.`);
  }
  if (!/^\d+$/.test(value)) {
    throw new CliInputError(`--${key} must be a non-negative integer.`);
  }
  return BigInt(value);
}

export function numberFlag(flags: ParsedCli["flags"], key: string, defaultValue?: number): number | undefined {
  const value = flagString(flags, key);
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliInputError(`--${key} must be a number.`);
  }
  return parsed;
}

export function etherFlag(flags: ParsedCli["flags"], key: string, defaultValue = 0n): bigint {
  const value = flagString(flags, key);
  const parsed = value ? parseEther(value) : defaultValue;
  if (parsed < 0n) {
    throw new CliInputError(`--${key} must be a non-negative native value.`);
  }
  return parsed;
}

export function optionalEtherFlag(flags: ParsedCli["flags"], key: string): bigint | undefined {
  const value = flagString(flags, key);
  if (!value) return undefined;
  const parsed = parseEther(value);
  if (parsed < 0n) {
    throw new CliInputError(`--${key} must be a non-negative native value.`);
  }
  return parsed;
}

export function addressFlag(flags: ParsedCli["flags"], key: string, defaultValue?: Address): Address {
  const value = flagString(flags, key, defaultValue);
  if (!value || !isAddress(value)) {
    throw new CliInputError(`--${key} must be an EVM address.`);
  }
  return value;
}

export function hexFlag(flags: ParsedCli["flags"], key: string, defaultValue = "0x" as Hex): Hex {
  const value = flagString(flags, key, defaultValue);
  if (!value || !isHex(value) || !/^0x([a-fA-F0-9]{2})*$/.test(value)) {
    throw new CliInputError(`--${key} must be full 0x-prefixed calldata with complete bytes. Use 0x for empty calldata.`);
  }
  return value;
}

export function envOrFlag(flags: ParsedCli["flags"], key: string, envKey: string, defaultValue?: string): string | undefined {
  return flagString(flags, key) ?? process.env[envKey] ?? defaultValue;
}

export function contractsFromFlags(flags: ParsedCli["flags"]): InterlockContracts {
  return {
    agentRegistry: checkedAddress(
      envOrFlag(flags, "agent-registry", "AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
      "agent-registry",
    ),
    policyRegistry: checkedAddress(
      envOrFlag(flags, "policy-registry", "POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
      "policy-registry",
    ),
    actionAttestation: checkedAddress(
      envOrFlag(flags, "action-attestation", "ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
      "action-attestation",
    ),
  };
}

export function rpcUrlFromFlags(flags: ParsedCli["flags"]) {
  return envOrFlag(flags, "rpc-url", "MANTLE_RPC_URL", mantleSepolia.rpcUrls.default.http[0])!;
}

export function privateKeyFromFlags(flags: ParsedCli["flags"]): Hex | undefined {
  const value = envOrFlag(flags, "private-key", "PRIVATE_KEY");
  if (!value) return undefined;
  if (!isHex(value)) {
    throw new CliInputError("--private-key / PRIVATE_KEY must be 0x-prefixed hex.");
  }
  return value;
}

export function assertCliSlippageBps(value: number | undefined, key: string): asserts value is number | undefined {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > maxSlippageBps) {
    throw new CliInputError(`--${key} must be an integer between 0 and ${maxSlippageBps}.`);
  }
}

function checkedAddress(value: string | undefined, key: string): Address {
  if (!value || !isAddress(value)) {
    throw new CliInputError(`Missing or invalid ${key} address.`);
  }
  return value;
}
