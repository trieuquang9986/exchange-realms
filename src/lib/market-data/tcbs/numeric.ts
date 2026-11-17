// TCBS sends many board numbers as strings ("23450"), and others as JSON numbers. Both are accepted.
// Anything else (empty text, "N/A", NaN, objects) is missing, never 0.

/** A finite number from a JSON number or a plain decimal string; otherwise null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Like num, but 0 and negatives count as missing. For prices and traded volume, where 0 means "none". */
export function positive(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
}
