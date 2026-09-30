// AGAPE's confirmed tracking scope. The wider UN taxonomy remains valid historical evidence.
export const FOCUS_SDG_NUMBERS = Object.freeze([4, 9, 11, 17]);

/** @param {unknown} number */
export function isFocusSdg(number) {
  return typeof number === "number" && FOCUS_SDG_NUMBERS.includes(number);
}

/** @param {number[]} numbers */
export function focusSdgs(numbers) {
  return FOCUS_SDG_NUMBERS.filter(number => numbers.includes(number));
}

/** Project retained aggregate data without mutating the stored snapshot. @param {Record<string, number>} counts */
export function focusSdgCounts(counts) {
  return Object.fromEntries(FOCUS_SDG_NUMBERS.filter(number => Object.hasOwn(counts, number)).map(number => [number, counts[number]]));
}

export const SDG_FOCUS_GUIDANCE = "AGAPE tracks only SDG 4 (Quality Education), SDG 9 (Industry, Innovation and Infrastructure), SDG 11 (Sustainable Cities and Communities), and SDG 17 (Partnerships for the Goals). Suggest only these goals when supported by evidence; do not force an alignment or claim measured SDG outcomes from software features alone. All suggestions require human review.";
