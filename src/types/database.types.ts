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
  | "expired";

export type ParticipantRole = "creator" | "opponent";

export type ParticipantStatus = "invited" | "accepted" | "declined";

export type NotificationType =
  | "invite_received"
  | "action_accepted"
  | "action_declined"
  | "action_live"
  | "action_settled"
  | "action_cancelled";

export type ChangedByActor = "system" | "creator" | "opponent";

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
          game_id: string;
          market: MarketType;
          line: number | null;
          status: ActionStatus;
          stake_amount: number | null;
          stake_currency: string;
          stake_note: string;
          locked_at: string | null;
          resolved_at: string | null;
          cancelled_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          game_id: string;
          market: MarketType;
          line?: number | null;
          status?: ActionStatus;
          stake_amount?: number | null;
          stake_currency?: string;
          stake_note?: string;
          locked_at?: string | null;
          resolved_at?: string | null;
          cancelled_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          game_id?: string;
          market?: MarketType;
          line?: number | null;
          status?: ActionStatus;
          stake_amount?: number | null;
          stake_currency?: string;
          stake_note?: string;
          locked_at?: string | null;
          resolved_at?: string | null;
          cancelled_reason?: string | null;
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
          selection: string;
          side_label: string;
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
          selection: string;
          side_label: string;
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
          selection?: string;
          side_label?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      league: League;
      game_status: GameStatus;
      market_type: MarketType;
      action_status: ActionStatus;
      participant_role: ParticipantRole;
      participant_status: ParticipantStatus;
      notification_type: NotificationType;
      changed_by_actor: ChangedByActor;
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
