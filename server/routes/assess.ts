import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { assessThreat } from "../../skill/index.js";

const router = Router();

const assessSchema = z.object({
  txHash: z.string().startsWith("0x"),
  network: z.enum(["arbitrum_one", "arbitrum_sepolia"]),
  poolAddress: z.string().startsWith("0x").optional(),
  replayMode: z.boolean().optional(),
  replayId: z.string().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = assessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const result = await assessThreat(parsed.data as Parameters<typeof assessThreat>[0]);
  res.json(result);
});

export default router;
