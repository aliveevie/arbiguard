import { describe, it, expect } from "vitest";
import { assessThreat } from "../../skill/actions/assessThreat.js";
import { getReplayIds } from "../../skill/detection/replays/index.js";

describe("Threat Assessment - Replay Mode (all exploits)", () => {
  it("GMX oracle manipulation should score high", async () => {
    const result = await assessThreat({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      network: "arbitrum_one",
      replayMode: true,
      replayId: "gmx_oracle_manipulation_2022",
    });

    expect(result.threatScore).toBeGreaterThan(30);
    expect(["price_manipulation", "flash_loan_abuse"]).toContain(result.threatType);
    expect(result.recommendation).not.toBe("allow");
    expect(result.indicators.some((i) => i.severity === "high" || i.severity === "critical")).toBe(true);
  });

  it("Camelot flash drain should detect flash loan", async () => {
    const result = await assessThreat({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
      network: "arbitrum_one",
      replayMode: true,
      replayId: "camelot_flash_drain_2023",
    });

    expect(result.threatScore).toBeGreaterThan(20);
    expect(result.threatType).toBe("flash_loan_abuse");
    expect(result.indicators.some((i) => i.type === "flash_loan_initiation")).toBe(true);
  });

  it("Radiant flashloan should detect multiple indicators", async () => {
    const result = await assessThreat({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
      network: "arbitrum_one",
      replayMode: true,
      replayId: "radiant_flashloan_2024",
    });

    expect(result.threatScore).toBeGreaterThan(40);
    expect(result.indicators.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.recommendation).not.toBe("allow");
  });

  it("all replay IDs produce valid assessments", async () => {
    for (const id of getReplayIds()) {
      const result = await assessThreat({
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000099",
        network: "arbitrum_one",
        replayMode: true,
        replayId: id,
      });

      expect(result.threatScore).toBeGreaterThan(0);
      expect(result.threatType).not.toBeNull();
      expect(result.assessedAt).toBeGreaterThan(0);
      expect(["allow", "flag", "block"]).toContain(result.recommendation);
    }
  });
});
