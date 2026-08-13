import { z } from "zod";
import { normalizePhone } from "@/lib/utils/phone";
import { CUSTOM_ACTION_TITLE_MAX_LENGTH } from "@/lib/constants";

/**
 * Draft a Sports Action from a selected provider event + team pick. The
 * stake is optional and, per product policy, purely informational — never
 * validated as a payment amount because ACTION never touches money.
 * `selectionKey` is the chosen team's abbreviation — there's no market
 * concept anymore, see README ("Sports Action simplification").
 */
export const createActionSchema = z.object({
  eventId: z.string().min(1),
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

/**
 * A Custom Action's stake is equal-per-participant and, unlike sports
 * Actions, mandatory (there's no "no stake" version of a winner-take-all
 * pot). Phone numbers are validated separately in the mutation, matching
 * how the single opponent phone on a sports Action is handled inline
 * rather than through this schema.
 */
export const createCustomActionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Add a title.")
    .max(CUSTOM_ACTION_TITLE_MAX_LENGTH, "Keep the title a bit shorter."),
  stakeAmount: z.coerce.number().positive("Enter a stake amount.").max(1_000_000),
});

export type CreateActionInput = z.input<typeof createActionSchema>;
export type InviteInput = z.input<typeof inviteSchema>;
export type CreateCustomActionInput = z.input<typeof createCustomActionSchema>;
