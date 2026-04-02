import type { IndicatorResult } from "../../types/index.js";

export interface SandwichData {
  txIndex: number;
  blockTxs: Array<{
    from: string;
    to: string;
    index: number;
    value: bigint;
    input: string;
  }>;
  targetPool: string;
}

export function analyzeSandwich(data: SandwichData): IndicatorResult {
  const { txIndex, blockTxs, targetPool } = data;
  const poolLower = targetPool.toLowerCase();

  // Look for same-sender txs that bracket the target tx
  const poolTxs = blockTxs.filter(
    (tx) => tx.to?.toLowerCase() === poolLower
  );

  let detected = false;
  let evidence = "";

  for (const frontTx of poolTxs) {
    if (frontTx.index >= txIndex) continue;
    // Look for a matching back-run after our tx
    const backTx = poolTxs.find(
      (tx) =>
        tx.index > txIndex &&
        tx.from.toLowerCase() === frontTx.from.toLowerCase()
    );
    if (backTx) {
      detected = true;
      evidence = `Sandwich detected: front-run at index ${frontTx.index}, victim at ${txIndex}, back-run at index ${backTx.index} by ${frontTx.from}`;
      break;
    }
  }

  return {
    type: "sandwich_attack",
    score: detected ? 20 : 0,
    weight: 20,
    severity: detected ? "high" : "low",
    description: detected
      ? "Sandwich attack pattern detected (front-run + back-run by same address)"
      : "No sandwich pattern detected in block",
    onChainEvidence: evidence || "No bracketing transactions found",
  };
}
