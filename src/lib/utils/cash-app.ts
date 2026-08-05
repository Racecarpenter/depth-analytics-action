/**
 * Builds a Cash App payment link: cash.app/$cashtag/amount, optionally with
 * a pre-filled note. Opening this link (in Cash App if installed, the web
 * otherwise) takes the payer straight to a pre-filled payment — they still
 * have to review and confirm it themselves. There is no Cash App API for a
 * third party to move money between two consumer accounts directly; this
 * link is the honest, non-custodial way to do this. ACTION never touches
 * the money — Cash App does, same as if you'd typed the link in yourself.
 */
export function buildCashAppPayLink(cashtag: string, amount: number, note?: string): string {
  const handle = cashtag.replace(/^\$/, "");
  const formattedAmount = amount.toFixed(2);
  const url = `https://cash.app/$${handle}/${formattedAmount}`;
  if (!note) return url;
  return `${url}?${new URLSearchParams({ note }).toString()}`;
}
