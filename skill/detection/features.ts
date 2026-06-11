import type { TxAnalysisInput } from "./engine.js";

// ── Canonical feature vector ───────────────────────────────────────────
// The on-chain Stylus RiskEngine (contracts-stylus/) scores this exact
// 8-element vector with the same weights, thresholds, and rounding as
// scoreThreat() in engine.ts. Layout:
//   [0] flash loan detected            (0 or 1)
//   [1] spot price, fixed-point 1e6
//   [2] TWAP price, fixed-point 1e6
//   [3] sandwich pattern detected      (0 or 1)
//   [4] max call depth
//   [5] repeated deep target detected  (0 or 1)
//   [6] liquidation event present      (0 or 1)
//   [7] oracle update in same block    (0 or 1)

export const FEATURE_LEN = 8;

const FLASH_LOAN_SELECTORS = ["0x5cffe9de", "0xab9c4b5d", "0xd9d98ce4"];

export function extractFeatures(input: TxAnalysisInput): bigint[] {
  // [0] flash loan — same selector scan as indicators/flashLoan.ts
  const flash = input.traceCalldata.some((cd) =>
    FLASH_LOAN_SELECTORS.includes(cd.slice(0, 10).toLowerCase())
  )
    ? 1n
    : 0n;

  // [1][2] prices in fixed-point 1e6
  const spotE6 = BigInt(Math.round(input.priceData.spotPrice * 1e6));
  const twapE6 = BigInt(Math.round(input.priceData.twapPrice * 1e6));

  // [3] sandwich — same bracketing scan as indicators/sandwich.ts
  const { txIndex, blockTxs, targetPool } = input.sandwichData;
  const poolLower = targetPool.toLowerCase();
  const poolTxs = blockTxs.filter((tx) => tx.to?.toLowerCase() === poolLower);
  let sandwich = 0n;
  for (const frontTx of poolTxs) {
    if (frontTx.index >= txIndex) continue;
    const backTx = poolTxs.find(
      (tx) =>
        tx.index > txIndex &&
        tx.from.toLowerCase() === frontTx.from.toLowerCase()
    );
    if (backTx) {
      sandwich = 1n;
      break;
    }
  }

  // [4][5] reentrancy inputs — same target-depth map as indicators/reentrancy.ts
  const maxDepth = BigInt(Math.max(...input.traceDepths, 0));
  const targetDepths = new Map<string, number[]>();
  for (let i = 0; i < input.traceTargets.length; i++) {
    const target = input.traceTargets[i].toLowerCase();
    const depths = targetDepths.get(target) || [];
    depths.push(input.traceDepths[i]);
    targetDepths.set(target, depths);
  }
  let repeatedDeep = 0n;
  for (const depths of targetDepths.values()) {
    if (depths.length > 2 && depths.some((d) => d > 3)) {
      repeatedDeep = 1n;
      break;
    }
  }

  // [6][7] liquidation correlation inputs
  const hasLiq = input.liquidationData.hasLiquidationEvent ? 1n : 0n;
  const hasOracle = input.liquidationData.hasOracleUpdateSameBlock ? 1n : 0n;

  return [flash, spotE6, twapE6, sandwich, maxDepth, repeatedDeep, hasLiq, hasOracle];
}

// ── Integer scorer (mirror of contracts-stylus/src/scoring.rs) ─────────

export const THRESHOLD_FLAG = 31;
export const THRESHOLD_BLOCK = 61;

function priceDeviationScore(spotE6: bigint, twapE6: bigint): bigint {
  if (twapE6 === 0n) return 0n;
  const dev = spotE6 > twapE6 ? spotE6 - twapE6 : twapE6 - spotE6;
  // detected iff sigmaMultiple = dev / (0.02 * twap) > 3  ⇔  50*dev > 3*twap
  if (50n * dev <= 3n * twapE6) return 0n;
  // min(25, round_half_up(250*dev / twap)) — matches Math.round in engine.ts
  const rounded = (2n * 250n * dev + twapE6) / (2n * twapE6);
  return rounded > 25n ? 25n : rounded;
}

export function indicatorScoresFromFeatures(features: bigint[]): bigint[] {
  const [flash, spotE6, twapE6, sandwich, maxDepth, repeatedDeep, hasLiq, hasOracle] =
    features;
  return [
    flash !== 0n ? 30n : 0n,
    priceDeviationScore(spotE6, twapE6),
    sandwich !== 0n ? 20n : 0n,
    maxDepth > 3n ? (repeatedDeep !== 0n ? 15n : 8n) : 0n,
    hasLiq !== 0n && hasOracle !== 0n ? 10n : 0n,
  ];
}

export function scoreFeatures(features: bigint[]): {
  total: number;
  recommendation: 0 | 1 | 2;
} {
  const total = Number(
    indicatorScoresFromFeatures(features).reduce((a, b) => a + b, 0n)
  );
  const recommendation =
    total >= THRESHOLD_BLOCK ? 2 : total >= THRESHOLD_FLAG ? 1 : 0;
  return { total, recommendation };
}
