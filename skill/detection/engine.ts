import type {
  ThreatAssessmentResult,
  ThreatType,
  ThreatIndicator,
  IndicatorResult,
  Network,
} from "../types/index.js";
import { analyzeFlashLoan } from "./indicators/flashLoan.js";
import {
  analyzePriceDeviation,
  type PriceData,
} from "./indicators/priceDeviation.js";
import { analyzeSandwich, type SandwichData } from "./indicators/sandwich.js";
import {
  analyzeReentrancy,
  type TraceData,
} from "./indicators/reentrancy.js";
import {
  analyzeLiquidation,
  type LiquidationData,
} from "./indicators/liquidation.js";
import { getPublicClient } from "../contracts/client.js";
import {
  type Log,
  decodeEventLog,
  parseAbiItem,
  type TransactionReceipt,
} from "viem";

// ── Score Thresholds ───────────────────────────────────────────────────
const THRESHOLD_FLAG = 31;
const THRESHOLD_BLOCK = 61;

// ── Well-known Event Signatures ────────────────────────────────────────
const FLASH_LOAN_TOPICS = [
  "0x631042c832b07452973831137f2d73e395028b44b250dedc5abb0ee766e168ac", // FlashLoan(address,address,address,uint256,uint256,uint16)
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap(address,uint256,uint256,uint256,uint256,address)
];

const LIQUIDATION_TOPICS = [
  "0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286", // LiquidationCall
];

const ORACLE_UPDATE_TOPICS = [
  "0x0559884fd3a460db3073b7fc896cc77986f16e378210ded43186175bf646fc5f", // AnswerUpdated(int256,uint256,uint256)
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // PriceUpdate
];

function classifyThreat(indicators: IndicatorResult[]): ThreatType | null {
  const top = indicators.reduce((a, b) => (a.score > b.score ? a : b));
  if (top.score === 0) return null;

  const typeMap: Record<string, ThreatType> = {
    flash_loan_initiation: "flash_loan_abuse",
    price_deviation: "price_manipulation",
    sandwich_attack: "sandwich_attack",
    reentrancy: "reentrancy",
    liquidation_exploit: "liquidation_exploit",
  };

  return typeMap[top.type] || "unknown_anomaly";
}

function getRecommendation(score: number): "allow" | "flag" | "block" {
  if (score >= THRESHOLD_BLOCK) return "block";
  if (score >= THRESHOLD_FLAG) return "flag";
  return "allow";
}

// ── Main Scoring Function ──────────────────────────────────────────────
export interface TxAnalysisInput {
  traceCalldata: string[];
  traceDepths: number[];
  traceTargets: string[];
  priceData: PriceData;
  sandwichData: SandwichData;
  liquidationData: LiquidationData;
}

export function scoreThreat(input: TxAnalysisInput): {
  score: number;
  indicators: IndicatorResult[];
  threatType: ThreatType | null;
} {
  const indicators: IndicatorResult[] = [
    analyzeFlashLoan(input.traceCalldata, input.traceDepths),
    analyzePriceDeviation(input.priceData),
    analyzeSandwich(input.sandwichData),
    analyzeReentrancy({
      callDepths: input.traceDepths,
      callTargets: input.traceTargets,
    }),
    analyzeLiquidation(input.liquidationData),
  ];

  const score = indicators.reduce((sum, ind) => sum + ind.score, 0);
  const threatType = classifyThreat(indicators);

  return { score, indicators, threatType };
}

export function buildAssessmentResult(
  txHash: `0x${string}`,
  input: TxAnalysisInput
): ThreatAssessmentResult {
  const { score, indicators, threatType } = scoreThreat(input);

  const activeIndicators = indicators.filter((i) => i.score > 0);
  const confidence =
    activeIndicators.length > 0
      ? activeIndicators.reduce((sum, i) => sum + i.score / i.weight, 0) /
        activeIndicators.length
      : 0;

  return {
    txHash,
    threatScore: Math.min(100, score),
    threatType,
    confidence: Math.round(confidence * 100) / 100,
    indicators: indicators
      .filter((i) => i.score > 0)
      .map(
        (i): ThreatIndicator => ({
          type: i.type,
          severity: i.severity,
          description: i.description,
          onChainEvidence: i.onChainEvidence,
        })
      ),
    recommendation: getRecommendation(score),
    assessedAt: Date.now(),
  };
}

// ── Trace Parsing ──────────────────────────────────────────────────────
interface CallFrame {
  type: string;
  from: string;
  to: string;
  input: string;
  output?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  calls?: CallFrame[];
}

function flattenTrace(
  frame: CallFrame,
  depth = 0
): { calldata: string[]; depths: number[]; targets: string[] } {
  const calldata: string[] = [frame.input || "0x"];
  const depths: number[] = [depth];
  const targets: string[] = [frame.to || "0x0"];

  if (frame.calls) {
    for (const child of frame.calls) {
      const sub = flattenTrace(child, depth + 1);
      calldata.push(...sub.calldata);
      depths.push(...sub.depths);
      targets.push(...sub.targets);
    }
  }

  return { calldata, depths, targets };
}

// ── Event-Based Detection ──────────────────────────────────────────────
function detectFlashLoanFromLogs(logs: Log[]): boolean {
  for (const log of logs) {
    if (log.topics[0] && FLASH_LOAN_TOPICS.includes(log.topics[0])) {
      return true;
    }
  }
  return false;
}

