import { describe, it, expect } from "vitest";
import { scoreThreat, buildAssessmentResult } from "../../skill/detection/engine.js";
import type { TxAnalysisInput } from "../../skill/detection/engine.js";
import { getReplayInput, getReplayIds } from "../../skill/detection/replays/index.js";

function makeCleanInput(): TxAnalysisInput {
  return {
    traceCalldata: ["0x38ed1739"],
    traceDepths: [0],
    traceTargets: ["0xSomeRouter"],
    priceData: {
      spotPrice: 1.0,
      twapPrice: 1.0,
      blockNumber: 100,
      windowBlocks: 30,
    },
    sandwichData: {
      txIndex: 5,
      blockTxs: [],
      targetPool: "0xSomePool",
    },
    liquidationData: {
      hasLiquidationEvent: false,
      hasOracleUpdateSameBlock: false,
      liquidationBlock: 100,
      oracleUpdateBlock: 0,
      liquidationAmount: 0n,
    },
  };
}

describe("Detection Engine", () => {
  it("should score a clean transaction as 0 (allow)", () => {
    const input = makeCleanInput();
    const result = scoreThreat(input);
    expect(result.score).toBe(0);
    expect(result.threatType).toBeNull();
  });

  it("should detect flash loan in calldata", () => {
    const input = makeCleanInput();
    input.traceCalldata = ["0x5cffe9de000000000000"];
    const result = scoreThreat(input);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.threatType).toBe("flash_loan_abuse");
  });

  it("should detect price deviation > 3 sigma", () => {
    const input = makeCleanInput();
    input.priceData = {
      spotPrice: 2.5,
      twapPrice: 1.0,
      blockNumber: 100,
      windowBlocks: 30,
    };
    const result = scoreThreat(input);
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.threatType).toBe("price_manipulation");
  });

  it("should detect sandwich attack pattern", () => {
    const input = makeCleanInput();
    input.sandwichData = {
      txIndex: 5,
      blockTxs: [
        { from: "0xAttacker", to: "0xPool", index: 3, value: 0n, input: "0x" },
        { from: "0xVictim", to: "0xPool", index: 5, value: 0n, input: "0x" },
        { from: "0xAttacker", to: "0xPool", index: 7, value: 0n, input: "0x" },
      ],
      targetPool: "0xPool",
    };
    const result = scoreThreat(input);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it("should classify recommendation correctly", () => {
    const input = makeCleanInput();
    // Combine flash loan + price deviation for high score
    input.traceCalldata = ["0x5cffe9de000000000000"];
    input.priceData = {
      spotPrice: 2.5,
      twapPrice: 1.0,
      blockNumber: 100,
      windowBlocks: 30,
    };
    const result = buildAssessmentResult("0xabc" as `0x${string}`, input);
    expect(["flag", "block"]).toContain(result.recommendation);
    expect(result.threatScore).toBeGreaterThanOrEqual(50);
    expect(result.indicators.length).toBeGreaterThan(0);
  });

  it("should have all replay IDs available", () => {
    const ids = getReplayIds();
    expect(ids).toContain("gmx_oracle_manipulation_2022");
    expect(ids).toContain("camelot_flash_drain_2023");
    expect(ids).toContain("radiant_flashloan_2024");
  });

  it("should produce non-zero scores for replay data", () => {
    for (const id of getReplayIds()) {
      const input = getReplayInput(id);
      expect(input).not.toBeNull();
      const result = scoreThreat(input!);
      expect(result.score).toBeGreaterThan(0);
    }
  });
});
