import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { selectFinalizable } from "./keeper-finalize.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

// ACTIVE (0) past its window is finalizable.
assert.deepEqual(
  selectFinalizable([{ id: 1n, status: 0, finalizableAt: 100n }], 200n),
  [1n],
);

// ACTIVE but still inside the window is NOT finalizable.
assert.deepEqual(
  selectFinalizable([{ id: 1n, status: 0, finalizableAt: 100n }], 50n),
  [],
);

// Exactly at finalizableAt is finalizable (>= boundary).
assert.deepEqual(
  selectFinalizable([{ id: 7n, status: 0, finalizableAt: 100n }], 100n),
  [7n],
);

// CHALLENGED (1) and FINALIZED (2) are always skipped, even past the window.
assert.deepEqual(
  selectFinalizable(
    [
      { id: 1n, status: 1, finalizableAt: 100n },
      { id: 2n, status: 2, finalizableAt: 100n },
    ],
    9999n,
  ),
  [],
);

// Mixed batch returns only the ready ACTIVE ids, in order.
assert.deepEqual(
  selectFinalizable(
    [
      { id: 1n, status: 0, finalizableAt: 100n }, // ready
      { id: 2n, status: 0, finalizableAt: 9000n }, // window open
      { id: 3n, status: 1, finalizableAt: 100n }, // challenged
      { id: 4n, status: 0, finalizableAt: 50n }, // ready
    ],
    200n,
  ),
  [1n, 4n],
);

// package.json wiring.
assert.match(packageJson.scripts["keeper:finalize"], /keeper-finalize\.mjs/);
assert.match(packageJson.scripts["keeper:finalize:check"], /--check-only/);
assert.match(packageJson.scripts["smoke:all"], /keeper:finalize:test/);

console.log("Keeper finalize tests passed");
