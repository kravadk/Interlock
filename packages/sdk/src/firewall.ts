import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Decision,
  ReasonCode,
  parseActionCheckedArgs,
  actionAttestationAbi,
  agentRegistryAbi,
  policyRegistryAbi,
  policyGuardedExecutorAbi,
  disputeEscrowAbi,
  attestorCommitteeAbi,
  reputationOracleAbi,
} from "@interlock/shared";
import { ActionBlockedError, AgentReadError, AttestationFailedError, ContractCompatibilityError, PolicyReadError } from "./errors.js";
import {
  AgentRegistrationFailedError,
  PolicyCreationFailedError,
  PolicyUpdateFailedError,
  WalletClientRequiredError,
} from "./errors.js";
import { signActionDecision } from "./attestation-signing.js";
import { buildEvidenceReport } from "./evidence.js";
import { calldataHash, evaluatePolicy, getSelector, hashJson } from "./policy.js";
import { validatePolicyPack } from "./policy-pack.js";
import { buildCreatePolicyInput } from "./presets.js";
import { withRpcRetry } from "./rpc.js";
import { actionCheckedFromReceipt, agentRegistrationFromReceipt, policyCreationFromReceipt } from "./setup-results.js";
import { checkActionBundle, recordBundleDecisions } from "./action-bundle.js";
import { getErc8004Agent, getErc8004ReputationSummary, registerErc8004Agent, type Erc8004Agent } from "./erc8004.js";
import { deployedAddresses } from "@interlock/shared";
import {
  assertNonNegativeWei,
  assertPositiveId,
  assertValidAddress,
  assertValidBytes32,
  assertValidCalldata,
  assertValidDecisionReason,
  assertValidSelector,
  assertValidSlippageBps,
} from "./validation.js";
import type {
  ActionHistoryEntry,
  ActionHistoryFilters,
  AgentAction,
  AgentActionBundle,
  AgentActionBundleReport,
  InterlockFirewallConfig,
  AgentPolicy,
  AgentStats,
  CreatePolicyResult,
  CreatePolicyFromPresetInput,
  CreatePolicyInput,
  FirewallDecision,
  GuardedSendOptions,
  GuardedSendResult,
  GatewayActionOptions,
  GatewayActionResult,
  RegisterAgentInput,
  RegisterAgentResult,
  PolicyPermissionCheckInput,
  PolicyPermissionCheckResult,
  PolicyPackApplyInput,
  PolicyPackApplyOperation,
  PolicyPackApplyResult,
  PolicyPackApplyTransaction,
  PolicyPackAuditInput,
  PolicyPackAuditMismatch,
  PolicyPackAuditResult,
  RecordDecisionResult,
  SetSelectorAllowedInput,
  SetTargetAllowedInput,
  UpdatePolicyInput,
} from "./types.js";

export class InterlockFirewall {
  readonly publicClient: PublicClient;
  readonly walletClient?: WalletClient;
  readonly contracts: InterlockFirewallConfig["contracts"];
  readonly chain: Chain;
  readonly attestor?: Account;

