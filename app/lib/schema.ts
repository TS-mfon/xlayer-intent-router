import { z } from "zod";

export const intentSchema = z.object({
  action: z.literal("swap"),
  tokenIn: z.string().min(1),
  tokenOut: z.string().min(1),
  amountIn: z.string().min(1),
  maxSlippageBps: z.number().int().min(1).max(5000),
  deadlineMinutes: z.number().int().min(1).max(1440)
});

export const quoteSchema = z.object({
  status: z.enum(["quoted", "mock"]),
  route: z.string(),
  expectedAmountOut: z.string(),
  minAmountOut: z.string(),
  quoteHash: z.string(),
  router: z.string(),
  calldata: z.string(),
  warnings: z.array(z.string()),
  amountInRaw: z.string().optional(),
  minAmountOutRaw: z.string().optional(),
  tokenInAddress: z.string().optional(),
  tokenOutAddress: z.string().optional()
});

export type IntentDraft = z.infer<typeof intentSchema>;
export type QuoteResult = z.infer<typeof quoteSchema>;
