import type { IndicatorResult } from "../../types/index.js";

const FLASH_LOAN_SELECTORS = [
  "0x5cffe9de", // flashLoan(address,address[],uint256[],uint256[],address,bytes,uint16)
  "0xab9c4b5d", // flashSwap
  "0xd9d98ce4", // flashBorrow
];

export function analyzeFlashLoan(
  traceCalldata: string[],
  traceDepth: number[]
): IndicatorResult {
  let detected = false;
  let evidence = "";

  for (let i = 0; i < traceCalldata.length; i++) {
    const selector = traceCalldata[i].slice(0, 10).toLowerCase();
    if (FLASH_LOAN_SELECTORS.includes(selector)) {
      detected = true;
      evidence = `Flash loan selector ${selector} found at trace index ${i} (depth ${traceDepth[i]})`;
      break;
    }
  }

  return {
    type: "flash_loan_initiation",
    score: detected ? 30 : 0,
    weight: 30,
    severity: detected ? "high" : "low",
    description: detected
      ? "Flash loan initiation detected in transaction call trace"
      : "No flash loan activity detected",
    onChainEvidence: evidence || "No flash loan selectors found in trace",
  };
}
