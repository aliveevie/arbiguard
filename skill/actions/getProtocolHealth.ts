import {
  getPublicClient,
  CIRCUIT_BREAKER_ADDRESS,
} from "../contracts/client.js";
import type {
  ProtocolHealthParams,
  ProtocolHealthReport,
  Alert,
  Anomaly,
} from "../types/index.js";
import circuitBreakerAbi from "../contracts/abi/ArbiGuardCircuitBreaker.json" with { type: "json" };

export async function getProtocolHealth(
  params: ProtocolHealthParams
): Promise<ProtocolHealthReport> {
  const { protocol, network, lookbackBlocks = 1000 } = params;

  const client = getPublicClient(network);
  const contractAddress = CIRCUIT_BREAKER_ADDRESS[network];

  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock - BigInt(lookbackBlocks);

    // Fetch circuit breaker events from the lookback window
    const pauseEvents = await client.getLogs({
      address: contractAddress,
      event: {
        type: "event",
        name: "PoolPaused",
        inputs: [
          { type: "address", name: "pool", indexed: true },
          { type: "address", name: "initiator", indexed: true },
          { type: "uint256", name: "blockNum" },
        ],
      },
      fromBlock,
      toBlock: currentBlock,
    });

    const rateLimitEvents = await client.getLogs({
      address: contractAddress,
      event: {
        type: "event",
        name: "PoolRateLimited",
        inputs: [
          { type: "address", name: "pool", indexed: true },
          { type: "uint256", name: "maxVolume" },
          { type: "uint256", name: "cooldown" },
        ],
      },
      fromBlock,
      toBlock: currentBlock,
    });

    // Build alerts from events
    const activeAlerts: Alert[] = [];

    for (const event of pauseEvents) {
      activeAlerts.push({
        severity: "critical",
        message: `Pool ${event.args.pool} was paused at block ${event.args.blockNum}`,
        poolAddress: event.args.pool as `0x${string}`,
        detectedAt: Date.now(),
      });
    }

    for (const event of rateLimitEvents) {
      activeAlerts.push({
        severity: "warning",
        message: `Pool ${event.args.pool} rate-limited: max ${event.args.maxVolume} per block`,
        poolAddress: event.args.pool as `0x${string}`,
        detectedAt: Date.now(),
      });
    }

    // Build anomaly list from pause events (these represent detected threats)
    const recentAnomalies: Anomaly[] = pauseEvents.map((event) => ({
      type: "circuit_breaker_triggered",
      txHash: event.transactionHash as `0x${string}`,
      description: `Circuit breaker triggered for pool ${event.args.pool}`,
      blockNumber: Number(event.blockNumber),
    }));

    // Determine circuit breaker status
    let circuitBreakerStatus: "armed" | "triggered" | "disabled" = "armed";
    if (pauseEvents.length > 0) {
      // Check if most recent pause is still active
      const latestPauseBlock = pauseEvents[pauseEvents.length - 1].blockNumber;
      if (currentBlock - latestPauseBlock < 100n) {
        circuitBreakerStatus = "triggered";
      }
    }

    return {
      protocol,
      network,
      tvlUsd: 0, // Would require external price feed / DeFi Llama API
      tvlDelta24h: 0,
      activeAlerts,
      recentAnomalies,
      circuitBreakerStatus,
      reportedAt: Date.now(),
    };
  } catch (error) {
    console.error("[ArbiGuard] Health check error:", error);
    return {
      protocol,
      network,
      tvlUsd: 0,
      tvlDelta24h: 0,
      activeAlerts: [],
      recentAnomalies: [],
      circuitBreakerStatus: "disabled",
      reportedAt: Date.now(),
    };
  }
}
