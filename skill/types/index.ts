// ── Network & Protocol Types ───────────────────────────────────────────
export type Network = "arbitrum_one" | "arbitrum_sepolia";
export type Protocol = "gmx_v2" | "camelot" | "aave_v3";

// ── monitorPool ────────────────────────────────────────────────────────
export interface MonitorPoolParams {
  poolAddress: `0x${string}`;
  protocol: Protocol;
  network: Network;
  callbackUrl?: string;
  replayMode?: boolean;
}

export interface MonitorPoolResult {
  sessionId: string;
  status: "active" | "error";
  poolAddress: `0x${string}`;
  protocol: string;
  subscribedEvents: string[];
  startedAt: number;
}

// ── assessThreat ───────────────────────────────────────────────────────
export interface AssessThreatParams {
  txHash: `0x${string}`;
  network: Network;
  poolAddress?: `0x${string}`;
  replayMode?: boolean;
  replayId?: string;
}

export type ThreatType =
  | "flash_loan_abuse"
  | "sandwich_attack"
  | "price_manipulation"
  | "reentrancy"
  | "liquidation_exploit"
  | "unknown_anomaly";

export interface ThreatIndicator {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  onChainEvidence: string;
}

export interface ThreatAssessmentResult {
  txHash: `0x${string}`;
  threatScore: number;
  threatType: ThreatType | null;
  confidence: number;
  indicators: ThreatIndicator[];
  recommendation: "allow" | "flag" | "block";
  assessedAt: number;
}

// ── triggerCircuitBreaker ──────────────────────────────────────────────
export interface CircuitBreakerParams {
  poolAddress: `0x${string}`;
  network: Network;
  action: "pause" | "rate_limit";
  signerPrivateKey: string;
  rateLimitConfig?: {
    maxVolumePerBlock: bigint;
    cooldownBlocks: number;
  };
}

export interface CircuitBreakerResult {
  success: boolean;
  txHash: `0x${string}` | null;
  action: string;
  poolAddress: `0x${string}`;
  blockNumber: number;
}

// ── getProtocolHealth ──────────────────────────────────────────────────
export interface ProtocolHealthParams {
  protocol: Protocol;
  network: Network;
  lookbackBlocks?: number;
}

export interface Alert {
  severity: "info" | "warning" | "critical";
  message: string;
  poolAddress?: `0x${string}`;
  detectedAt: number;
}

export interface Anomaly {
  type: string;
  txHash: `0x${string}`;
  description: string;
  blockNumber: number;
}

export interface ProtocolHealthReport {
  protocol: string;
  network: string;
  tvlUsd: number;
  tvlDelta24h: number;
  activeAlerts: Alert[];
  recentAnomalies: Anomaly[];
  circuitBreakerStatus: "armed" | "triggered" | "disabled";
  reportedAt: number;
}

// ── registerAgent ──────────────────────────────────────────────────────
export interface RegisterAgentParams {
  agentName: string;
  agentVersion: string;
  metadataUri: string;
  signerPrivateKey: string;
  network: Network;
}

export interface RegistrationResult {
  success: boolean;
  agentId: `0x${string}` | null;
  txHash: `0x${string}` | null;
  registryAddress: `0x${string}`;
  network: string;
}

// ── Detection Engine Internal ──────────────────────────────────────────
export interface IndicatorResult {
  type: string;
  score: number;
  weight: number;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  onChainEvidence: string;
}

export interface ReplayData {
  id: string;
  name: string;
  txHash: `0x${string}`;
  date: string;
  chain: string;
  expectedThreatType: ThreatType;
  expectedScore: number;
  mockTrace: Record<string, unknown>;
  mockEvents: Record<string, unknown>[];
}
