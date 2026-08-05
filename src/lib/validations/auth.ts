import { z } from "zod";
import { normalizePhone } from "@/lib/utils/phone";

export const phoneRequestSchema = z.object({
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

export const otpVerifySchema = z.object({
  phone: z.string().min(7),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type PhoneRequestInput = z.input<typeof phoneRequestSchema>;
export type OtpVerifyInput = z.input<typeof otpVerifySchema>;
