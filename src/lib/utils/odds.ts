/** Formats American odds with an explicit sign, e.g. 150 -> "+150", -110 -> "-110". */
export function formatAmericanOdds(odds: number | null): string {
  if (odds === null) return "";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Formats a spread/total line with an explicit sign where relevant, e.g. 5.5 -> "+5.5". */
export function formatLine(line: number | null, kind: "spread" | "total"): string {
  if (line === null) return "";
  if (kind === "total") return `${line}`;
  return line > 0 ? `+${line}` : `${line}`;
}
