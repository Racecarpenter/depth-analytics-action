import type { MarketType } from "@/types/domain";

export type Grade = "won" | "lost" | "push";

export interface GradeInput {
  market: MarketType;
  /** Home-relative line: for spread, home team's own signed line; for total, the shared total. Null for moneyline. */
  line: number | null;
  /** This participant's selection: a team abbreviation for moneyline/spread, or "over" / "under" for total. */
  selection: string;
  homeAbbreviation: string;
  awayAbbreviation: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Pure grading logic, kept independent of the database and any provider so
 * it's trivially unit-testable. Used by the settlement cron job for both
 * participants of an Action.
 */
export function gradeSelection(input: GradeInput): Grade {
  const { market, line, selection, homeAbbreviation, awayAbbreviation, homeScore, awayScore } = input;

  switch (market) {
    case "moneyline": {
      if (homeScore === awayScore) return "push";
      const winner = homeScore > awayScore ? homeAbbreviation : awayAbbreviation;
      return selection === winner ? "won" : "lost";
    }
    case "spread": {
      const homeLine = line ?? 0;
      const adjustedHome = homeScore + homeLine;
      if (adjustedHome === awayScore) return "push";
      const homeCovers = adjustedHome > awayScore;
      const pickedHome = selection === homeAbbreviation;
      return pickedHome === homeCovers ? "won" : "lost";
    }
    case "total": {
      const total = homeScore + awayScore;
      const targetLine = line ?? 0;
      if (total === targetLine) return "push";
      const overHits = total > targetLine;
      const pickedOver = selection === "over";
      return pickedOver === overHits ? "won" : "lost";
    }
    default: {
      const exhaustiveCheck: never = market;
      throw new Error(`Unhandled market type: ${exhaustiveCheck}`);
    }
  }
}

/** Maps the creator's grade to the canonical action_status value. */
export function actionStatusFromGrade(grade: Grade): "won" | "lost" | "push" {
  return grade;
}
