import type { IndicatorResult } from "../../types/index.js";

export interface TraceData {
  callDepths: number[];
  callTargets: string[];
}

export function analyzeReentrancy(traceData: TraceData): IndicatorResult {
  const { callDepths, callTargets } = traceData;

  const maxDepth = Math.max(...callDepths, 0);
  const detected = maxDepth > 3;

  // Check for repeated calls to same target at increasing depth
  let reentrantTarget = "";
  const targetDepths = new Map<string, number[]>();
  for (let i = 0; i < callTargets.length; i++) {
    const target = callTargets[i].toLowerCase();
    const depths = targetDepths.get(target) || [];
    depths.push(callDepths[i]);
    targetDepths.set(target, depths);
  }

  for (const [target, depths] of targetDepths) {
    if (depths.length > 2 && depths.some((d) => d > 3)) {
      reentrantTarget = target;
      break;
    }
  }

  const hasReentrancy = detected && reentrantTarget !== "";

  return {
    type: "reentrancy",
    score: hasReentrancy ? 15 : detected ? 8 : 0,
    weight: 15,
    severity: hasReentrancy ? "critical" : detected ? "medium" : "low",
    description: hasReentrancy
      ? `Reentrancy pattern detected: repeated calls to ${reentrantTarget} at depth > 3`
      : detected
        ? `Deep call trace detected (max depth: ${maxDepth}) but no reentrancy pattern`
        : "Call depth within normal range",
    onChainEvidence: hasReentrancy
      ? `Target ${reentrantTarget} called ${targetDepths.get(reentrantTarget)?.length} times, max depth ${maxDepth}`
      : `Max call depth: ${maxDepth}`,
  };
}
