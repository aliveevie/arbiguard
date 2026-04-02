import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getProtocolHealth } from "../../skill/index.js";

const router = Router();

const protocolEnum = z.enum(["gmx_v2", "camelot", "aave_v3"]);
const networkEnum = z.enum(["arbitrum_one", "arbitrum_sepolia"]);

router.get("/:protocol", async (req: Request, res: Response) => {
  const protocol = protocolEnum.safeParse(req.params.protocol);
  if (!protocol.success) {
    res.status(400).json({ error: "Invalid protocol. Use: gmx_v2, camelot, aave_v3" });
    return;
  }

  const network = networkEnum.safeParse(req.query.network || "arbitrum_one");
  if (!network.success) {
    res.status(400).json({ error: "Invalid network" });
    return;
  }

  const lookbackBlocks = req.query.lookbackBlocks
    ? Number(req.query.lookbackBlocks)
    : undefined;

  const result = await getProtocolHealth({
    protocol: protocol.data,
    network: network.data,
    lookbackBlocks,
  });
  res.json(result);
});

export default router;
