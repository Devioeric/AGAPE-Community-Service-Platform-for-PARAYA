export const LEGACY_PAGE_SIZE = 10;
// Preserve the existing 10,000-record search window while using smaller pages.
export const LEGACY_MAX_PAGE = 1_000;
export type LegacyHousehold = {
  id: string; household_number: string; member_count: number;
  sitio: string | null; collected_at: string; barangays: { name: string } | null;
};
export type LegacyHouseholdPage = {
  data: LegacyHousehold[];
  pagination: { page: number; pageSize: number; hasNextPage: boolean };
};

export function parseLegacyListParams(params: URLSearchParams) {
  const page = params.get("page") ?? "1";
  const q = (params.get("q") ?? "").trim();
  const barangayId = params.get("barangay_id");
  if (!/^[1-9]\d{0,3}$/.test(page) || Number(page) > LEGACY_MAX_PAGE
    || q.length > 80 || (q && !new RegExp("^[\\p{L}\\p{N}\\s._'-]+$", "u").test(q))
    || (barangayId && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(barangayId))) return null;
  return { page: Number(page), q, barangayId };
}

export function legacySearchPattern(q: string) {
  return `%${q.replace(/[_%\\]/g, "\\$&")}%`;
}
