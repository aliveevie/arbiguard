import OpenAI from "openai";
import { z } from "zod";
import type { Intent } from "./agent.js";

function getOpenAIModel(): string {
  return (process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
}

function getOpenAIKey(): string | undefined {
  const raw = process.env.OPENAI_API_KEY?.trim();
  if (raw) return raw;
  return undefined;
}

const networkEnum = z.enum(["arbitrum_one", "arbitrum_sepolia"]);
const protocolEnum = z.enum(["gmx_v2", "camelot", "aave_v3"]);

const toolIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assess_threat"),
    txHash: z.string(),
    network: networkEnum,
    poolAddress: z.string().optional(),
  }),
  z.object({
    type: z.literal("replay_exploit"),
    replayId: z.string(),
  }),
  z.object({ type: z.literal("list_replays") }),
  z.object({
    type: z.literal("protocol_health"),
    protocol: protocolEnum,
    network: networkEnum,
  }),
  z.object({
    type: z.literal("monitor_pool"),
    poolAddress: z.string(),
    protocol: protocolEnum,
    network: networkEnum,
  }),
  z.object({
    type: z.literal("stop_monitor"),
    sessionId: z.string().optional(),
  }),
  z.object({ type: z.literal("contract_status") }),
  z.object({ type: z.literal("agent_info") }),
  z.object({ type: z.literal("help") }),
  z.object({
    type: z.literal("pool_status"),
    poolAddress: z.string(),
  }),
  z.object({ type: z.literal("threat_history") }),
]);

const llmEnvelopeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tool"),
    tool: toolIntentSchema,
  }),
  z.object({
    action: z.literal("reply"),
    reply: z.string().min(1),
  }),
]);

function toIntent(tool: z.infer<typeof toolIntentSchema>): Intent {
  switch (tool.type) {
    case "stop_monitor":
      return { type: "stop_monitor", sessionId: tool.sessionId ?? "" };
    default:
      return tool as Intent;
  }
}

const SYSTEM_PROMPT = `You are the routing brain for ArbiGuard, a DeFi threat-detection agent on Arbitrum.

Decide whether the user wants to invoke a specific on-chain / demo tool, or they are asking a general question that should get a conversational answer.

Respond with JSON only (no markdown fences), matching exactly one of:
1) {"action":"tool","tool":{...}}
2) {"action":"reply","reply":"..."}

When action is "reply", write concise, helpful markdown (use **bold**, lists, short paragraphs). Focus on Arbitrum DeFi security, threat detection, and how ArbiGuard helps. If the user is vague, suggest concrete commands.

Tool object "tool" must use one of these shapes (type discriminant):
- assess_threat: { "type":"assess_threat", "txHash":"0x...", "network":"arbitrum_one"|"arbitrum_sepolia", "poolAddress"?: "0x..." }
- replay_exploit: { "type":"replay_exploit", "replayId": "gmx_oracle_manipulation_2022" | "camelot_flash_drain_2023" | "radiant_flashloan_2024" }
- list_replays: { "type":"list_replays" }
- protocol_health: { "type":"protocol_health", "protocol":"gmx_v2"|"camelot"|"aave_v3", "network": "arbitrum_one"|"arbitrum_sepolia" }
- monitor_pool: { "type":"monitor_pool", "poolAddress":"0x...", "protocol":"gmx_v2"|"camelot"|"aave_v3", "network": "arbitrum_one"|"arbitrum_sepolia" }
- stop_monitor: { "type":"stop_monitor", "sessionId"?: "" } (omit sessionId or use empty string to stop all sessions)
- contract_status: { "type":"contract_status" }
- agent_info: { "type":"agent_info" }
- help: { "type":"help" }
- pool_status: { "type":"pool_status", "poolAddress":"0x..." }
- threat_history: { "type":"threat_history" }

Prefer "tool" when the user clearly wants data/actions (tx assessment, replay, health, monitoring, contract/pool queries). Use "reply" for pure Q&A, greetings without a clear tool, or when required parameters (e.g. a tx hash) are missing — explain what you need in the reply.

Normalize addresses/hashes to lowercase 0x-prefixed hex when present.`;

export async function resolveWithOpenAI(
  message: string
): Promise<{ intent: Intent } | { markdown: string } | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const openai = new OpenAI({ apiKey: key });

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const json = JSON.parse(raw) as unknown;
    const parsed = llmEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[ArbiGuard] LLM JSON parse failed:", parsed.error.flatten());
      return null;
    }

    if (parsed.data.action === "reply") {
      return { markdown: parsed.data.reply };
    }

    return { intent: toIntent(parsed.data.tool) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ArbiGuard] OpenAI error:", msg);
    return null;
  }
}
