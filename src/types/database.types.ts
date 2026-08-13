/**
 * Hand-authored types mirroring `supabase/migrations/0001_init.sql` and
 * `0002_auth_otp.sql`. If you have the Supabase CLI linked to a project you
 * can regenerate this file with:
 *
 *   supabase gen types typescript --linked > src/types/database.types.ts
 *
 * Keeping it hand-authored for the MVP keeps the schema and types co-located
 * and reviewable in one pass. The shape below (Row/Insert/Update/Relationships
 * per table, plus Views/Functions/Enums/CompositeTypes at the schema level)
 * intentionally matches what `supabase gen types` produces — @supabase/supabase-js
 * v2's typed client relies on that exact shape.
 *
 * Two things matter here that are easy to get wrong by hand: every table
 * needs a `Relationships` array (even if empty), and every `Update` type
 * must be written out as its own plain object rather than derived as
 * `Partial<Database[...]["Insert"]>` — that self-reference back into the
 * interface being defined is exactly what `supabase gen types` avoids, and
 * skipping either one causes `.insert()`/`.update()` argument types to
 * silently collapse to `never` at call sites.
 */

export type League = "NFL" | "NBA" | "MLB" | "NHL";

export type GameStatus = "scheduled" | "live" | "final" | "postponed" | "cancelled";

export type MarketType = "moneyline" | "spread" | "total";

export type ActionStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "live"
  | "won"
  | "lost"
  | "push"
  | "cancelled"
  | "expired"
  | "resolved";

export type ActionType = "sports" | "custom";

export type ParticipantRole = "creator" | "opponent";

export type ParticipantStatus = "invited" | "accepted" | "declined";

export type NotificationType =
  | "invite_received"
  | "action_accepted"
  | "action_declined"
  | "action_live"
  | "action_settled"
  | "action_cancelled"
  | "referral_reward_earned"
  | "payment_owed"
  | "payment_reminder"
  | "payment_marked_paid"
  | "payment_confirmed"
  | "payment_disputed";

export type ChangedByActor = "system" | "creator" | "opponent";

export type PaymentSettlementStatus = "not_applicable" | "owed" | "marked_paid" | "settled" | "disputed";

export type PaymentSettlementEventType =
  | "owed"
  | "reminder_6h"
  | "reminder_24h"
  | "reminder_48h"
  | "manual_nudge"
  | "marked_paid"
  | "confirmed_received"
  | "disputed"
  | "not_applicable";

export type CreditTransactionType =
  | "starter_grant"
  | "referral_reward"
  | "action_pack_purchase"
  | "action_created"
  | "admin_adjustment";

export type PurchaseKind = "action_pack" | "action_pass";

