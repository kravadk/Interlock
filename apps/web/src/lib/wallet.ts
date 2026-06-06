import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  numberToHex,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import {
  actionAttestationAbi,
  agentRegistryAbi,
  Decision,
  disputeEscrowAbi,
  mantleSepolia,
  policyGuardedExecutorAbi,
  policyRegistryAbi,
  ReasonCode,
} from "@interlock/shared";
import { registerErc8004Agent } from "@interlock/firewall-sdk";
import { PendingTransactionError } from "./tx-error";
import { mantleRpcUrl } from "./contracts";

const TX_CONFIRM_TIMEOUT_MS = 60_000;

type EthereumProvider = {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];
  on?(event: "accountsChanged" | "chainChanged", listener: EthereumProviderListener): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: EthereumProviderListener): void;
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
};

type EthereumProviderListener = (...args: unknown[]) => void;

type Eip6963ProviderDetail = {
  info: {
    uuid: string;
    name: string;
    icon?: string;
    rdns?: string;
  };
  provider: EthereumProvider;
};

type Eip6963AnnounceEvent = Event & {
  detail?: Eip6963ProviderDetail;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export type ConnectedWallet = {
  address: Address;
  chainId: number;
};

export type WalletProviderOption = {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
};

type WalletProviderEntry = WalletProviderOption & {
  provider: EthereumProvider;
};

let selectedProvider: EthereumProvider | undefined;
let providerCache: WalletProviderEntry[] = [];

export type RecordActionInput = {
  account: Address;
  actionAttestation: Address;
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  evidenceHash: Hex;
  decision: keyof typeof Decision;
  reasonCode: keyof typeof ReasonCode;
  deadline: bigint;
  signature: Hex;
};

export type RegisterAgentInput = {
  account: Address;
  agentRegistry: Address;
  metadataURI: string;
};

export type CreatePolicyInput = {
  account: Address;
  policyRegistry: Address;
  agentId: bigint;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  targets: Address[];
  selectors: Hex[];
};

export type UpdatePolicyInput = {
  account: Address;
  policyRegistry: Address;
  policyId: bigint;
  maxNativeValue: bigint;
  maxSlippageBps: number;
  active: boolean;
};

export type SetTargetAllowedInput = {
  account: Address;
  policyRegistry: Address;
  policyId: bigint;
  target: Address;
  allowed: boolean;
};

export type SetSelectorAllowedInput = {
  account: Address;
  policyRegistry: Address;
  policyId: bigint;
  selector: Hex;
  allowed: boolean;
};

export function hasInjectedWallet() {
  return typeof window !== "undefined" && Boolean(window.ethereum || getInjectedProviders().length > 0);
}

export async function discoverWalletProviders(timeoutMs = 250): Promise<WalletProviderOption[]> {
  if (typeof window === "undefined") return [];

  const announced: WalletProviderEntry[] = [];
  const onAnnounce = (event: Eip6963AnnounceEvent) => {
    if (!event.detail?.provider || !event.detail.info?.uuid) return;
    announced.push({
      id: event.detail.info.uuid,
      name: event.detail.info.name || providerLabel(event.detail.provider),
      rdns: event.detail.info.rdns,
      icon: event.detail.info.icon,
      provider: event.detail.provider,
    });
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await sleep(timeoutMs);
  window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);

  const legacy = getInjectedProviders().map((provider, index) => ({
    id: `injected-${index}-${providerLabel(provider).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: providerLabel(provider),
    provider,
  }));

  providerCache = dedupeProviders([...announced, ...legacy]);
  return providerCache.map(({ provider: _provider, ...option }) => option);
}

export async function connectInjectedWallet(providerId?: string): Promise<ConnectedWallet> {
  const provider = await providerForId(providerId);
  selectedProvider = provider;
  const accounts = await provider.request<Address[]>({ method: "eth_requestAccounts" });

  if (!accounts[0]) {
    throw new Error("No wallet account returned");
  }

  await ensureMantleSepolia(provider);
  const chainIdHex = await provider.request<Hex>({ method: "eth_chainId" });

  return {
    address: accounts[0],
    chainId: Number(BigInt(chainIdHex)),
  };
}

export function subscribeSelectedWalletChanges(onChange: (wallet: ConnectedWallet | undefined) => void) {
  const provider = selectedProvider ?? providerCache[0]?.provider;
  if (!provider?.on) return () => undefined;

  const onAccountsChanged: EthereumProviderListener = async (accountsPayload) => {
    const accounts = Array.isArray(accountsPayload) ? (accountsPayload as Address[]) : [];
    const address = accounts[0];
    if (!address) {
      onChange(undefined);
      return;
    }
    onChange({ address, chainId: await readChainId(provider) });
  };
  const onChainChanged: EthereumProviderListener = async (chainIdPayload) => {
    const chainIdHex = typeof chainIdPayload === "string" ? (chainIdPayload as Hex) : undefined;
    const accounts = await provider.request<Address[]>({ method: "eth_accounts" }).catch(() => []);
    const address = accounts[0];
    if (!address || !chainIdHex) {
      onChange(undefined);
      return;
    }
    onChange({ address, chainId: Number(BigInt(chainIdHex)) });
  };

  provider.on("accountsChanged", onAccountsChanged);
  provider.on("chainChanged", onChainChanged);

  return () => {
    provider.removeListener?.("accountsChanged", onAccountsChanged);
    provider.removeListener?.("chainChanged", onChainChanged);
  };
}

export async function ensureMantleSepolia(provider = requireProvider()) {
  const chainId = numberToHex(mantleSepolia.id);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: number }).code : undefined;
    if (code !== 4902) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: mantleSepolia.name,
          nativeCurrency: mantleSepolia.nativeCurrency,
          rpcUrls: mantleSepolia.rpcUrls.default.http,
          blockExplorerUrls: mantleSepolia.blockExplorers?.default ? [mantleSepolia.blockExplorers.default.url] : [],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}

export async function recordActionFromWallet(input: RecordActionInput): Promise<Hex> {
  const walletClient = walletClientFor(input.account);

  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.actionAttestation,
    abi: actionAttestationAbi,
    functionName: "recordAction",
    args: [
      input.agentId,
      input.policyId,
      input.target,
      input.value,
      input.calldataHash,
      input.selector,
      input.simulationHash,
      input.evidenceHash,
      Decision[input.decision],
      ReasonCode[input.reasonCode],
      input.deadline,
      input.signature,
    ],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

/**
 * On-chain enforcement: route an action through PolicyGuardedExecutor. An ALLOW executes against the
 * target; a BLOCK reverts on-chain (the wallet shows the revert). Caller must be the policy owner.
 */
export async function executeViaGuardFromWallet(input: {
  account: Address;
  executor: Address;
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  data: Hex;
}): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.executor,
    abi: policyGuardedExecutorAbi,
    functionName: "execute",
    args: [input.agentId, input.policyId, input.target, input.value, input.data],
    value: input.value,
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

/** DisputeEscrow: recorder posts a bond backing a record's honesty. */
export async function bondRecordFromWallet(input: {
  account: Address;
  escrow: Address;
  actionCheckId: bigint;
  bond: bigint;
}): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.escrow,
    abi: disputeEscrowAbi,
    functionName: "bondRecord",
    args: [input.actionCheckId],
    value: input.bond,
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

/** DisputeEscrow: challenger posts a bond (>= recorder's) to dispute within the window. */
export async function openDisputeFromWallet(input: {
  account: Address;
  escrow: Address;
  actionCheckId: bigint;
  bond: bigint;
}): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.escrow,
    abi: disputeEscrowAbi,
    functionName: "openDispute",
    args: [input.actionCheckId],
    value: input.bond,
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

/** DisputeEscrow: pull credited funds (winnings or reclaimed bonds). */
export async function withdrawDisputeFromWallet(input: { account: Address; escrow: Address }): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.escrow,
    abi: disputeEscrowAbi,
    functionName: "withdraw",
    args: [],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

export async function challengeActionFromWallet(input: {
  account: Address;
  actionAttestation: Address;
  actionCheckId: bigint;
  reason: string;
}): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.actionAttestation,
    abi: actionAttestationAbi,
    functionName: "challenge",
    args: [input.actionCheckId, input.reason],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

export async function finalizeActionFromWallet(input: {
  account: Address;
  actionAttestation: Address;
  actionCheckId: bigint;
}): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.actionAttestation,
    abi: actionAttestationAbi,
    functionName: "finalize",
    args: [input.actionCheckId],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

export async function registerAgentFromWallet(input: RegisterAgentInput): Promise<{ txHash: Hex; agentId?: bigint }> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "registerAgent",
    args: [input.metadataURI],
  });

  const receipt = await waitForConfirmedReceipt(txHash);
  const logs = parseEventLogs({
    abi: agentRegistryAbi,
    eventName: "AgentRegistered",
    logs: receipt.logs,
  });

  return {
    txHash,
    agentId: logs[0]?.args.agentId,
  };
}

export async function createPolicyFromWallet(input: CreatePolicyInput): Promise<{ txHash: Hex; policyId?: bigint }> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "createPolicy",
    args: [
      input.agentId,
      input.maxNativeValue,
      input.maxSlippageBps,
      input.targets,
      input.selectors as `0x${string}`[],
    ],
  });

  const receipt = await waitForConfirmedReceipt(txHash);
  const logs = parseEventLogs({
    abi: policyRegistryAbi,
    eventName: "PolicyCreated",
    logs: receipt.logs,
  });

  return {
    txHash,
    policyId: logs[0]?.args.policyId,
  };
}

export async function updatePolicyFromWallet(input: UpdatePolicyInput): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "updatePolicy",
    args: [input.policyId, input.maxNativeValue, input.maxSlippageBps, input.active],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

export async function setTargetAllowedFromWallet(input: SetTargetAllowedInput): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "setTargetAllowed",
    args: [input.policyId, input.target, input.allowed],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

export async function setSelectorAllowedFromWallet(input: SetSelectorAllowedInput): Promise<Hex> {
  const walletClient = walletClientFor(input.account);
  const txHash = await walletClient.writeContract({
    account: input.account,
    chain: mantleSepolia,
    address: input.policyRegistry,
    abi: policyRegistryAbi,
    functionName: "setSelectorAllowed",
    args: [input.policyId, input.selector as `0x${string}`, input.allowed],
  });
  await waitForConfirmedReceipt(txHash);
  return txHash;
}

/**
 * Register the connected wallet's agent into the OFFICIAL ERC-8004 IdentityRegistry (mints a
 * standard agent NFT whose agentURI points at the registration manifest). On-chain write; the
 * caller confirms the wallet prompt. Returns the tx hash.
 */
export async function registerErc8004FromWallet(input: {
  account: Address;
  identityRegistry: Address;
  agentURI: string;
}): Promise<{ txHash: Hex }> {
  const walletClient = walletClientFor(input.account);
  const txHash = await registerErc8004Agent({
    walletClient,
    account: input.account,
    identityRegistry: input.identityRegistry,
    agentURI: input.agentURI,
  });
  await waitForConfirmedReceipt(txHash);
  return { txHash };
}

function walletClientFor(account: Address) {
  const provider = requireProvider();
  return createWalletClient({
    account,
    chain: mantleSepolia,
    transport: custom(provider),
  });
}

function publicClient() {
  return createPublicClient({
    chain: mantleSepolia,
    transport: http(mantleRpcUrl()),
  });
}

async function waitForConfirmedReceipt(txHash: Hex): Promise<TransactionReceipt> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient().waitForTransactionReceipt({ hash: txHash, timeout: TX_CONFIRM_TIMEOUT_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("timeout") || message.includes("timed out")) {
      throw new PendingTransactionError(txHash);
    }
    throw error;
  }
  if (receipt.status === "reverted") {
    // The tx mined but reverted. Re-run it at the mined block so viem surfaces the actual revert
    // reason (Error(string) reasons are decoded directly; custom-error data flows to tx-error.ts
    // for name decoding). Never throw the bare receipt message if we can recover the cause.
    try {
      const tx = await publicClient().getTransaction({ hash: txHash });
      await publicClient().call({
        account: tx.from,
        to: tx.to ?? undefined,
        data: tx.input,
        value: tx.value,
        blockNumber: receipt.blockNumber,
      });
    } catch (revertCause) {
      throw revertCause;
    }
    throw new Error(`Transaction reverted on-chain: ${txHash}`);
  }
  return receipt;
}

function requireProvider() {
  const provider = selectedProvider ?? providerCache[0]?.provider ?? getInjectedProviders()[0];
  if (!provider) {
    throw new Error("Injected wallet not found. Open the dashboard in a browser profile with MetaMask or Rabby installed and enabled for this site.");
  }
  return provider;
}

async function providerForId(providerId?: string) {
  if (providerCache.length === 0) {
    await discoverWalletProviders();
  }
  if (providerId) {
    const provider = providerCache.find((entry) => entry.id === providerId)?.provider;
    if (provider) return provider;
  }
  const provider = providerCache[0]?.provider ?? getInjectedProviders()[0];
  if (!provider) {
    throw new Error("Injected wallet not found. Open the dashboard in a browser profile with MetaMask or Rabby installed and enabled for this site.");
  }
  return provider;
}

async function readChainId(provider: EthereumProvider) {
  const chainIdHex = await provider.request<Hex>({ method: "eth_chainId" });
  return Number(BigInt(chainIdHex));
}

function getInjectedProviders(): EthereumProvider[] {
  if (typeof window === "undefined") {
    return [];
  }

  const ethereum = window.ethereum;
  if (!ethereum) {
    return [];
  }

  const providers = Array.isArray(ethereum.providers) && ethereum.providers.length > 0 ? ethereum.providers : [ethereum];
  return [...providers].sort(providerPriority);
}

function providerPriority(a: EthereumProvider, b: EthereumProvider) {
  return providerRank(a) - providerRank(b);
}

function providerRank(provider: EthereumProvider) {
  if (provider.isRabby) return 0;
  if (provider.isMetaMask) return 0;
  if (provider.isCoinbaseWallet) return 2;
  return 10;
}

function providerLabel(provider: EthereumProvider) {
  if (provider.isRabby) return "Rabby";
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  return "Injected wallet";
}

function dedupeProviders(entries: WalletProviderEntry[]) {
  const seenProviders = new Set<EthereumProvider>();
  const seenIds = new Set<string>();
  const result: WalletProviderEntry[] = [];

  for (const entry of entries.sort((a, b) => providerRank(a.provider) - providerRank(b.provider))) {
    if (seenProviders.has(entry.provider)) continue;
    const id = seenIds.has(entry.id) ? `${entry.id}-${result.length}` : entry.id;
    seenProviders.add(entry.provider);
    seenIds.add(id);
    result.push({ ...entry, id });
  }

  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
