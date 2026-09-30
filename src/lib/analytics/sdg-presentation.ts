import { FOCUS_SDG_NUMBERS } from "../sdg-focus.js";

const goals = [
  ["No Poverty", "#E5243B"], ["Zero Hunger", "#DDA63A"], ["Good Health and Well-being", "#4C9F38"],
  ["Quality Education", "#C5192D"], ["Gender Equality", "#FF3A21"], ["Clean Water and Sanitation", "#26BDE2"],
  ["Affordable and Clean Energy", "#FCC30B"], ["Decent Work and Economic Growth", "#A21942"],
  ["Industry, Innovation and Infrastructure", "#FD6925"], ["Reduced Inequalities", "#DD1367"],
  ["Sustainable Cities and Communities", "#FD9D24"], ["Responsible Consumption and Production", "#BF8B2E"],
  ["Climate Action", "#3F7E44"], ["Life Below Water", "#0A97D9"], ["Life on Land", "#56C02B"],
  ["Peace, Justice and Strong Institutions", "#00689D"], ["Partnerships for the Goals", "#19486A"],
] as const;
// Full labels are for preserved record detail only, never an active picker/metric list.
export const HISTORICAL_SDG_PRESENTATION: Record<number, { label: string; color: string }> = Object.fromEntries(goals.map(([label, color], index) => [index + 1, { label, color }]));
export const SDG_NUMBERS = FOCUS_SDG_NUMBERS;
export const SDG_PRESENTATION: Record<number, { label: string; color: string }> = Object.fromEntries(SDG_NUMBERS.map(number => [number, HISTORICAL_SDG_PRESENTATION[number]]));
