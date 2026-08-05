import { z } from "zod";
import { normalizePhone } from "@/lib/utils/phone";

export const marketTypeSchema = z.enum(["moneyline", "spread", "total"]);

/**
 * Draft an Action from a selected provider event + market + side. The stake
 * is optional and, per product policy, purely informational — never
 * validated as a payment amount because ACTION never touches money.
 */
export const createActionSchema = z.object({
  eventId: z.string().min(1),
  market: marketTypeSchema,
  selectionKey: z.string().min(1),
  stakeAmount: z
    .union([z.coerce.number().positive().max(1_000_000), z.literal("").transform(() => undefined)])
    .optional(),
});

export const inviteSchema = z.object({
  actionId: z.string().uuid(),
  phone: z
    .string()
    .min(7, "Enter a valid phone number.")
    .transform((val, ctx) => {
      const normalized = normalizePhone(val);
      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number." });
        return z.NEVER;
      }
      return normalized;
    }),
});

export type CreateActionInput = z.input<typeof createActionSchema>;
export type InviteInput = z.input<typeof inviteSchema>;
