import type { IndicatorResult } from "../../types/index.js";

export interface LiquidationData {
  hasLiquidationEvent: boolean;
  hasOracleUpdateSameBlock: boolean;
  liquidationBlock: number;
  oracleUpdateBlock: number;
  liquidationAmount: bigint;
}

export function analyzeLiquidation(data: LiquidationData): IndicatorResult {
  const { hasLiquidationEvent, hasOracleUpdateSameBlock, liquidationBlock } =
    data;

  const detected = hasLiquidationEvent && hasOracleUpdateSameBlock;

  return {
    type: "liquidation_exploit",
    score: detected ? 10 : 0,
    weight: 10,
    severity: detected ? "high" : "low",
    description: detected
      ? "Liquidation event detected within same block as oracle price update"
      : hasLiquidationEvent
        ? "Liquidation event detected but no same-block oracle manipulation"
        : "No liquidation events detected",
    onChainEvidence: detected
      ? `Liquidation and oracle update both in block ${liquidationBlock}`
      : "No correlated liquidation/oracle events",
  };
}
