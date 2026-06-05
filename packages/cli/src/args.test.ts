import { describe, expect, it } from "vitest";
import {
  bigintFlag,
  CliInputError,
  flagBool,
  flagString,
  flagStrings,
  hexFlag,
  optionalEtherFlag,
  parseCli,
} from "./args.js";

describe("CLI args", () => {
  it("parses flags and repeated values", () => {
    const parsed = parseCli([
      "--",
      "preset",
      "--name",
      "conservative-defi",
      "--target",
      "0xe4dfef03e107225f2239cfff955a378a9a8158be",
      "--target",
      "0xec7608730978b68a8d8c36b5d1f131634621116d",
      "--json",
    ]);

    expect(parsed.command).toBe("preset");
    expect(flagString(parsed.flags, "name")).toBe("conservative-defi");
    expect(flagStrings(parsed.flags, "target")).toEqual([
      "0xe4dfef03e107225f2239cfff955a378a9a8158be",
      "0xec7608730978b68a8d8c36b5d1f131634621116d",
    ]);
    expect(flagBool(parsed.flags, "json")).toBe(true);
  });

  it("parses bigint, hex, and ether values", () => {
    const parsed = parseCli(["preflight", "--agent-id", "7", "--data", "0x1234", "--max-native", "0.02"]);

    expect(bigintFlag(parsed.flags, "agent-id")).toBe(7n);
    expect(hexFlag(parsed.flags, "data")).toBe("0x1234");
    expect(optionalEtherFlag(parsed.flags, "max-native")).toBe(20000000000000000n);
  });

  it("parses nested benchmark command", () => {
    const parsed = parseCli(["benchmark", "run", "--agent-id", "1", "--policy-id", "2"]);

    expect(parsed.command).toBe("benchmark-run");
    expect(bigintFlag(parsed.flags, "agent-id")).toBe(1n);
    expect(bigintFlag(parsed.flags, "policy-id")).toBe(2n);
  });

  it("parses nested gateway command", () => {
    const parsed = parseCli(["gateway", "run", "--mode", "dry-run", "--agent-id", "1", "--policy-id", "2"]);

    expect(parsed.command).toBe("gateway-run");
    expect(flagString(parsed.flags, "mode")).toBe("dry-run");
    expect(bigintFlag(parsed.flags, "policy-id")).toBe(2n);
  });

  it("rejects malformed input", () => {
    expect(() => parseCli([])).toThrow(CliInputError);
    expect(() => parseCli(["preflight", "loose"])).toThrow(CliInputError);
    expect(() => bigintFlag({ "agent-id": "1.5" }, "agent-id")).toThrow(CliInputError);
    expect(() => hexFlag({ data: "1234" }, "data")).toThrow(CliInputError);
  });
});