export type PurchaseStatus = "completed" | "refunded";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone: string;
          display_name: string | null;
          cashtag: string | null;
          phone_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone: string;
          display_name?: string | null;
          cashtag?: string | null;
          phone_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phone?: string;
          display_name?: string | null;
          cashtag?: string | null;
          phone_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          league: League;
          city: string;
          name: string;
          abbreviation: string;
          primary_color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          league: League;
          city: string;
          name: string;
          abbreviation: string;
          primary_color?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          league?: League;
          city?: string;
          name?: string;
          abbreviation?: string;
          primary_color?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          league: League;
          provider: string;
          external_id: string;
          home_team_id: string;
          away_team_id: string;
          start_time: string;
          status: GameStatus;
          home_score: number | null;
          away_score: number | null;
          period: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league: League;
          provider?: string;
          external_id: string;
          home_team_id: string;
          away_team_id: string;
          start_time: string;
          status?: GameStatus;
          home_score?: number | null;
          away_score?: number | null;
          period?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          league?: League;
          provider?: string;
          external_id?: string;
          home_team_id?: string;
          away_team_id?: string;
          start_time?: string;
          status?: GameStatus;
          home_score?: number | null;
          away_score?: number | null;
          period?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "games_home_team_id_fkey";
            columns: ["home_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "games_away_team_id_fkey";
            columns: ["away_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      actions: {
        Row: {
          id: string;
          creator_id: string;
          action_type: ActionType;
          game_id: string | null;
          market: MarketType | null;
          title: string | null;
          line: number | null;
          status: ActionStatus;
          stake_amount: number | null;
          stake_currency: string;
          stake_note: string;
          winner_participant_id: string | null;
          voting_round: number;
          locked_at: string | null;
          resolved_at: string | null;
          cancelled_reason: string | null;
          payment_status: PaymentSettlementStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          action_type?: ActionType;
          game_id?: string | null;
          market?: MarketType | null;
          title?: string | null;
          line?: number | null;
          status?: ActionStatus;
          stake_amount?: number | null;
          stake_currency?: string;
          stake_note?: string;
          winner_participant_id?: string | null;
          voting_round?: number;
          locked_at?: string | null;
          resolved_at?: string | null;
          cancelled_reason?: string | null;
          payment_status?: PaymentSettlementStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          action_type?: ActionType;
          game_id?: string | null;
          market?: MarketType | null;
          title?: string | null;
          line?: number | null;
          status?: ActionStatus;
          stake_amount?: number | null;
          stake_currency?: string;
          stake_note?: string;
          winner_participant_id?: string | null;
          voting_round?: number;
          locked_at?: string | null;
          resolved_at?: string | null;
          cancelled_reason?: string | null;
          payment_status?: PaymentSettlementStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "actions_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_winner_participant_id_fkey";
            columns: ["winner_participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      participants: {
        Row: {
          id: string;
          action_id: string;
          user_id: string | null;
          phone: string;
          role: ParticipantRole;
          status: ParticipantStatus;
          selection: string | null;
          side_label: string | null;
          invite_token: string | null;
          invite_expires_at: string | null;
          invited_at: string;
          responded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          user_id?: string | null;
          phone: string;
          role: ParticipantRole;
          status?: ParticipantStatus;
          selection?: string | null;
          side_label?: string | null;
          invite_token?: string | null;
          invite_expires_at?: string | null;
          invited_at?: string;
          responded_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          user_id?: string | null;
          phone?: string;
          role?: ParticipantRole;
          status?: ParticipantStatus;
          selection?: string | null;
          side_label?: string | null;
          invite_token?: string | null;
          invite_expires_at?: string | null;
          invited_at?: string;
          responded_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "participants_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_action_votes: {
        Row: {
          id: string;
          action_id: string;
          round: number;
          voter_participant_id: string;
          selected_participant_id: string;
          proof_photo_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          round: number;
          voter_participant_id: string;
          selected_participant_id: string;
          proof_photo_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          round?: number;
          voter_participant_id?: string;
          selected_participant_id?: string;
          proof_photo_path?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "custom_action_votes_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custom_action_votes_voter_participant_id_fkey";
            columns: ["voter_participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custom_action_votes_selected_participant_id_fkey";
            columns: ["selected_participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      settlement_obligations: {
        Row: {
          id: string;
          action_id: string;
          debtor_participant_id: string;
          creditor_participant_id: string;
          amount: number;
          payment_status: PaymentSettlementStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          debtor_participant_id: string;
          creditor_participant_id: string;
          amount: number;
          payment_status?: PaymentSettlementStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          debtor_participant_id?: string;
          creditor_participant_id?: string;
          amount?: number;
          payment_status?: PaymentSettlementStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlement_obligations_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlement_obligations_debtor_participant_id_fkey";
            columns: ["debtor_participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlement_obligations_creditor_participant_id_fkey";
            columns: ["creditor_participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      action_status_history: {
        Row: {
          id: string;
          action_id: string;
          from_status: ActionStatus | null;
          to_status: ActionStatus;
          changed_by: ChangedByActor;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          from_status?: ActionStatus | null;
          to_status: ActionStatus;
          changed_by?: ChangedByActor;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          from_status?: ActionStatus | null;
          to_status?: ActionStatus;
          changed_by?: ChangedByActor;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_status_history_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          action_id: string | null;
          type: NotificationType;
          title: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action_id?: string | null;
          type: NotificationType;
          title: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action_id?: string | null;
          type?: NotificationType;
          title?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_settlement_events: {
        Row: {
          id: string;
          action_id: string;
          obligation_id: string | null;
          event_type: PaymentSettlementEventType;
          actor_user_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_id: string;
          obligation_id?: string | null;
          event_type: PaymentSettlementEventType;
          actor_user_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_id?: string;
          obligation_id?: string | null;
          event_type?: PaymentSettlementEventType;
          actor_user_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_settlement_events_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_settlement_events_obligation_id_fkey";
            columns: ["obligation_id"];
            isOneToOne: false;
            referencedRelation: "settlement_obligations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_settlement_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_otp_codes: {
        Row: {
          phone: string;
          code_hash: string;
          expires_at: string;
          attempts: number;
          created_at: string;
        };
        Insert: {
          phone: string;
          code_hash: string;
          expires_at: string;
          attempts?: number;
          created_at?: string;
        };
        Update: {
          phone?: string;
          code_hash?: string;
          expires_at?: string;
          attempts?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          user_id: string;
          kind: PurchaseKind;
          status: PurchaseStatus;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id: string | null;
          stripe_customer_id: string | null;
          amount_cents: number;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: PurchaseKind;
          status?: PurchaseStatus;
          stripe_checkout_session_id: string;
          stripe_payment_intent_id?: string | null;
          stripe_customer_id?: string | null;
          amount_cents: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: PurchaseKind;
          status?: PurchaseStatus;
          stripe_checkout_session_id?: string;
          stripe_payment_intent_id?: string | null;
          stripe_customer_id?: string | null;
          amount_cents?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      action_passes: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          expires_at: string;
          purchase_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at?: string;
          expires_at: string;
          purchase_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          expires_at?: string;
          purchase_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_passes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_passes_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
        ];
      };
      action_credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: CreditTransactionType;
          amount: number;
          reference_type: string | null;
          reference_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: CreditTransactionType;
          amount: number;
          reference_type?: string | null;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: CreditTransactionType;
          amount?: number;
          reference_type?: string | null;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_credit_transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      referrals: {
        Row: {
          id: string;
          inviter_user_id: string;
          invitee_phone: string;
          invitee_user_id: string | null;
          triggering_action_id: string | null;
          reward_transaction_id: string | null;
          reward_granted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          inviter_user_id: string;
          invitee_phone: string;
          invitee_user_id?: string | null;
          triggering_action_id?: string | null;
          reward_transaction_id?: string | null;
          reward_granted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          inviter_user_id?: string;
          invitee_phone?: string;
          invitee_user_id?: string | null;
          triggering_action_id?: string | null;
          reward_transaction_id?: string | null;
          reward_granted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referrals_inviter_user_id_fkey";
            columns: ["inviter_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_invitee_user_id_fkey";
            columns: ["invitee_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_triggering_action_id_fkey";
            columns: ["triggering_action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_reward_transaction_id_fkey";
            columns: ["reward_transaction_id"];
            isOneToOne: false;
            referencedRelation: "action_credit_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_webhook_events: {
        Row: {
          stripe_event_id: string;
          event_type: string;
          payload: Json | null;
          received_at: string;
        };
        Insert: {
          stripe_event_id: string;
          event_type: string;
          payload?: Json | null;
          received_at?: string;
        };
        Update: {
          stripe_event_id?: string;
          event_type?: string;
          payload?: Json | null;
          received_at?: string;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          event_name: string;
          user_id: string | null;
          action_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          user_id?: string | null;
          action_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_name?: string;
          user_id?: string | null;
          action_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "analytics_events_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_action_credit_or_pass: {
        Args: { p_user_id: string; p_action_id: string; p_amount?: number };
        Returns: { allowed: boolean; method: string; balance_after: number | null }[];
      };
      grant_referral_reward_if_eligible: {
        Args: { p_user_id: string; p_action_id: string; p_reward_amount: number };
        Returns: { granted: boolean; inviter_user_id: string | null }[];
      };
      settlement_create_obligations: {
        Args: { p_action_id: string; p_winner_participant_id: string };
        Returns: { ok: boolean; obligations_created: number }[];
      };
      settlement_mark_not_applicable: {
        Args: { p_action_id: string };
        Returns: { ok: boolean }[];
      };
      settlement_mark_paid: {
        Args: { p_obligation_id: string; p_actor_user_id: string };
        Returns: { ok: boolean; error: string | null }[];
      };
      settlement_confirm_received: {
        Args: { p_obligation_id: string; p_actor_user_id: string };
        Returns: { ok: boolean; error: string | null }[];
      };
      settlement_dispute: {
        Args: { p_obligation_id: string; p_actor_user_id: string };
        Returns: { ok: boolean; error: string | null }[];
      };
      settlement_record_reminder: {
        Args: { p_obligation_id: string; p_event_type: PaymentSettlementEventType };
        Returns: { sent: boolean }[];
      };
      settlement_record_nudge: {
        Args: { p_obligation_id: string; p_actor_user_id: string };
        Returns: { ok: boolean; error: string | null; next_available_at: string | null }[];
      };
      submit_custom_action_vote: {
        Args: {
          p_action_id: string;
          p_voter_user_id: string;
          p_selected_participant_id: string;
          p_proof_photo_path?: string | null;
        };
        Returns: {
          ok: boolean;
          error: string | null;
          all_voted: boolean;
          unanimous: boolean | null;
          winner_participant_id: string | null;
        }[];
      };
      revote_custom_action: {
        Args: { p_action_id: string; p_actor_user_id: string };
        Returns: { ok: boolean; error: string | null }[];
      };
    };
    Enums: {
      league: League;
      game_status: GameStatus;
      market_type: MarketType;
      action_status: ActionStatus;
      participant_role: ParticipantRole;
      participant_status: ParticipantStatus;
      notification_type: NotificationType;
      changed_by_actor: ChangedByActor;
      credit_transaction_type: CreditTransactionType;
      purchase_kind: PurchaseKind;
      purchase_status: PurchaseStatus;
      payment_settlement_status: PaymentSettlementStatus;
      payment_settlement_event_type: PaymentSettlementEventType;
      action_type: ActionType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type FunctionArgs<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Args"];
export type FunctionReturns<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Returns"];
