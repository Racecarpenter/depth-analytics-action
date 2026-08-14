import { z } from "zod";
import { DISPLAY_NAME_MAX_LENGTH, RESERVED_USERNAMES, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "@/lib/constants";

/**
 * V1 profile is deliberately just two fields — see README ("User profiles").
 * Username is normalized to lowercase here so the app never sends a
 * mixed-case value to the DB; the DB's case-insensitive unique index
 * (users_username_lower_idx) is the actual source of truth for uniqueness,
 * this is just the friendly client/server-side shape + format check.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Add a display name.")
  .max(DISPLAY_NAME_MAX_LENGTH, "Keep it a bit shorter.");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, `Usernames are at least ${USERNAME_MIN_LENGTH} characters.`)
      .max(USERNAME_MAX_LENGTH, `Usernames are at most ${USERNAME_MAX_LENGTH} characters.`)
      .regex(/^[a-z][a-z0-9_]*$/, "Letters, numbers, and underscores only — must start with a letter.")
      .refine((v) => !RESERVED_USERNAMES.includes(v), "That username isn't available."),
  );

export const profileSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
});

export type ProfileInput = z.input<typeof profileSchema>;
