import { describe, it, expect } from "vitest";
import { scoreThreat } from "../../skill/detection/engine.js";
import {
  extractFeatures,
  scoreFeatures,
  indicatorScoresFromFeatures,
} from "../../skill/detection/features.js";
import {
  getReplayIds,
  getReplayInput,
} from "../../skill/detection/replays/index.js";

// The on-chain Stylus RiskEngine (contracts-stylus/src/scoring.rs) implements
// the identical integer scoring. These tests pin the canonical values that
// the Rust test suite (cargo test) asserts against via parity_cases.rs, so
// TS float scorer ≡ TS integer scorer ≡ Stylus scorer.
const EXPECTED: Record<string, { total: number; recommendation: number }> = {
  gmx_oracle_manipulation_2022: { total: 63, recommendation: 2 },
  camelot_flash_drain_2023: { total: 30, recommendation: 0 },
  radiant_flashloan_2024: { total: 73, recommendation: 2 },
};

describe("Stylus parity: feature scorer matches float engine", () => {
  for (const id of Object.keys(EXPECTED)) {
    it(`replay ${id}: integer feature score == TS engine score`, () => {
      const input = getReplayInput(id);
      expect(input).not.toBeNull();
      const tsResult = scoreThreat(input!);
      const features = extractFeatures(input!);
      const intResult = scoreFeatures(features);

      expect(intResult.total).toBe(tsResult.score);
      expect(intResult.total).toBe(EXPECTED[id].total);
      expect(intResult.recommendation).toBe(EXPECTED[id].recommendation);
    });
  }

  it("covers all known replays", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(getReplayIds().sort());
  });

  it("per-indicator breakdown matches the engine indicators", () => {
    for (const id of getReplayIds()) {
      const input = getReplayInput(id)!;
      const engineScores = scoreThreat(input).indicators.map((i) =>
        BigInt(i.score)
      );
      const featureScores = indicatorScoresFromFeatures(extractFeatures(input));
      expect(featureScores).toEqual(engineScores);
    }
  });
});
