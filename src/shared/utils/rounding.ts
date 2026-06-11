export type RoundingRule =
  | "none"
  | "nearest_50"
  | "nearest_100"
  | "up_nearest_100"
  | "up_nearest_500";

export function applyRounding(amount: number, rule: RoundingRule) {
  if (rule === "none") return Math.round(amount);
  if (rule === "nearest_50") return Math.round(amount / 50) * 50;
  if (rule === "nearest_100") return Math.round(amount / 100) * 100;
  if (rule === "up_nearest_100") return Math.ceil(amount / 100) * 100;
  return Math.ceil(amount / 500) * 500;
}
