import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const cycleContextSchema = z.object({
  id: z.string().uuid(),
  barangay_id: z.string().uuid(),
  status: z.enum(["draft", "collecting", "validating", "completed", "archived"]),
  collection_starts_on: z.string().date(),
  collection_ends_on: z.string().date(),
  row_version: z.number().int().positive(),
});

const submissionSummarySchema = z.object({ id: z.string().uuid(), row_version: z.number().int().positive() });

export type ProfilingCycleContext = z.infer<typeof cycleContextSchema>;
export type ProfilingSubmissionMutationDTO = { id: string; rowVersion: number };

/** Uses the actor-scoped Phase 1 cycle RPC and returns only validation context. */
export async function getAuthorizedProfilingCycleContext(client: SupabaseClient, cycleId: string): Promise<ProfilingCycleContext | null> {
  if (!z.string().uuid().safeParse(cycleId).success) return null;
  const { data, error } = await client.rpc("phase1_list_profiling_cycles", { p_barangay_id: null });
  if (error) throw error;
  const rows = z.array(cycleContextSchema).parse(data ?? []);
  return rows.find((row) => row.id === cycleId) ?? null;
}

/** Resolves the committed row version through the actor-scoped summary RPC. */
export async function getProfilingSubmissionMutationDTO(client: SupabaseClient, cycleId: string, submissionId: string): Promise<ProfilingSubmissionMutationDTO> {
  const { data, error } = await client.rpc("phase1_list_profiling_submissions", { p_cycle_id: cycleId });
  if (error) throw error;
  const rows = z.array(submissionSummarySchema).parse(data ?? []);
  const row = rows.find((candidate) => candidate.id === submissionId);
  if (!row) throw new Error("Committed profiling submission was not returned by the scoped summary");
  return { id: row.id, rowVersion: row.row_version };
}
