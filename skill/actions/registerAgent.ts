import {
  getPublicClient,
  getWalletClient,
  AGENT_REGISTRY_ADDRESS,
} from "../contracts/client.js";
import type {
  RegisterAgentParams,
  RegistrationResult,
} from "../types/index.js";

// Minimal ABI for the Arbitrum Agent Identity Registry
const REGISTRY_ABI = [
  {
    inputs: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "metadataUri", type: "string" },
    ],
    name: "registerAgent",
    outputs: [{ name: "agentId", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function registerAgent(
  params: RegisterAgentParams
): Promise<RegistrationResult> {
  const { agentName, agentVersion, metadataUri, signerPrivateKey, network } =
    params;

  const registryAddress = AGENT_REGISTRY_ADDRESS[network];
  const publicClient = getPublicClient(network);
  const walletClient = getWalletClient(
    network,
    signerPrivateKey as `0x${string}`
  );

  try {
    const txHash = await walletClient.writeContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "registerAgent",
      args: [agentName, agentVersion, metadataUri],
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Extract agentId from logs (first topic of first log)
    const agentId =
      receipt.logs.length > 0
        ? (receipt.logs[0].topics[1] as `0x${string}`)
        : null;

    return {
      success: receipt.status === "success",
      agentId,
      txHash,
      registryAddress,
      network,
    };
  } catch (error) {
    console.error("[ArbiGuard] Registration error:", error);
    return {
      success: false,
      agentId: null,
      txHash: null,
      registryAddress,
      network,
    };
  }
}
