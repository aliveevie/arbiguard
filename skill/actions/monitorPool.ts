import { type PublicClient } from "viem";
import { getPublicClient } from "../contracts/client.js";
import type { MonitorPoolParams, MonitorPoolResult } from "../types/index.js";
import { buildAssessmentResult, fetchTxAnalysisInput } from "../detection/engine.js";

// Protocol-specific event signatures to subscribe to
const PROTOCOL_EVENTS: Record<string, string[]> = {
  gmx_v2: [
    "PositionIncrease(address,address,address,uint256,uint256)",
    "PositionDecrease(address,address,address,uint256,uint256)",
    "Swap(address,address,address,uint256,uint256)",
  ],
  camelot: [
    "Swap(address,uint256,uint256,uint256,uint256,address)",
    "Mint(address,uint256,uint256)",
    "Burn(address,uint256,uint256,address)",
  ],
  aave_v3: [
    "Supply(address,address,address,uint256,uint16)",
    "Borrow(address,address,address,uint256,uint256,uint16)",
    "LiquidationCall(address,address,address,uint256,uint256,address,bool)",
    "FlashLoan(address,address,address,uint256,uint256,uint16)",
  ],
};

const activeSessions = new Map<string, { unwatch: () => void }>();

export async function monitorPool(
  params: MonitorPoolParams
): Promise<MonitorPoolResult> {
  const { poolAddress, protocol, network } = params;
  const sessionId = `${protocol}-${poolAddress}-${Date.now()}`;

  try {
    const client = getPublicClient(network);
    const subscribedEvents = PROTOCOL_EVENTS[protocol] || [];

    // Subscribe to logs from the pool address
    const unwatch = client.watchBlockNumber({
      onBlockNumber: async (blockNumber) => {
        try {
          const block = await client.getBlock({
            blockNumber,
            includeTransactions: true,
          });

          // Filter transactions interacting with the pool
          for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (tx.to?.toLowerCase() !== poolAddress.toLowerCase()) continue;

            const assessment = await fetchTxAnalysisInput(
              tx.hash,
              network,
              poolAddress
            ).then((input) => buildAssessmentResult(tx.hash, input));

            if (
              assessment.recommendation === "block" ||
              assessment.recommendation === "flag"
            ) {
              console.log(
                `[ArbiGuard] ${assessment.recommendation.toUpperCase()}: tx ${tx.hash} scored ${assessment.threatScore}`
              );

              // Send webhook if configured
              if (params.callbackUrl) {
                fetch(params.callbackUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(assessment),
                }).catch(() => {});
              }
            }
          }
        } catch {
          // Silently continue monitoring on individual block errors
        }
      },
    });

    activeSessions.set(sessionId, { unwatch });

    return {
      sessionId,
      status: "active",
      poolAddress,
      protocol,
      subscribedEvents,
      startedAt: Date.now(),
    };
  } catch {
    return {
      sessionId,
      status: "error",
      poolAddress,
      protocol,
      subscribedEvents: [],
      startedAt: Date.now(),
    };
  }
}

export function stopMonitoring(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.unwatch();
    activeSessions.delete(sessionId);
    return true;
  }
  return false;
}
