import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import type { Network } from "../types/index.js";

// ── Contract Addresses ─────────────────────────────────────────────────
export const CIRCUIT_BREAKER_ADDRESS: Record<Network, `0x${string}`> = {
  arbitrum_one: "0x0000000000000000000000000000000000000000", // deploy and populate
  arbitrum_sepolia: "0xE827C2eF74F67e21c637d3164b3af3bC394cA52F",
};

export const AGENT_REGISTRY_ADDRESS: Record<Network, `0x${string}`> = {
  arbitrum_one: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  arbitrum_sepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

// ── Chain Config ───────────────────────────────────────────────────────
const CHAINS: Record<Network, Chain> = {
  arbitrum_one: arbitrum,
  arbitrum_sepolia: arbitrumSepolia,
};

function getRpcUrl(network: Network): string {
  if (network === "arbitrum_one") {
    return process.env.ARBITRUM_ONE_RPC_URL || "https://arb1.arbitrum.io/rpc";
  }
  return (
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
    "https://sepolia-rollup.arbitrum.io/rpc"
  );
}

// ── Client Factories ───────────────────────────────────────────────────
export function getPublicClient(
  network: Network
): PublicClient<Transport, Chain> {
  return createPublicClient({
    chain: CHAINS[network],
    transport: http(getRpcUrl(network)),
  }) as PublicClient<Transport, Chain>;
}

export function getWalletClient(
  network: Network,
  privateKey: `0x${string}`
): WalletClient<Transport, Chain, Account> {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: CHAINS[network],
    transport: http(getRpcUrl(network)),
  }) as WalletClient<Transport, Chain, Account>;
}
