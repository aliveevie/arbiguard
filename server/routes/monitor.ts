import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { monitorPool, stopMonitoring } from "../../skill/index.js";

const router = Router();

const monitorSchema = z.object({
  poolAddress: z.string().startsWith("0x"),
  protocol: z.enum(["gmx_v2", "camelot", "aave_v3"]),
  network: z.enum(["arbitrum_one", "arbitrum_sepolia"]),
  callbackUrl: z.string().url().optional(),
  replayMode: z.boolean().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = monitorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const result = await monitorPool(parsed.data as Parameters<typeof monitorPool>[0]);
  res.json(result);
});

router.delete("/:sessionId", (req: Request<{ sessionId: string }>, res: Response) => {
  const stopped = stopMonitoring(req.params.sessionId);
  res.json({ stopped, sessionId: req.params.sessionId });
});

export default router;
