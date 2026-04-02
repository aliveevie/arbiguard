import { config } from "dotenv";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let didRun = false;

/**
 * Resolve repo root: server/ when running tsx, dist/server/ when running compiled.
 */
function projectRoot(): string {
  const oneUp = join(__dirname, "..");
  const twoUp = join(__dirname, "..", "..");
  if (existsSync(join(oneUp, "package.json"))) return oneUp;
  if (existsSync(join(twoUp, "package.json"))) return twoUp;
  return oneUp;
}

/** Load `.env` / `.env.local` from project root (not cwd). Safe to import more than once. */
export function loadEnvFromProjectRoot(): void {
  if (didRun) return;
  didRun = true;

  const root = projectRoot();

  for (const entry of [
    { file: ".env", override: false },
    { file: ".env.local", override: true },
  ] as const) {
    const path = join(root, entry.file);
    if (existsSync(path)) {
      const r = config({ path, override: entry.override });
      if (r.error) {
        console.warn(`[ArbiGuard] Could not load ${path}:`, r.error.message);
      } else {
        console.log(`[ArbiGuard] Loaded env from ${path}`);
      }
    }
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.warn(
      "[ArbiGuard] OPENAI_API_KEY is not set — LLM routing/replies disabled. Add it to .env in the project root (or set the variable in your host / Docker / Render)."
    );
  } else {
    console.log(
      `[ArbiGuard] OpenAI enabled (model: ${(process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim()})`
    );
  }
}

loadEnvFromProjectRoot();

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIModelName(): string {
  return (process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
}
