export type RpcRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  label?: string;
};

export async function withRpcRetry<T>(operation: () => Promise<T>, options: RpcRetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 300;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableRpcError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

export function isRetryableRpcError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("temporarily unavailable") ||
    message.includes("503") ||
    message.includes("429") ||
    // Multiplexed RPCs (e.g. drpc) route requests across backends; a node that hasn't synced the tx's
    // block yet returns these transiently while waiting for a receipt — safe to retry.
    message.includes("unknown block") ||
    message.includes("not found") ||
    message.includes("could not be found") ||
    message.includes("header not found")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
