import type { IndicatorResult } from "../../types/index.js";

export interface PriceData {
  spotPrice: number;
  twapPrice: number;
  blockNumber: number;
  windowBlocks: number;
}

export function analyzePriceDeviation(priceData: PriceData): IndicatorResult {
  const { spotPrice, twapPrice, blockNumber, windowBlocks } = priceData;

  // Calculate standard deviation estimate from TWAP window
  // Using a simplified model: sigma ~ 2% of TWAP for stable pairs
  const estimatedSigma = twapPrice * 0.02;
  const deviation = Math.abs(spotPrice - twapPrice);
  const sigmaMultiple =
    estimatedSigma > 0 ? deviation / estimatedSigma : 0;

  const detected = sigmaMultiple > 3;
  const score = detected ? Math.min(25, Math.round(sigmaMultiple * 5)) : 0;

  return {
    type: "price_deviation",
    score,
    weight: 25,
    severity:
      sigmaMultiple > 5
        ? "critical"
        : sigmaMultiple > 3
          ? "high"
          : "low",
    description: detected
      ? `Spot price deviated ${sigmaMultiple.toFixed(1)}σ from ${windowBlocks}-block TWAP at execution block`
      : `Price within normal range (${sigmaMultiple.toFixed(1)}σ)`,
    onChainEvidence: detected
      ? `block ${blockNumber}: spot=${spotPrice.toFixed(4)}, twap=${twapPrice.toFixed(4)}, sigma=${estimatedSigma.toFixed(4)}`
      : "Price deviation within 3σ threshold",
  };
}
