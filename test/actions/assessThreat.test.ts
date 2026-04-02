import { describe, it, expect } from "vitest";
import { assessThreat } from "../../skill/actions/assessThreat.js";

describe("assessThreat action", () => {
  it("should assess a GMX oracle manipulation replay", async () => {
    const result = await assessThreat({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      network: "arbitrum_one",
      replayMode: true,
      replayId: "gmx_oracle_manipulation_2022",
    });

    expect(result.txHash).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001"
    );
    expect(result.threatScore).toBeGreaterThan(30);
    expect(result.recommendation).not.toBe("allow");
    expect(result.indicators.length).toBeGreaterThan(0);
    expect(result.assessedAt).toBeGreaterThan(0);
  });

  it("should assess a Radiant flash loan replay", async () => {
    const result = await assessThreat({
      txHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
      network: "arbitrum_one",
      replayMode: true,
      replayId: "radiant_flashloan_2024",
    });

    expect(result.threatScore).toBeGreaterThan(30);
    expect(result.threatType).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should throw on unknown replay ID", async () => {
    await expect(
      assessThreat({
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        network: "arbitrum_one",
        replayMode: true,
        replayId: "nonexistent_replay",
      })
    ).rejects.toThrow("Unknown replay ID");
  });
});
