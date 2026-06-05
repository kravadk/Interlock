import { createHmac, randomUUID } from "node:crypto";
import type { IndexedActionRecord } from "./types.js";

export type WebhookEvent = "allow" | "block" | "simulation_failed" | "policy_changed" | "benchmark_failed";

export type WebhookFormat = "generic" | "discord" | "slack" | "telegram";

export type WebhookConfig = {
  url?: string;
  secret?: string;
  events: WebhookEvent[];
  /** Output shape. "generic" = signed JSON; others format a chat message for that platform. */
  format?: WebhookFormat;
  /** Telegram chat id (required when format is "telegram"). */
  telegramChatId?: string;
};

export type WebhookDeliveryState = {
  configured: boolean;
  events: string[];
  lastDeliveryAt?: string;
  lastDeliveryOk?: boolean;
  lastDeliveryError?: string;
};

export function loadWebhookConfig(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    url: emptyToUndefined(env.WEBHOOK_URL),
    secret: emptyToUndefined(env.WEBHOOK_SECRET),
    events: parseWebhookEvents(env.WEBHOOK_EVENTS),
    format: parseWebhookFormat(env.WEBHOOK_FORMAT),
    telegramChatId: emptyToUndefined(env.TELEGRAM_CHAT_ID),
  };
}

export function createWebhookDispatcher(config: WebhookConfig, explorerBaseUrl = "https://sepolia.mantlescan.xyz") {
  const state: WebhookDeliveryState = {
    configured: Boolean(config.url),
    events: config.events,
  };

  async function deliverActions(actions: IndexedActionRecord[]) {
    if (!config.url) return;
    for (const action of actions) {
      const event = eventForAction(action);
      if (!event || !config.events.includes(event.kind)) continue;
      await deliverWithRetry(config, event.name, payloadForAction(action, event.name, explorerBaseUrl), state);
    }
  }

  /** Dispatch a non-action event (e.g. policy.changed, benchmark.failed). */
  async function deliverEvent(kind: WebhookEvent, name: string, payload: Record<string, unknown>) {
    if (!config.url || !config.events.includes(kind)) return;
    await deliverWithRetry(config, name, { event: name, ...payload }, state);
  }

  return { state, deliverActions, deliverEvent };
}

export function payloadForAction(action: IndexedActionRecord, event: string, explorerBaseUrl = "https://sepolia.mantlescan.xyz") {
  return {
    event,
    agentId: action.agentId,
    policyId: action.policyId,
    decision: action.decision,
    reasonCode: action.reasonCode,
    target: action.target,
    selector: action.selector,
    value: action.value,
    transactionHash: action.transactionHash,
    blockNumber: action.blockNumber,
    explorerUrl: `${explorerBaseUrl.replace(/\/$/, "")}/tx/${action.transactionHash}`,
  };
}

export function signWebhookBody(secret: string | undefined, body: string) {
  if (!secret) return undefined;
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function eventForAction(action: IndexedActionRecord): { kind: WebhookEvent; name: string } | undefined {
  if (action.reasonCode === "SIMULATION_FAILED") return { kind: "simulation_failed", name: "action.simulation_failed" };
  if (action.decision === "ALLOW") return { kind: "allow", name: "action.allowed" };
  if (action.decision === "BLOCK") return { kind: "block", name: "action.blocked" };
  return undefined;
}

/** Build a short human-readable message line from a webhook payload. */
export function formatWebhookMessage(event: string, payload: Record<string, unknown>): string {
  const parts = [`Interlock: ${event}`];
  if (payload.decision) parts.push(`${String(payload.decision)}/${String(payload.reasonCode ?? "")}`.replace(/\/$/, ""));
  if (payload.agentId !== undefined) parts.push(`agent #${String(payload.agentId)}`);
  if (payload.target) parts.push(`target ${String(payload.target)}`);
  if (payload.explorerUrl) parts.push(String(payload.explorerUrl));
  return parts.join(" · ");
}

/** Transform a generic payload into the body shape expected by the configured platform. */
export function buildPlatformBody(config: WebhookConfig, event: string, payload: Record<string, unknown>): string {
  const message = formatWebhookMessage(event, payload);
  switch (config.format) {
    case "discord":
      return JSON.stringify({ content: message });
    case "slack":
      return JSON.stringify({ text: message });
    case "telegram":
      return JSON.stringify({ chat_id: config.telegramChatId ?? "", text: message });
    default:
      return JSON.stringify(payload);
  }
}

async function deliverWithRetry(config: WebhookConfig, event: string, payload: Record<string, unknown>, state: WebhookDeliveryState) {
  const body = buildPlatformBody(config, event, payload);
  // Only the generic JSON body is HMAC-signed; chat platforms verify via their own URL secret.
  const signature = (config.format ?? "generic") === "generic" ? signWebhookBody(config.secret, body) : undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(config.url!, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-interlock-event": event,
          "x-interlock-delivery": randomUUID(),
          ...(signature ? { "x-interlock-signature": signature } : {}),
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }
      state.lastDeliveryAt = new Date().toISOString();
      state.lastDeliveryOk = true;
      state.lastDeliveryError = undefined;
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await delay(150 * attempt);
      }
    }
  }

  state.lastDeliveryAt = new Date().toISOString();
  state.lastDeliveryOk = false;
  state.lastDeliveryError = lastError instanceof Error ? lastError.message : String(lastError);
}

function parseWebhookEvents(value: string | undefined): WebhookEvent[] {
  const raw = value?.trim() ? value.split(",") : ["block", "simulation_failed"];
  const valid = new Set<WebhookEvent>(["allow", "block", "simulation_failed", "policy_changed", "benchmark_failed"]);
  return raw.map((item) => item.trim().toLowerCase()).filter((item): item is WebhookEvent => valid.has(item as WebhookEvent));
}

function parseWebhookFormat(value: string | undefined): WebhookFormat {
  const valid = new Set<WebhookFormat>(["generic", "discord", "slack", "telegram"]);
  const candidate = value?.trim().toLowerCase() as WebhookFormat | undefined;
  return candidate && valid.has(candidate) ? candidate : "generic";
}

function emptyToUndefined(value: string | undefined) {
  return value?.trim() ? value.trim() : undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
