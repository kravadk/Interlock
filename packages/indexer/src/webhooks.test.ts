import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { buildPlatformBody, createWebhookDispatcher, formatWebhookMessage, payloadForAction, signWebhookBody } from "./webhooks.js";
import type { IndexedActionRecord } from "./types.js";

describe("webhook formatters", () => {
  const payload = { event: "action.blocked", decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED", agentId: "1", target: "0xabc", explorerUrl: "https://sepolia.mantlescan.xyz/tx/0x1" };

  it("formats a readable message line", () => {
    const msg = formatWebhookMessage("action.blocked", payload);
    expect(msg).toContain("action.blocked");
    expect(msg).toContain("BLOCK/TARGET_NOT_ALLOWED");
    expect(msg).toContain("agent #1");
  });

  it("wraps the message for discord, slack, and telegram", () => {
    expect(JSON.parse(buildPlatformBody({ events: [], format: "discord" }, "action.blocked", payload)).content).toContain("action.blocked");
    expect(JSON.parse(buildPlatformBody({ events: [], format: "slack" }, "action.blocked", payload)).text).toContain("action.blocked");
    const tg = JSON.parse(buildPlatformBody({ events: [], format: "telegram", telegramChatId: "42" }, "action.blocked", payload));
    expect(tg.chat_id).toBe("42");
    expect(tg.text).toContain("action.blocked");
  });

  it("keeps generic format as the raw signed JSON payload", () => {
    expect(JSON.parse(buildPlatformBody({ events: [] }, "action.blocked", payload)).reasonCode).toBe("TARGET_NOT_ALLOWED");
  });
});

const blockedAction: IndexedActionRecord = {
  actionCheckId: "1",
  agentId: "1",
  policyId: "2",
  target: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
  value: "0",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0xd0e30db0",
  simulationHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
  decision: "BLOCK",
  reasonCode: "TARGET_NOT_ALLOWED",
  timestamp: "1710000000",
  transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  blockNumber: "12",
};

describe("webhooks", () => {
  it("signs webhook bodies", () => {
    expect(signWebhookBody("secret", "{\"ok\":true}")).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("builds action webhook payloads", () => {
    expect(payloadForAction(blockedAction, "action.blocked")).toMatchObject({
      event: "action.blocked",
      agentId: "1",
      policyId: "2",
      decision: "BLOCK",
      reasonCode: "TARGET_NOT_ALLOWED",
      explorerUrl: `https://sepolia.mantlescan.xyz/tx/${blockedAction.transactionHash}`,
    });
  });

  it("delivers configured signed events without throwing", async () => {
    const received: Array<{ event?: string; signature?: string; body: unknown }> = [];
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received.push({
        event: req.headers["x-interlock-event"]?.toString(),
        signature: req.headers["x-interlock-signature"]?.toString(),
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      res.writeHead(200).end("ok");
    });

    try {
      const baseUrl = await listen(server);
      const dispatcher = createWebhookDispatcher({ url: baseUrl, secret: "secret", events: ["block"] });
      await dispatcher.deliverActions([blockedAction]);

      expect(dispatcher.state.lastDeliveryOk).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]?.event).toBe("action.blocked");
      expect(received[0]?.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    } finally {
      await close(server);
    }
  });

  it("does nothing when disabled", async () => {
    const dispatcher = createWebhookDispatcher({ events: ["block"] });
    await dispatcher.deliverActions([blockedAction]);
    expect(dispatcher.state.configured).toBe(false);
    expect(dispatcher.state.lastDeliveryAt).toBeUndefined();
  });
});

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not expose a TCP address.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
