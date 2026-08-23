import { createClient } from "@/lib/supabase/server";
import { canClearFinance } from "@/lib/auth/roles";
import { NextResponse } from "next/server";

// Focused queue for the Finance Officer: proposals currently sitting in
// finance_review that have NOT yet been cleared. Returns just the fields the
// finance UI needs (budget, dates, submitter, sdg counts) — no review history
// or pipeline metadata, to keep the response small.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: self } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!canClearFinance(self?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pending: in finance_review and not yet cleared.
  // Cleared: cleared but not yet advanced/approved — useful for review.
  const [pendingRes, recentRes] = await Promise.all([
    supabase
      .from("project_proposals")
      .select("id, title, rationale, budget, is_income_generating, timeline_start, timeline_end, created_at, created_by, finance_clearance, barangays(name), submitter:users!created_by(full_name, role), proposal_sdg_alignment(sdg_number)")
      .eq("status", "finance_review")
      .eq("finance_clearance", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_proposals")
      .select("id, title, budget, finance_cleared_at, finance_notes, status, barangays(name)")
      .eq("finance_clearance", true)
      .order("finance_cleared_at", { ascending: false })
      .limit(10),
  ]);

  if (pendingRes.error) return NextResponse.json({ error: pendingRes.error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      pending: pendingRes.data ?? [],
      recent:  recentRes.data ?? [],
    },
  });
}
