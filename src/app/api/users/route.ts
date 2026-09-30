import { NextResponse } from "next/server";
import { authorizeCapability } from "@/lib/auth/authorize";
import { ACTIVE_LOGIN_ROLES, ROLE_LABELS, isActiveLoginRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZES = new Set([10, 25, 50]);
const STATUSES = new Set(["active", "pending", "suspended"]);

export async function GET(request: Request) {
  const auth = await authorizeCapability("admin.users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = Number.parseInt(url.searchParams.get("page_size") ?? "10", 10);
  const pageSize = PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 10;
  const includeHistorical = url.searchParams.get("include_historical") === "true";
  const role = url.searchParams.get("role")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const barangayId = url.searchParams.get("barangay_id")?.trim() || null;
  const sort = url.searchParams.get("sort") === "name" ? "name" : "newest";
  const q = (url.searchParams.get("q") ?? "").trim().replace(/[,%()]/g, "").slice(0, 120);
  if (role && !isActiveLoginRole(role) && !includeHistorical) return NextResponse.json({ error: "Invalid active role filter", code: "invalid_filter" }, { status: 400 });
  if (status && !STATUSES.has(status)) return NextResponse.json({ error: "Invalid status filter", code: "invalid_filter" }, { status: 400 });

  let query = auth.supabase.from("users").select("id, full_name, email, role, status, is_active, barangay_id, permissions, must_change_password, created_at, updated_at, barangays(name)", { count: "exact" });
  query = includeHistorical ? query.not("role", "in", `(${ACTIVE_LOGIN_ROLES.join(",")})`) : query.in("role", [...ACTIVE_LOGIN_ROLES]);
  if (role) query = query.eq("role", role);
  if (status) query = query.eq("status", status);
  if (barangayId) query = query.eq("barangay_id", barangayId);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  query = (sort === "name" ? query.order("full_name") : query.order("created_at", { ascending: false })).range((page - 1) * pageSize, page * pageSize - 1);

  const count = (statusValue?: string, historical = false) => {
    let countQuery = auth.supabase.from("users").select("id", { count: "exact", head: true });
    countQuery = historical ? countQuery.not("role", "in", `(${ACTIVE_LOGIN_ROLES.join(",")})`) : countQuery.in("role", [...ACTIVE_LOGIN_ROLES]);
    return statusValue ? countQuery.eq("status", statusValue) : countQuery;
  };
  const [directory, activeCount, pendingCount, suspendedCount, historicalCount] = await Promise.all([query, count("active"), count("pending"), count("suspended"), count(undefined, true)]);
  if ([directory, activeCount, pendingCount, suspendedCount, historicalCount].some((result) => result.error)) return NextResponse.json({ error: "User directory is temporarily unavailable", code: "directory_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });

  const total = directory.count ?? 0;
  const contributorIds = (directory.data ?? [])
    .filter((user) => user.role === "contributor")
    .map((user) => user.id);
  const contributorMemberships = new Map<string, Array<{ id: string; name: string; type: string }>>();
  if (contributorIds.length > 0) {
    const admin = createAdminClient();
    const links = await admin
      .from("contributor_partner_links")
      .select("contributor_user_id,partner_id")
      .in("contributor_user_id", contributorIds)
      .eq("status", "active");
    if (links.error) {
      return NextResponse.json({ error: "User directory is temporarily unavailable", code: "directory_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    const partnerIds = (links.data ?? []).map((link) => link.partner_id).filter((id): id is string => typeof id === "string");
    if (partnerIds.length > 0) {
      const entities = await admin
        .from("partner_entities")
        .select("id,name,entity_type")
        .in("id", partnerIds)
        .eq("lifecycle", "active")
        .eq("classification", "internal")
        .in("entity_type", ["dyci_office", "student_organization", "academic_department"]);
      if (entities.error) {
        return NextResponse.json({ error: "User directory is temporarily unavailable", code: "directory_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
      const entityById = new Map((entities.data ?? []).map((entity) => [entity.id, entity]));
      for (const link of links.data ?? []) {
        const entity = entityById.get(link.partner_id);
        if (!entity || typeof entity.name !== "string" || typeof entity.entity_type !== "string") continue;
        const rows = contributorMemberships.get(link.contributor_user_id) ?? [];
        rows.push({ id: entity.id, name: entity.name, type: entity.entity_type });
        contributorMemberships.set(link.contributor_user_id, rows);
      }
    }
  }
  return NextResponse.json({
    data: (directory.data ?? []).map((user) => ({
      ...user,
      role_label: ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role,
      historical: !isActiveLoginRole(user.role),
      partner_memberships: user.role === "contributor" ? (contributorMemberships.get(user.id) ?? []) : [],
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    counts: { active: activeCount.count ?? 0, pending: pendingCount.count ?? 0, suspended: suspendedCount.count ?? 0, historical: historicalCount.count ?? 0 },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
