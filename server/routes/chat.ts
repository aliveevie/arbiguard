import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { handleAgentMessage } from "../agent.js";

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Message is required (1-2000 chars)" });
    return;
  }

  try {
    const result = await handleAgentMessage(parsed.data.message);
    res.json({
      agent: "ArbiGuard",
      agentId: 156,
      ...result,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    res.status(500).json({
      agent: "ArbiGuard",
      response: `Something went wrong: ${error.message}`,
      action: "error",
      timestamp: Date.now(),
    });
  }
});

export default router;
