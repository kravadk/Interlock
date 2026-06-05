import { mantleSepolia } from "@interlock/shared";
import { rateLimit } from "../../../lib/rate-limit";

type JsonRpcPayload = {
  id?: string | number | null;
  jsonrpc?: string;
};

export async function POST(request: Request) {
  const limited = rateLimit(request, "rpc");
  if (limited) return limited;

  const rpcUrl = process.env.MANTLE_RPC_URL ?? process.env.NEXT_PUBLIC_MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const body = await request.text();

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await response.text();
    if (response.ok) {
      return new Response(text, {
        status: 200,
        headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
      });
    }

    const payload = parseJsonRpcPayload(body);
    return Response.json(toRpcError(payload, `Mantle RPC returned HTTP ${response.status}: ${text || response.statusText}`));
  } catch (error) {
    const payload = parseJsonRpcPayload(body);
    return Response.json(toRpcError(payload, error instanceof Error ? error.message : String(error)));
  }
}

function toRpcError(payload: JsonRpcPayload | undefined, message: string) {
  return {
    jsonrpc: payload?.jsonrpc ?? "2.0",
    id: payload?.id ?? null,
    error: {
      code: -32005,
      message,
    },
  };
}

function parseJsonRpcPayload(body: string): JsonRpcPayload | undefined {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed[0] as JsonRpcPayload | undefined;
    return parsed as JsonRpcPayload;
  } catch {
    return undefined;
  }
}
