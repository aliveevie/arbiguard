import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { triggerCircuitBreaker } from "../../skill/index.js";

const router = Router();

const breakerSchema = z.object({
  poolAddress: z.string().startsWith("0x"),
  network: z.enum(["arbitrum_one", "arbitrum_sepolia"]),
  action: z.enum(["pause", "rate_limit"]),
  signerPrivateKey: z.string().startsWith("0x"),
  rateLimitConfig: z
    .object({
      maxVolumePerBlock: z.string().transform((v) => BigInt(v)),
      cooldownBlocks: z.number(),
    })
    .optional(),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = breakerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const result = await triggerCircuitBreaker(parsed.data as Parameters<typeof triggerCircuitBreaker>[0]);
  res.json(result);
});

export default router;
