import { describe, it, expect } from "vitest";
import { createPublicClient, http } from "viem";
import { arbitrumSepolia } from "viem/chains";

const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const CONTRACT = "0xE827C2eF74F67e21c637d3164b3af3bC394cA52F" as const;
const OWNER = "0x6563F945530132a0BacBFD772b79f127ef3Af339" as const;
const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const AGENT_ID = 156n;

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(RPC_URL),
});

const circuitBreakerAbi = [
  {
    inputs: [{ name: "pool", type: "address" }],
    name: "getPoolConfig",
    outputs: [
      { name: "active", type: "bool" },
      { name: "paused", type: "bool" },
      { name: "maxVolumePerBlock", type: "uint256" },
      { name: "cooldownBlocks", type: "uint256" },
      { name: "lastTriggerBlock", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "COORDINATOR",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "pool", type: "address" }],
    name: "isPoolPaused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "guardians",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getThreatHistoryLength",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const registryAbi = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

describe("Live Contract Integration Tests (Arbitrum Sepolia)", () => {
  it("contract exists and has code", async () => {
    const code = await client.getCode({ address: CONTRACT });
    expect(code).toBeDefined();
    expect(code!.length).toBeGreaterThan(2);
  });

  it("owner is the deployer", async () => {
    const owner = await client.readContract({
      address: CONTRACT,
      abi: circuitBreakerAbi,
      functionName: "owner",
    });
    expect(owner.toLowerCase()).toBe(OWNER.toLowerCase());
  });

  it("VRF coordinator is set correctly", async () => {
    const coordinator = await client.readContract({
      address: CONTRACT,
      abi: circuitBreakerAbi,
      functionName: "COORDINATOR",
    });
    expect(coordinator.toLowerCase()).toBe(
      "0x5CE8D5A2BC84beb22a398CCA51996F7930313D61".toLowerCase()
    );
  });

  it("owner is a guardian", async () => {
    const isGuardian = await client.readContract({
      address: CONTRACT,
      abi: circuitBreakerAbi,
      functionName: "guardians",
      args: [OWNER],
    });
    expect(isGuardian).toBe(true);
  });

  it("pool 0xdead is registered with correct config", async () => {
    const config = await client.readContract({
      address: CONTRACT,
      abi: circuitBreakerAbi,
      functionName: "getPoolConfig",
      args: ["0x000000000000000000000000000000000000dEaD"],
    });
    expect(config[0]).toBe(true); // active
    expect(config[2]).toBe(1000000000000000000000n); // maxVolumePerBlock
    expect(config[3]).toBe(5n); // cooldownBlocks
  });

  it("threat history has entries", async () => {
    const length = await client.readContract({
      address: CONTRACT,
      abi: circuitBreakerAbi,
      functionName: "getThreatHistoryLength",
    });
    expect(length).toBeGreaterThan(0n);
  });

  it("agent is registered on identity registry", async () => {
    const owner = await client.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "ownerOf",
      args: [AGENT_ID],
    });
    expect(owner.toLowerCase()).toBe(OWNER.toLowerCase());
  });
});