function detectLiquidationFromLogs(logs: Log[]): {
  hasLiquidation: boolean;
  hasOracleUpdate: boolean;
} {
  let hasLiquidation = false;
  let hasOracleUpdate = false;

  for (const log of logs) {
    const topic = log.topics[0];
    if (topic && LIQUIDATION_TOPICS.includes(topic)) hasLiquidation = true;
    if (topic && ORACLE_UPDATE_TOPICS.includes(topic)) hasOracleUpdate = true;
  }

  return { hasLiquidation, hasOracleUpdate };
}

function analyzeValueTransfers(receipt: TransactionReceipt): {
  totalValueMoved: bigint;
  uniqueContracts: number;
} {
  const contracts = new Set<string>();
  let totalValueMoved = 0n;

  for (const log of receipt.logs) {
    contracts.add(log.address.toLowerCase());
    // ERC20 Transfer event topic
    if (
      log.topics[0] ===
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    ) {
      if (log.data && log.data !== "0x") {
        try {
          totalValueMoved += BigInt(log.data);
        } catch {
          // non-standard log data, skip
        }
      }
    }
  }

  return { totalValueMoved, uniqueContracts: contracts.size };
}

// ── Fetch On-Chain Data ────────────────────────────────────────────────
export async function fetchTxAnalysisInput(
  txHash: `0x${string}`,
  network: Network,
  poolAddress?: `0x${string}`
): Promise<TxAnalysisInput> {
  const client = getPublicClient(network);

  // Fetch tx data, receipt, and block in parallel
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getTransactionReceipt({ hash: txHash }),
  ]);

  const block = await client.getBlock({
    blockNumber: receipt.blockNumber,
    includeTransactions: true,
  });

  // ── Trace analysis ──────────────────────────────────────────────────
  // Try debug_traceTransaction for full call tree, fall back to log analysis
  let traceCalldata: string[] = [tx.input];
  let traceDepths: number[] = [0];
  let traceTargets: string[] = [tx.to || "0x0"];

  try {
    const trace = (await client.request({
      method: "debug_traceTransaction" as any,
      params: [txHash, { tracer: "callTracer" }] as any,
    })) as CallFrame;

    const flat = flattenTrace(trace);
    traceCalldata = flat.calldata;
    traceDepths = flat.depths;
    traceTargets = flat.targets;
  } catch {
    // debug_traceTransaction not available on this RPC
    // Fall back to log-based analysis — extract calldata patterns from logs
    for (const log of receipt.logs) {
      if (log.data && log.data.length > 10) {
        traceCalldata.push(log.data);
      }
      traceTargets.push(log.address);
      traceDepths.push(1);
    }

    // Check for flash loan signatures in the tx input itself
    const flashSelectors = [
      "0x5cffe9de",
      "0xab9c4b5d",
      "0xd9d98ce4",
      "0x490e6cbc", // Aave V3 flashLoan
    ];
    for (const sel of flashSelectors) {
      if (tx.input.toLowerCase().startsWith(sel)) {
        traceCalldata.unshift(tx.input);
        break;
      }
    }
  }

  // ── Event-based flash loan detection ────────────────────────────────
  const hasFlashLoanEvent = detectFlashLoanFromLogs(receipt.logs as Log[]);
  if (hasFlashLoanEvent) {
    // Inject flash loan selector into trace if not already present
    const hasFlashInTrace = traceCalldata.some((cd) =>
      ["0x5cffe9de", "0xab9c4b5d", "0xd9d98ce4", "0x490e6cbc"].some((s) =>
        cd.toLowerCase().startsWith(s)
      )
    );
    if (!hasFlashInTrace) {
      traceCalldata.unshift("0x5cffe9de");
      traceDepths.unshift(1);
      traceTargets.unshift("flash_loan_detected_from_events");
    }
  }

  // ── Value transfer analysis for price deviation ─────────────────────
  const { totalValueMoved, uniqueContracts } = analyzeValueTransfers(receipt);
  const gasUsedRatio = Number(receipt.gasUsed) / Number(block.gasLimit);

  // Estimate price impact from on-chain signals
  // High gas usage + many contracts + large value = likely price impact
  const estimatedDeviation =
    uniqueContracts > 5 && gasUsedRatio > 0.01
      ? 1.0 + uniqueContracts * 0.08
      : 1.0;

  const priceData: PriceData = {
    spotPrice: estimatedDeviation,
    twapPrice: 1.0,
    blockNumber: Number(receipt.blockNumber),
    windowBlocks: 30,
  };

  // ── Sandwich detection from block transactions ──────────────────────
  const blockTxs = (
    block.transactions as Array<{
      from: string;
      to: string | null;
      hash: string;
      transactionIndex: number;
      value: bigint;
      input: string;
    }>
  ).map((btx, idx) => ({
    from: btx.from,
    to: btx.to || "",
    index: btx.transactionIndex ?? idx,
    value: btx.value,
    input: btx.input,
  }));

  const sandwichData: SandwichData = {
    txIndex: tx.transactionIndex ?? 0,
    blockTxs,
    targetPool: poolAddress || tx.to || "0x0",
  };

  // ── Liquidation detection from events ───────────────────────────────
  const { hasLiquidation, hasOracleUpdate } = detectLiquidationFromLogs(
    receipt.logs as Log[]
  );

  const liquidationData: LiquidationData = {
    hasLiquidationEvent: hasLiquidation,
    hasOracleUpdateSameBlock: hasOracleUpdate,
    liquidationBlock: Number(receipt.blockNumber),
    oracleUpdateBlock: hasOracleUpdate ? Number(receipt.blockNumber) : 0,
    liquidationAmount: totalValueMoved,
  };

  return {
    traceCalldata,
    traceDepths,
    traceTargets,
    priceData,
    sandwichData,
    liquidationData,
  };
}
