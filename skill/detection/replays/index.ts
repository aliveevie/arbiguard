import type { TxAnalysisInput } from "../engine.js";
import type { PriceData } from "../indicators/priceDeviation.js";
import type { SandwichData } from "../indicators/sandwich.js";
import type { LiquidationData } from "../indicators/liquidation.js";

import gmxReplay from "./gmx_oracle_manipulation_2022.json" with { type: "json" };
import camelotReplay from "./camelot_flash_drain_2023.json" with { type: "json" };
import radiantReplay from "./radiant_flashloan_2024.json" with { type: "json" };

interface RawReplayData {
  id: string;
  name: string;
  txHash: string;
  date: string;
  chain: string;
  expectedThreatType: string;
  expectedScore: number;
  mockTrace: {
    traceCalldata: string[];
    traceDepths: number[];
    traceTargets: string[];
  };
  mockPriceData: {
    spotPrice: number;
    twapPrice: number;
    blockNumber: number;
    windowBlocks: number;
  };
  mockSandwichData: {
    txIndex: number;
    blockTxs: Array<{
      from: string;
      to: string;
      index: number;
      value: string;
      input: string;
    }>;
    targetPool: string;
  };
  mockLiquidationData: {
    hasLiquidationEvent: boolean;
    hasOracleUpdateSameBlock: boolean;
    liquidationBlock: number;
    oracleUpdateBlock: number;
    liquidationAmount: string;
  };
}

const REPLAYS: Record<string, RawReplayData> = {
  gmx_oracle_manipulation_2022: gmxReplay as unknown as RawReplayData,
  camelot_flash_drain_2023: camelotReplay as unknown as RawReplayData,
  radiant_flashloan_2024: radiantReplay as unknown as RawReplayData,
};

export function getReplayIds(): string[] {
  return Object.keys(REPLAYS);
}

export function getReplayInput(replayId: string): TxAnalysisInput | null {
  const replay = REPLAYS[replayId];
  if (!replay) return null;

  const priceData: PriceData = replay.mockPriceData;

  const sandwichData: SandwichData = {
    txIndex: replay.mockSandwichData.txIndex,
    blockTxs: replay.mockSandwichData.blockTxs.map((tx) => ({
      ...tx,
      value: BigInt(tx.value || "0"),
    })),
    targetPool: replay.mockSandwichData.targetPool,
  };

  const liquidationData: LiquidationData = {
    hasLiquidationEvent: replay.mockLiquidationData.hasLiquidationEvent,
    hasOracleUpdateSameBlock:
      replay.mockLiquidationData.hasOracleUpdateSameBlock,
    liquidationBlock: replay.mockLiquidationData.liquidationBlock,
    oracleUpdateBlock: replay.mockLiquidationData.oracleUpdateBlock,
    liquidationAmount: BigInt(
      replay.mockLiquidationData.liquidationAmount || "0"
    ),
  };

  return {
    traceCalldata: replay.mockTrace.traceCalldata,
    traceDepths: replay.mockTrace.traceDepths,
    traceTargets: replay.mockTrace.traceTargets,
    priceData,
    sandwichData,
    liquidationData,
  };
}

export function getReplayMetadata(
  replayId: string
): { name: string; date: string; chain: string; expectedScore: number } | null {
  const replay = REPLAYS[replayId];
  if (!replay) return null;
  return {
    name: replay.name,
    date: replay.date,
    chain: replay.chain,
    expectedScore: replay.expectedScore,
  };
}
