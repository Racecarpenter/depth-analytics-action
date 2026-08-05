const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatStake(amount: number | null): string {
  if (amount === null) return "No stake set";
  return formatter.format(amount);
}
