import { http } from "viem";

type JsonRpcPayload = {
  id?: string | number | null;
  jsonrpc?: string;
};

export function browserRpcTransport(rpcUrl: string) {
  return http(typeof window === "undefined" ? rpcUrl : "/api/rpc", {
    fetchFn: async (input, init) => {
      const response = await fetch(input, init);
      if (response.status !== 429) return response;

      const payload = parseJsonRpcPayload(init?.body);
      return Response.json(
        {
          jsonrpc: payload?.jsonrpc ?? "2.0",
          id: payload?.id ?? null,
          error: {
            code: -32005,
            message: "Mantle RPC rate limit returned HTTP 429. Configure NEXT_PUBLIC_MANTLE_RPC_URL or a Recorder API with higher rate limits.",
          },
        },
        { status: 200 },
      );
    },
  });
}

function parseJsonRpcPayload(body: BodyInit | null | undefined): JsonRpcPayload | undefined {
  if (typeof body !== "string") return undefined;
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed[0] as JsonRpcPayload | undefined;
    return parsed as JsonRpcPayload;
  } catch {
    return undefined;
  }
}
