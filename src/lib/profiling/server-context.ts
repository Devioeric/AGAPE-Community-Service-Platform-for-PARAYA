import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const cycleContextSchema = z.object({
  id: z.string().uuid(),
  barangay_id: z.string().uuid(),
  status: z.enum(["draft", "collecting", "validating", "completed", "archived"]),
  collection_starts_on: z.string().date(),
  collection_ends_on: z.string().date(),
  row_version: z.number().int().positive(),
}).strict();

const submissionMutationSchema = z.object({
  id: z.string().uuid(),
  row_version: z.number().int().positive(),
  cycle_id: z.string().uuid(),
}).strict();

export type ProfilingCycleContext = z.infer<typeof cycleContextSchema>;
export type ProfilingSubmissionMutationDTO = { id: string; rowVersion: number };

/** Uses the actor-scoped Phase 1 cycle RPC and returns only validation context. */
export async function getAuthorizedProfilingCycleContext(client: SupabaseClient, cycleId: string): Promise<ProfilingCycleContext | null> {
  if (!z.string().uuid().safeParse(cycleId).success) return null;
  const { data, error } = await client.rpc("phase1_get_profiling_cycle_context", { p_cycle_id: cycleId });
  if (error) throw error;
  return cycleContextSchema.parse(data);
}

/** Resolves the committed row version through the actor-scoped summary RPC. */
export async function getProfilingSubmissionMutationDTO(client: SupabaseClient, cycleId: string, submissionId: string): Promise<ProfilingSubmissionMutationDTO> {
  const { data, error } = await client.rpc("phase1_get_profiling_submission_mutation", { p_submission_id: submissionId });
  if (error) throw error;
  const row = submissionMutationSchema.parse(data);
  if (row.cycle_id !== cycleId || row.id !== submissionId) throw new Error("Committed profiling submission did not match its scoped mutation result");
  return { id: row.id, rowVersion: row.row_version };
}
