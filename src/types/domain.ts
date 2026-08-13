/**
 * Hand-maintained domain type aliases and generic table/function helpers,
 * kept deliberately separate from `database.types.ts`.
 *
 * `database.types.ts` is treated as GENERATED CODE ONLY — running
 *
 *   npx supabase gen types typescript --linked > src/types/database.types.ts
 *
 * should be safe to do at any time without breaking a single import
 * elsewhere in the app. That's only true if nothing hand-written lives in
 * that file. Every convenience alias below is derived from `Database` via
 * indexed access (`Database["public"]["Enums"][...]`) rather than declared
 * independently, so it automatically tracks whatever the generator produces
 * — if a migration adds a new enum value, nothing here needs to change.
 *
 * Application code should import domain aliases from this file, never from
 * `database.types.ts` directly (aside from `Database`/`Json` themselves,
 * which genuinely are generated output).
 */

import type { Database } from "./database.types";

// -----------------------------------------------------------------------------
// Generic table/function helpers. Supabase's own CLI sometimes includes
// helpers like these directly in generated output and sometimes doesn't,
// depending on version — declaring our own copies here (rather than
// re-exporting whatever database.types.ts happens to include) means these
// keep working regardless of what a future `gen types` run does or doesn't
// add.
// -----------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type FunctionArgs<T extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][T]["Args"];
export type FunctionReturns<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Returns"];

// -----------------------------------------------------------------------------
// Domain aliases — one per Postgres enum in the schema.
// -----------------------------------------------------------------------------

export type League = Database["public"]["Enums"]["league"];
export type GameStatus = Database["public"]["Enums"]["game_status"];
export type MarketType = Database["public"]["Enums"]["market_type"];
export type ActionStatus = Database["public"]["Enums"]["action_status"];
export type ActionType = Database["public"]["Enums"]["action_type"];
export type ParticipantRole = Database["public"]["Enums"]["participant_role"];
export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];
export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type ChangedByActor = Database["public"]["Enums"]["changed_by_actor"];
export type PaymentSettlementStatus = Database["public"]["Enums"]["payment_settlement_status"];
export type PaymentSettlementEventType = Database["public"]["Enums"]["payment_settlement_event_type"];
export type CreditTransactionType = Database["public"]["Enums"]["credit_transaction_type"];
export type PurchaseKind = Database["public"]["Enums"]["purchase_kind"];
export type PurchaseStatus = Database["public"]["Enums"]["purchase_status"];
export type EntitlementType = Database["public"]["Enums"]["entitlement_type"];
