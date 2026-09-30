import { z } from "zod";
import type { AuthorizationResult } from "@/lib/auth/authorize";

type Client = Extract<AuthorizationResult, { ok: true }>["supabase"];
const budgetStatuses = ["draft", "submitted", "returned", "cleared", "superseded"] as const;
const allocationStatuses = ["draft", "submitted", "returned", "active", "superseded"] as const;
const budgetRows = z.array(z.object({ budget_status: z.enum(budgetStatuses) }));
const allocationRows = z.array(z.object({ allocationStatus: z.enum(allocationStatuses).nullable() }));

/** Use existing runtime/mode-aware read RPCs; finance tables intentionally deny direct SELECT. */
export async function financeChartPoints(client: Client, view: "budgets" | "allocations") {
  const counts: Record<string, number> = Object.fromEntries((view === "budgets" ? budgetStatuses : [...allocationStatuses, "not_allocated"]).map(status => [status, 0]));
  if (view === "budgets") {
    // SETOF results are subject to PostgREST row limits. Traverse a stable UUID order.
    for (let offset = 0; ; offset += 500) {
      if (offset >= 50_000) throw new Error("Finance queue exceeds chart limit");
      // proposal_id must be selected: PostgREST orders the projected rows.
      const result = await client.rpc("phase2_list_finance_proposals").select("proposal_id,budget_status").order("proposal_id").range(offset, offset + 499);
      if (result.error) throw result.error;
      const rows = budgetRows.parse(result.data);
      for (const row of rows) counts[row.budget_status]++;
      if (rows.length < 500) break;
    }
  } else {
    const result = await client.rpc("phase2_list_program_finance_queue");
    if (result.error) throw result.error;
    for (const row of allocationRows.parse(result.data)) counts[row.allocationStatus ?? "not_allocated"]++;
  }
  return Object.entries(counts).map(([status, value]) => ({ label: status === "not_allocated" ? "Not allocated" : status[0].toUpperCase() + status.slice(1), value }));
}
