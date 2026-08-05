import { z } from "zod";

// Cash App's real rules are close to this; we validate loosely here since
// Cash App's own payment page is the final source of truth — this just
// keeps obviously-malformed input out of a link we build and send via SMS.
export const cashtagSchema = z.object({
  cashtag: z
    .string()
    .trim()
    .transform((v) => v.replace(/^\$/, ""))
    .pipe(
      z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]{0,19}$/, "Enter a valid $cashtag (letters, numbers, underscores)."),
    ),
});

export type CashtagInput = z.input<typeof cashtagSchema>;
