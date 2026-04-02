import { getAbiItem, encodeFunctionData } from "viem";
import {
  getPublicClient,
  getWalletClient,
  CIRCUIT_BREAKER_ADDRESS,
} from "../contracts/client.js";
import type {
  CircuitBreakerParams,
  CircuitBreakerResult,
} from "../types/index.js";
import circuitBreakerAbi from "../contracts/abi/ArbiGuardCircuitBreaker.json" with { type: "json" };

export async function triggerCircuitBreaker(
  params: CircuitBreakerParams
): Promise<CircuitBreakerResult> {
  const { poolAddress, network, action, signerPrivateKey, rateLimitConfig } =
    params;

  const contractAddress = CIRCUIT_BREAKER_ADDRESS[network];
  const publicClient = getPublicClient(network);
  const walletClient = getWalletClient(
    network,
    signerPrivateKey as `0x${string}`
  );

  try {
    let txHash: `0x${string}`;

    if (action === "pause") {
      txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: circuitBreakerAbi,
        functionName: "pausePool",
        args: [poolAddress],
      });
    } else {
      // rate_limit
      if (!rateLimitConfig) {
        throw new Error(
          "rateLimitConfig is required for rate_limit action"
        );
      }
      txHash = await walletClient.writeContract({
        address: contractAddress,
        abi: circuitBreakerAbi,
        functionName: "setRateLimit",
        args: [
          poolAddress,
          rateLimitConfig.maxVolumePerBlock,
          BigInt(rateLimitConfig.cooldownBlocks),
        ],
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    return {
      success: receipt.status === "success",
      txHash,
      action,
      poolAddress,
      blockNumber: Number(receipt.blockNumber),
    };
  } catch (error) {
    console.error("[ArbiGuard] Circuit breaker error:", error);
    return {
      success: false,
      txHash: null,
      action,
      poolAddress,
      blockNumber: 0,
    };
  }
}