  constructor(config: InterlockFirewallConfig) {
    const account = config.account ?? (config.privateKey ? privateKeyToAccount(config.privateKey) : undefined);

    this.contracts = config.contracts;
    this.chain = config.chain;
    this.publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });

    if (config.walletClient) {
      this.walletClient = config.walletClient;
    } else if (account) {
      this.walletClient = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });
    }

    // The attestor that signs decisions for ActionAttestationV3. Defaults to a dedicated
    // attestor account/key if provided, otherwise the signing account (dev/CLI convenience).
    this.attestor =
      config.attestor ??
      (config.attestorPrivateKey ? privateKeyToAccount(config.attestorPrivateKey) : account);
  }

  async registerAgent(input: RegisterAgentInput): Promise<Hex> {
    const walletClient = this.requireWalletClient("registerAgent");
    try {
      return await walletClient.writeContract({
        account: walletClient.account,
        chain: this.chain,
        address: this.contracts.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "registerAgent",
        args: [input.metadataURI],
      });
    } catch (error) {
      throw new AgentRegistrationFailedError(error);
    }
  }

  async registerAgentAndWait(input: RegisterAgentInput): Promise<RegisterAgentResult> {
    const transactionHash = await this.registerAgent(input);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: transactionHash });
    return agentRegistrationFromReceipt(receipt, this.contracts.agentRegistry);
  }

  /**
   * On-chain enforcement: route an action THROUGH PolicyGuardedExecutor. The guard validates against
   * the on-chain policy and reverts a disallowed action; an allowed action is forwarded to `target`
   * with the attached `value`. Caller (the firewall's wallet) must be the policy owner.
   */
  async executeThroughGuard(input: {
    executor: Address;
    agentId: bigint;
    policyId: bigint;
    target: Address;
    value: bigint;
    data: Hex;
  }): Promise<Hex> {
    const walletClient = this.requireWalletClient("executeThroughGuard");
    return await walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: input.executor,
      abi: policyGuardedExecutorAbi,
      functionName: "execute",
      args: [input.agentId, input.policyId, input.target, input.value, input.data],
      value: input.value,
    });
  }

  /** Authoritative on-chain preview of whether the guard would allow an action (no execution). */
  async previewGuard(input: {
    executor: Address;
    agentId: bigint;
    policyId: bigint;
    target: Address;
    value: bigint;
    data: Hex;
  }): Promise<{ allowed: boolean; reasonCode: number }> {
    const [allowed, reasonCode] = (await this.publicClient.readContract({
      address: input.executor,
      abi: policyGuardedExecutorAbi,
      functionName: "previewExecute",
      args: [input.agentId, input.policyId, input.target, input.value, input.data],
    })) as [boolean, number];
    return { allowed, reasonCode };
  }

  /* DisputeEscrow — two-sided bonds + arbiter-resolved slashing (keyed by actionCheckId). */

  /** Recorder posts a bond backing a record's honesty. */
  async bondRecord(input: { escrow: Address; actionCheckId: bigint; bond: bigint }): Promise<Hex> {
    const walletClient = this.requireWalletClient("bondRecord");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: input.escrow,
      abi: disputeEscrowAbi,
      functionName: "bondRecord",
      args: [input.actionCheckId],
      value: input.bond,
    });
  }

  /** Challenger posts a bond (>= the recorder's) to dispute a bonded record within the window. */
  async openDispute(input: { escrow: Address; actionCheckId: bigint; bond: bigint }): Promise<Hex> {
    const walletClient = this.requireWalletClient("openDispute");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: input.escrow,
      abi: disputeEscrowAbi,
      functionName: "openDispute",
      args: [input.actionCheckId],
      value: input.bond,
    });
  }

  /** Arbiter resolves a dispute; the winner is credited both bonds. */
  async resolveDispute(input: { escrow: Address; actionCheckId: bigint; challengerWins: boolean }): Promise<Hex> {
    const walletClient = this.requireWalletClient("resolveDispute");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: input.escrow,
      abi: disputeEscrowAbi,
      functionName: "resolve",
      args: [input.actionCheckId, input.challengerWins],
    });
  }

  /** Pull credited dispute funds (winnings or reclaimed bonds). */
  async withdrawDisputeFunds(escrow: Address): Promise<Hex> {
    const walletClient = this.requireWalletClient("withdrawDisputeFunds");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: escrow,
      abi: disputeEscrowAbi,
      functionName: "withdraw",
      args: [],
    });
  }

  /** AttestorCommittee — does a digest have >= threshold distinct committee signatures? */
  async committeeApproved(committee: Address, digest: Hex, signatures: Hex[]): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: committee,
      abi: attestorCommitteeAbi,
      functionName: "isApproved",
      args: [digest, signatures],
    })) as boolean;
  }

  /** ReputationOracle — a queryable score (basis points) + trust tier for an agent. */
  async getReputation(oracle: Address, agentId: bigint): Promise<{ scoreBps: number; tier: number }> {
    const [scoreBps, tier] = (await this.publicClient.readContract({
      address: oracle,
      abi: reputationOracleAbi,
      functionName: "getScore",
      args: [agentId],
    })) as [bigint, number];
    return { scoreBps: Number(scoreBps), tier };
  }

  /**
   * Read an agent's identity from the OFFICIAL ERC-8004 IdentityRegistry (defaults to the
   * verified Mantle Sepolia registry). Reuses {@link getErc8004Agent}.
   */
  async getErc8004Identity(agentId: bigint, identityRegistry?: Address): Promise<Erc8004Agent> {
    return getErc8004Agent({
      publicClient: this.publicClient,
      identityRegistry: identityRegistry ?? requireErc8004Registry(deployedAddresses.mantleSepolia.erc8004IdentityRegistry, "identity"),
      agentId,
    });
  }

  /** Read an agent's reputation summary from the OFFICIAL ERC-8004 ReputationRegistry. */
  async getErc8004Reputation(agentId: bigint, clientAddresses: Address[], reputationRegistry?: Address) {
    return getErc8004ReputationSummary({
      publicClient: this.publicClient,
      reputationRegistry: reputationRegistry ?? requireErc8004Registry(deployedAddresses.mantleSepolia.erc8004ReputationRegistry, "reputation"),
      agentId,
      clientAddresses,
    });
  }

  /**
   * Register this Interlock agent into the OFFICIAL ERC-8004 IdentityRegistry (on-chain write,
   * needs a wallet client). `agentURI` should point at the agent's registration manifest.
   */
  async registerErc8004Identity(agentURI: string, identityRegistry?: Address): Promise<Hex> {
    const walletClient = this.requireWalletClient("registerErc8004Identity");
    return registerErc8004Agent({
      walletClient,
      account: walletClient.account,
      identityRegistry: identityRegistry ?? requireErc8004Registry(deployedAddresses.mantleSepolia.erc8004IdentityRegistry, "identity"),
      agentURI,
    });
  }

  async createPolicy(input: CreatePolicyInput): Promise<Hex> {
    const walletClient = this.requireWalletClient("createPolicy");
    this.validateCreatePolicyInput(input);
    try {
      return await walletClient.writeContract({
        account: walletClient.account,
        chain: this.chain,
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "createPolicy",
        args: [input.agentId, input.maxNativeValue, input.maxSlippageBps, input.targets, input.selectors as `0x${string}`[]],
      });
    } catch (error) {
      throw new PolicyCreationFailedError(error);
    }
  }

  async createPolicyAndWait(input: CreatePolicyInput): Promise<CreatePolicyResult> {
    const transactionHash = await this.createPolicy(input);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: transactionHash });
    return policyCreationFromReceipt(receipt, this.contracts.policyRegistry);
  }

  async createPolicyFromPreset(input: CreatePolicyFromPresetInput): Promise<Hex> {
    return this.createPolicy(buildCreatePolicyInput(input.agentId, input.preset));
  }

  async createPolicyFromPresetAndWait(input: CreatePolicyFromPresetInput): Promise<CreatePolicyResult> {
    return this.createPolicyAndWait(buildCreatePolicyInput(input.agentId, input.preset));
  }

  async updatePolicy(input: UpdatePolicyInput): Promise<Hex> {
    const walletClient = this.requireWalletClient("updatePolicy");
    assertPositiveId(input.policyId, "policyId");
    assertNonNegativeWei(input.maxNativeValue, "maxNativeValue");
    assertValidSlippageBps(input.maxSlippageBps, "maxSlippageBps");
    try {
      return await walletClient.writeContract({
        account: walletClient.account,
        chain: this.chain,
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "updatePolicy",
        args: [input.policyId, input.maxNativeValue, input.maxSlippageBps, input.active],
      });
    } catch (error) {
      throw new PolicyUpdateFailedError(error);
    }
  }

  async setTargetAllowed(input: SetTargetAllowedInput): Promise<Hex> {
    const walletClient = this.requireWalletClient("setTargetAllowed");
    assertPositiveId(input.policyId, "policyId");
    assertValidAddress(input.target, "target");
    try {
      return await walletClient.writeContract({
        account: walletClient.account,
        chain: this.chain,
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setTargetAllowed",
        args: [input.policyId, input.target, input.allowed],
      });
    } catch (error) {
      throw new PolicyUpdateFailedError(error);
    }
  }

  async setSelectorAllowed(input: SetSelectorAllowedInput): Promise<Hex> {
    const walletClient = this.requireWalletClient("setSelectorAllowed");
    assertPositiveId(input.policyId, "policyId");
    assertValidSelector(input.selector, "selector");
    try {
      return await walletClient.writeContract({
        account: walletClient.account,
        chain: this.chain,
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "setSelectorAllowed",
        args: [input.policyId, input.selector as `0x${string}`, input.allowed],
      });
    } catch (error) {
      throw new PolicyUpdateFailedError(error);
    }
  }

  async getPolicy(policyId: bigint): Promise<AgentPolicy> {
    try {
      const policy = (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "getPolicy",
          args: [policyId],
        }),
      )) as AgentPolicy;

      return {
        owner: policy.owner,
        agentId: BigInt(policy.agentId),
        maxNativeValue: BigInt(policy.maxNativeValue),
        maxSlippageBps: Number(policy.maxSlippageBps),
        active: policy.active,
      };
    } catch (error) {
      throw new PolicyReadError(policyId, error);
    }
  }

  async isTargetAllowed(policyId: bigint, target: Address): Promise<boolean> {
    try {
      return (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "isTargetAllowed",
          args: [policyId, target],
        }),
      )) as boolean;
    } catch (error) {
      throw new PolicyReadError(policyId, error);
    }
  }

  async isSelectorAllowed(policyId: bigint, selector: Hex): Promise<boolean> {
    try {
      return (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "isSelectorAllowed",
          args: [policyId, selector],
        }),
      )) as boolean;
    } catch (error) {
      throw new PolicyReadError(policyId, error);
    }
  }

  async checkPolicyPermissions(input: PolicyPermissionCheckInput): Promise<PolicyPermissionCheckResult> {
    const [targetAllowed, selectorAllowed] = await Promise.all([
      input.target ? this.isTargetAllowed(input.policyId, input.target) : Promise.resolve(undefined),
      input.selector ? this.isSelectorAllowed(input.policyId, input.selector) : Promise.resolve(undefined),
    ]);

    return {
      policyId: input.policyId,
      target: input.target,
      selector: input.selector,
      targetAllowed,
      selectorAllowed,
    };
  }

  async getAllowedTargets(policyId: bigint): Promise<Address[]> {
    try {
      return (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "getAllowedTargets",
          args: [policyId],
        }),
      )) as Address[];
    } catch (error) {
      throw new PolicyReadError(policyId, error);
    }
  }

  async getAllowedSelectors(policyId: bigint): Promise<Hex[]> {
    try {
      return (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "getAllowedSelectors",
          args: [policyId],
        }),
      )) as Hex[];
    } catch (error) {
      throw new PolicyReadError(policyId, error);
    }
  }

  async supportsPolicyEnumeration(): Promise<{ supported: boolean; version?: string }> {
    try {
      const [supported, version] = await Promise.all([
        withRpcRetry(() => this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "supportsPolicyEnumeration",
        }) as Promise<boolean>),
        withRpcRetry(() => this.publicClient.readContract({
          address: this.contracts.policyRegistry,
          abi: policyRegistryAbi,
          functionName: "VERSION",
        }) as Promise<string>),
      ]);

      return { supported, version };
    } catch {
      return { supported: false };
    }
  }

  async auditPolicyPack(input: PolicyPackAuditInput): Promise<PolicyPackAuditResult> {
    const pack = validatePolicyPack(input.pack);
    const expectedActive = input.expectedActive ?? true;
    const expectedMaxNativeValue = BigInt(pack.maxNativeValue);
    const policy = await this.getPolicy(input.policyId);
    const compatibility = await this.supportsPolicyEnumeration();

    if (!compatibility.supported && !input.allowLegacyPartialAudit) {
      throw new ContractCompatibilityError(
        "PolicyRegistry does not support enumerable allowlists. Redeploy PolicyRegistry v1.1.0+ or pass allowLegacyPartialAudit for a partial audit without extra-entry detection.",
      );
    }

    const [targetChecks, selectorChecks, onChainTargets, onChainSelectors] = await Promise.all([
      Promise.all(
        pack.targets.map(async (target) => ({
          target: target.address,
          label: target.label,
          allowed: await this.isTargetAllowed(input.policyId, target.address),
        })),
      ),
      Promise.all(
        pack.selectors.map(async (selector) => ({
          selector: selector.selector,
          label: selector.label,
          allowed: await this.isSelectorAllowed(input.policyId, selector.selector),
        })),
      ),
      compatibility.supported ? this.getAllowedTargets(input.policyId) : Promise.resolve([]),
      compatibility.supported ? this.getAllowedSelectors(input.policyId) : Promise.resolve([]),
    ]);

    const mismatches: PolicyPackAuditMismatch[] = [];
    const packTargetSet = new Set(pack.targets.map((target) => target.address.toLowerCase()));
    const packSelectorSet = new Set(pack.selectors.map((selector) => selector.selector.toLowerCase()));
    const extraTargets = onChainTargets.filter((target) => !packTargetSet.has(target.toLowerCase()));
    const extraSelectors = onChainSelectors.filter((selector) => !packSelectorSet.has(selector.toLowerCase()));

    if (input.expectedAgentId !== undefined && policy.agentId !== input.expectedAgentId) {
      mismatches.push({
        code: "AGENT_ID_MISMATCH",
        message: "On-chain policy belongs to a different agent.",
        expected: input.expectedAgentId.toString(),
        actual: policy.agentId.toString(),
      });
    }

    if (policy.maxNativeValue !== expectedMaxNativeValue) {
      mismatches.push({
        code: "MAX_NATIVE_VALUE_MISMATCH",
        message: "On-chain maxNativeValue differs from the policy pack.",
        expected: expectedMaxNativeValue.toString(),
        actual: policy.maxNativeValue.toString(),
      });
    }

    if (policy.maxSlippageBps !== pack.maxSlippageBps) {
      mismatches.push({
        code: "MAX_SLIPPAGE_BPS_MISMATCH",
        message: "On-chain maxSlippageBps differs from the policy pack.",
        expected: pack.maxSlippageBps,
        actual: policy.maxSlippageBps,
      });
    }

    if (policy.active !== expectedActive) {
      mismatches.push({
        code: "ACTIVE_STATE_MISMATCH",
        message: "On-chain active state differs from the expected policy state.",
        expected: expectedActive,
        actual: policy.active,
      });
    }

    for (const target of targetChecks) {
      if (!target.allowed) {
        mismatches.push({
          code: "TARGET_NOT_ALLOWED",
          message: "Policy pack target is not allowlisted on-chain.",
          target: target.target,
          expected: true,
          actual: false,
        });
      }
    }

    for (const selector of selectorChecks) {
      if (!selector.allowed) {
        mismatches.push({
          code: "SELECTOR_NOT_ALLOWED",
          message: "Policy pack selector is not allowlisted on-chain.",
          selector: selector.selector,
          expected: true,
          actual: false,
        });
      }
    }

    for (const target of extraTargets) {
      mismatches.push({
        code: "TARGET_NOT_IN_PACK",
        message: "On-chain target is allowed but missing from the policy pack.",
        target,
        expected: false,
        actual: true,
      });
    }

    for (const selector of extraSelectors) {
      mismatches.push({
        code: "SELECTOR_NOT_IN_PACK",
        message: "On-chain selector is allowed but missing from the policy pack.",
        selector,
        expected: false,
        actual: true,
      });
    }

    return {
      ok: mismatches.length === 0,
      policyId: input.policyId,
      policy,
      expected: {
        agentId: input.expectedAgentId,
        maxNativeValue: expectedMaxNativeValue,
        maxSlippageBps: pack.maxSlippageBps,
        active: expectedActive,
        targetCount: pack.targets.length,
        selectorCount: pack.selectors.length,
      },
      targetChecks,
      selectorChecks,
      onChainTargets,
      onChainSelectors,
      extraTargets,
      extraSelectors,
      mismatches,
    };
  }

  async applyPolicyPack(input: PolicyPackApplyInput): Promise<PolicyPackApplyResult> {
    const pack = validatePolicyPack(input.pack);
    const expectedActive = input.expectedActive ?? true;
    const auditBefore = await this.auditPolicyPack(input);
    const plannedOperations = this.planPolicyPackOperations(auditBefore, BigInt(pack.maxNativeValue), pack.maxSlippageBps, expectedActive, input.prune ?? false);
    const skippedMismatches = auditBefore.mismatches.filter((mismatch) => mismatch.code === "AGENT_ID_MISMATCH");

    if (input.dryRun) {
      return {
        ok: auditBefore.ok,
        dryRun: true,
        policyId: input.policyId,
        auditBefore,
        plannedOperations,
        transactions: [],
        skippedMismatches,
      };
    }

    const waitForReceipts = input.waitForReceipts ?? true;
    const transactions: PolicyPackApplyTransaction[] = [];

    for (const operation of plannedOperations) {
      const transactionHash = await this.executePolicyPackOperation(input.policyId, operation);
      const transaction: PolicyPackApplyTransaction = { ...operation, transactionHash };

      if (waitForReceipts) {
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash: transactionHash });
        transaction.blockNumber = receipt.blockNumber;
      }

      transactions.push(transaction);
    }

    const auditAfter = waitForReceipts ? await this.auditPolicyPack(input) : undefined;

    return {
      ok: skippedMismatches.length === 0 && (auditAfter ? auditAfter.ok : true),
      dryRun: false,
      policyId: input.policyId,
      auditBefore,
      plannedOperations,
      transactions,
      skippedMismatches,
      auditAfter,
    };
  }

  async getAgentStats(agentId: bigint): Promise<AgentStats> {
    try {
      const agent = (await withRpcRetry(() =>
        this.publicClient.readContract({
          address: this.contracts.agentRegistry,
          abi: agentRegistryAbi,
          functionName: "getAgent",
          args: [agentId],
        }),
      )) as AgentStats;

      return {
        owner: agent.owner,
        metadataURI: agent.metadataURI,
        allowedActions: BigInt(agent.allowedActions),
        blockedActions: BigInt(agent.blockedActions),
        failedSimulations: BigInt(agent.failedSimulations),
        exists: agent.exists,
      };
    } catch (error) {
      throw new AgentReadError(agentId, error);
    }
  }

  async checkAction(action: AgentAction): Promise<FirewallDecision> {
    this.validateAgentAction(action);
    const policy = await this.getPolicy(action.policyId);
    const selector = getSelector(action.tx.data) as Hex;

    const [targetAllowed, selectorAllowed, simulation] = await Promise.all([
      withRpcRetry(() => this.publicClient.readContract({
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "isTargetAllowed",
        args: [action.policyId, action.tx.to],
      }) as Promise<boolean>),
      withRpcRetry(() => this.publicClient.readContract({
        address: this.contracts.policyRegistry,
        abi: policyRegistryAbi,
        functionName: "isSelectorAllowed",
        args: [action.policyId, selector],
      }) as Promise<boolean>),
      this.simulate(action.tx),
    ]);

    const evaluation = evaluatePolicy({
      targetAllowed,
      selectorAllowed,
      simulationSuccess: simulation.success,
      expectedSlippageBps: action.metadata?.expectedSlippageBps,
      tx: action.tx,
      policy,
    });

    const simulationHash = hashJson({
      success: simulation.success,
      error: simulation.error,
      target: action.tx.to,
      value: action.tx.value,
      selector,
      checks: evaluation.checks,
    });

    return {
      ...evaluation,
      tx: action.tx,
      agentId: action.agentId,
      policyId: action.policyId,
      calldataHash: calldataHash(action.tx.data),
      selector,
      simulationHash,
      simulation,
    };
  }

  async checkActionBundle(bundle: AgentActionBundle): Promise<AgentActionBundleReport> {
    return checkActionBundle(this, bundle);
  }

  async recordBundleDecisions(report: AgentActionBundleReport): Promise<RecordDecisionResult[]> {
    return recordBundleDecisions(this, report);
  }

  async recordDecision(decision: FirewallDecision): Promise<Hex> {
    return this.recordDecisionWithWalletClient(decision, this.requireWalletClient("recordDecision"));
  }

  async recordDecisionAndWait(decision: FirewallDecision): Promise<RecordDecisionResult> {
    const transactionHash = await this.recordDecision(decision);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: transactionHash });
    return actionCheckedFromReceipt(receipt, this.contracts.actionAttestation);
  }

  async recordDecisionWithWalletClient(
    decision: FirewallDecision,
    walletClient: WalletClient & { account: Account },
    attestor?: Account,
  ): Promise<Hex> {
    this.validateDecision(decision);
    const signer = attestor ?? this.attestor;
    if (!signer) {
      throw new AttestationFailedError(
        new Error("ActionAttestationV3 requires an attestor signature. Provide an attestor account or set it on the firewall."),
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(1_000 * attempt);
      }

      try {
        return await this.writeSignedDecision(decision, walletClient, signer);
      } catch (error) {
        lastError = error;
        if (!isBadAttestorSignatureError(error)) {
          break;
        }
      }
    }

    throw new AttestationFailedError(lastError);
  }

  private async writeSignedDecision(
    decision: FirewallDecision,
    walletClient: WalletClient & { account: Account },
    signer: Account,
  ): Promise<Hex> {
    const nonce = (await withRpcRetry(() =>
      this.publicClient.readContract({
        address: this.contracts.actionAttestation,
        abi: actionAttestationAbi,
        functionName: "nonces",
        args: [decision.agentId],
      }),
    )) as bigint;
    const { evidenceHash } = buildEvidenceReport(decision);
    const { signature, deadline } = await signActionDecision({
      walletClient,
      attestor: signer,
      decision: {
        agentId: decision.agentId,
        policyId: decision.policyId,
        target: decision.tx.to,
        value: decision.tx.value,
        calldataHash: decision.calldataHash,
        selector: decision.selector,
        simulationHash: decision.simulationHash,
        evidenceHash,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
      },
      chainId: this.chain.id,
      verifyingContract: this.contracts.actionAttestation,
      nonce,
    });
    return await walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: this.contracts.actionAttestation,
      abi: actionAttestationAbi,
      functionName: "recordAction",
      args: [
        decision.agentId,
        decision.policyId,
        decision.tx.to,
        decision.tx.value,
        decision.calldataHash,
        decision.selector,
        decision.simulationHash,
        evidenceHash,
        Decision[decision.decision],
        ReasonCode[decision.reasonCode],
        deadline,
        signature,
      ],
    });
  }

  async challengeAction(actionCheckId: bigint, reason: string): Promise<Hex> {
    const walletClient = this.requireWalletClient("challengeAction");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: this.contracts.actionAttestation,
      abi: actionAttestationAbi,
      functionName: "challenge",
      args: [actionCheckId, reason],
    });
  }

  async finalizeAction(actionCheckId: bigint): Promise<Hex> {
    const walletClient = this.requireWalletClient("finalizeAction");
    return walletClient.writeContract({
      account: walletClient.account,
      chain: this.chain,
      address: this.contracts.actionAttestation,
      abi: actionAttestationAbi,
      functionName: "finalize",
      args: [actionCheckId],
    });
  }

  async guardedSendTransaction(action: AgentAction, options: GuardedSendOptions = {}): Promise<GuardedSendResult> {
    const decision = await this.checkAction(action);
    const shouldRecord = options.recordDecision ?? true;
    const shouldThrowOnBlock = options.throwOnBlock ?? true;
    const recordTiming = options.recordTiming ?? "after-send";
    let attestationHash: Hex | undefined;

    if (!decision.allowed) {
      if (shouldRecord) {
        attestationHash = await this.recordDecision(decision);
      }
      if (shouldThrowOnBlock) {
        throw new ActionBlockedError(decision);
      }
      return { decision, sent: false, attestationHash };
    }

    const walletClient = this.requireWalletClient("guardedSendTransaction");
    if (shouldRecord && recordTiming === "before-send") {
      attestationHash = await this.recordDecision(decision);
    }

    const transactionHash = await walletClient.sendTransaction({
      account: walletClient.account,
      chain: this.chain,
      to: decision.tx.to,
      value: decision.tx.value,
      data: decision.tx.data,
    });

    if (shouldRecord && recordTiming === "after-send") {
      attestationHash = await this.recordDecision(decision);
    }

    return { decision, sent: true, attestationHash, transactionHash };
  }

  async runGatewayAction(action: AgentAction, options: GatewayActionOptions = {}): Promise<GatewayActionResult> {
    const mode = options.mode ?? "dry-run";

    if (mode === "execute-if-allowed") {
      const result = await this.guardedSendTransaction(action, {
        recordDecision: options.recordDecision ?? true,
        recordTiming: options.recordTiming,
        throwOnBlock: options.throwOnBlock ?? false,
      });
      return {
        mode,
        status: result.sent ? "executed" : "blocked",
        decision: result.decision,
        sent: result.sent,
        recorded: Boolean(result.attestationHash),
        transactionHash: result.transactionHash,
        attestationHash: result.attestationHash,
        alert: result.decision.allowed ? undefined : gatewayAlert(result.decision),
        nextAction: result.sent
          ? "Transaction was sent after passing Interlock Gateway."
          : "Transaction was blocked before execution. Inspect reasonCode and policy checks.",
      };
    }

    const decision = await this.checkAction(action);

    if (mode === "dry-run") {
      return {
        mode,
        status: decision.allowed ? "allowed" : "blocked",
        decision,
        sent: false,
        recorded: false,
        alert: decision.allowed ? undefined : gatewayAlert(decision),
        nextAction: decision.allowed
          ? "Dry run passed. Use execute-if-allowed to send through the gateway."
          : "Dry run blocked. Fix the proposed action or selected policy before execution.",
      };
    }

    if (mode === "record-only") {
      const attestationHash = await this.recordDecision(decision);
      return {
        mode,
        status: "recorded",
        decision,
        sent: false,
        recorded: true,
        attestationHash,
        alert: decision.allowed ? undefined : gatewayAlert(decision),
        nextAction: "Pre-flight decision was recorded without sending the transaction.",
      };
    }

    if (mode === "block-and-alert") {
      const shouldRecord = options.recordDecision ?? false;
      const attestationHash = !decision.allowed && shouldRecord ? await this.recordDecision(decision) : undefined;
      return {
        mode,
        status: decision.allowed ? "allowed" : "alert",
        decision,
        sent: false,
        recorded: Boolean(attestationHash),
        attestationHash,
        alert: decision.allowed ? undefined : gatewayAlert(decision),
        nextAction: decision.allowed
          ? "Action passed, but block-and-alert mode never executes transactions."
          : "Action was blocked and converted into an alert payload for operator notification.",
      };
    }

    throw new Error(`Unsupported gateway mode: ${mode}`);
  }

  async getActionHistory(filters: ActionHistoryFilters = {}): Promise<ActionHistoryEntry[]> {
    const logs = await withRpcRetry(() =>
      this.publicClient.getContractEvents({
        address: this.contracts.actionAttestation,
        abi: actionAttestationAbi,
        eventName: "ActionChecked",
        args: {
          agentId: filters.agentId,
          policyId: filters.policyId,
        },
        fromBlock: filters.fromBlock ?? 0n,
        toBlock: filters.toBlock ?? "latest",
      }),
    );

    return logs
      .map((log): ActionHistoryEntry | null => {
        const parsed = parseActionCheckedArgs(log.args);
        if (!parsed) return null;
        return {
          ...parsed,
          transactionHash: log.transactionHash!,
          blockNumber: log.blockNumber!,
        };
      })
      .filter((entry): entry is ActionHistoryEntry => entry !== null);
  }

  private async simulate(tx: { to: Address; value: bigint; data: Hex }) {
    try {
      await withRpcRetry(() => this.publicClient.call({ account: this.walletClient?.account?.address, to: tx.to, value: tx.value, data: tx.data }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown simulation error" };
    }
  }

  private requireWalletClient(method: string): WalletClient & { account: Account } {
    if (!this.walletClient?.account) {
      throw new WalletClientRequiredError(method);
    }
    return this.walletClient as WalletClient & { account: Account };
  }

  private validateCreatePolicyInput(input: CreatePolicyInput) {
    assertPositiveId(input.agentId, "agentId");
    assertNonNegativeWei(input.maxNativeValue, "maxNativeValue");
    assertValidSlippageBps(input.maxSlippageBps, "maxSlippageBps");
    for (const [index, target] of input.targets.entries()) {
      assertValidAddress(target, `targets[${index}]`);
    }
    for (const [index, selector] of input.selectors.entries()) {
      assertValidSelector(selector, `selectors[${index}]`);
    }
  }

  private validateAgentAction(action: AgentAction) {
    assertPositiveId(action.agentId, "agentId");
    assertPositiveId(action.policyId, "policyId");
    assertValidAddress(action.tx.to, "tx.to");
    assertNonNegativeWei(action.tx.value, "tx.value");
    assertValidCalldata(action.tx.data, "tx.data");
    assertValidSlippageBps(action.metadata?.expectedSlippageBps, "metadata.expectedSlippageBps");
  }

  private validateDecision(decision: FirewallDecision) {
    assertPositiveId(decision.agentId, "agentId");
    assertPositiveId(decision.policyId, "policyId");
    assertValidAddress(decision.tx.to, "tx.to");
    assertNonNegativeWei(decision.tx.value, "tx.value");
    assertValidCalldata(decision.tx.data, "tx.data");
    assertValidSelector(decision.selector, "selector");
    assertValidBytes32(decision.calldataHash, "calldataHash");
    assertValidBytes32(decision.simulationHash, "simulationHash");
    assertValidDecisionReason(decision.decision, decision.reasonCode);
  }

  private planPolicyPackOperations(
    audit: PolicyPackAuditResult,
    maxNativeValue: bigint,
    maxSlippageBps: number,
    active: boolean,
    prune: boolean,
  ): PolicyPackApplyOperation[] {
    const operations: PolicyPackApplyOperation[] = [];
    const needsPolicyUpdate = audit.mismatches.some((mismatch) =>
      ["MAX_NATIVE_VALUE_MISMATCH", "MAX_SLIPPAGE_BPS_MISMATCH", "ACTIVE_STATE_MISMATCH"].includes(mismatch.code),
    );

    if (needsPolicyUpdate) {
      operations.push({ type: "UPDATE_POLICY", maxNativeValue, maxSlippageBps, active });
    }

    for (const target of audit.targetChecks) {
      if (!target.allowed) {
        operations.push({ type: "ALLOW_TARGET", target: target.target, label: target.label });
      }
    }

    for (const selector of audit.selectorChecks) {
      if (!selector.allowed) {
        operations.push({ type: "ALLOW_SELECTOR", selector: selector.selector, label: selector.label });
      }
    }

    if (prune) {
      for (const target of audit.extraTargets) {
        operations.push({ type: "DENY_TARGET", target });
      }
      for (const selector of audit.extraSelectors) {
        operations.push({ type: "DENY_SELECTOR", selector });
      }
    }

    return operations;
  }

  private async executePolicyPackOperation(policyId: bigint, operation: PolicyPackApplyOperation): Promise<Hex> {
    if (operation.type === "UPDATE_POLICY") {
      return this.updatePolicy({
        policyId,
        maxNativeValue: operation.maxNativeValue,
        maxSlippageBps: operation.maxSlippageBps,
        active: operation.active,
      });
    }

    if (operation.type === "ALLOW_TARGET") {
      return this.setTargetAllowed({ policyId, target: operation.target, allowed: true });
    }

    if (operation.type === "ALLOW_SELECTOR") {
      return this.setSelectorAllowed({ policyId, selector: operation.selector, allowed: true });
    }

    if (operation.type === "DENY_TARGET") {
      return this.setTargetAllowed({ policyId, target: operation.target, allowed: false });
    }

    return this.setSelectorAllowed({ policyId, selector: operation.selector, allowed: false });
  }
}

function gatewayAlert(decision: FirewallDecision): GatewayActionResult["alert"] {
  return {
    event: "action.blocked",
    reasonCode: decision.reasonCode,
    agentId: decision.agentId.toString(),
    policyId: decision.policyId.toString(),
    target: decision.tx.to,
    selector: decision.selector,
    value: decision.tx.value.toString(),
  };
}

function isBadAttestorSignatureError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${(error as { shortMessage?: string }).shortMessage ?? ""}` : String(error);
  return text.includes("BadAttestorSignature") || text.includes("0x6e9e0d3a");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireErc8004Registry(address: Address | undefined, kind: "identity" | "reputation"): Address {
  if (!address) {
    throw new Error(
      `No ERC-8004 ${kind} registry configured. Pass it explicitly or set the ERC8004_${kind === "identity" ? "IDENTITY" : "REPUTATION"}_REGISTRY env.`,
    );
  }
  return address;
}
