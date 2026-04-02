import type {
  AssessThreatParams,
  ThreatAssessmentResult,
} from "../types/index.js";
import {
  buildAssessmentResult,
  fetchTxAnalysisInput,
} from "../detection/engine.js";
import { getReplayInput } from "../detection/replays/index.js";

export async function assessThreat(
  params: AssessThreatParams
): Promise<ThreatAssessmentResult> {
  const { txHash, network, poolAddress, replayMode, replayId } = params;

  // Replay mode: use pre-loaded mock data instead of live RPC
  if (replayMode && replayId) {
    const replayInput = getReplayInput(replayId);
    if (!replayInput) {
      throw new Error(`Unknown replay ID: ${replayId}`);
    }
    return buildAssessmentResult(txHash, replayInput);
  }

  // Live mode: fetch real on-chain data
  const input = await fetchTxAnalysisInput(txHash, network, poolAddress);
  return buildAssessmentResult(txHash, input);
}
