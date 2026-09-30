import { z } from "zod";
import { templateSaveSchema } from "./template-contract";

const questionType = z.enum(["text", "multiple_choice", "checkbox", "rating"]);
const templateReadSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string().nullable(),
  sections: z.array(z.object({ localId: z.string(), title: z.string(), category: z.string(), defaultQuestionType: questionType })),
  questions: z.array(z.object({ localId: z.string(), question_text: z.string(), question_type: questionType,
    options: z.array(z.string()), is_required: z.boolean(), section_local_id: z.string(),
    conditional_on: z.string().optional(), conditional_value: z.string().optional(),
  })),
  created_by: z.string().nullable(), created_at: z.string().datetime({ offset: true }),
  row_version: z.number().int().positive(), archived_at: z.string().datetime({ offset: true }).nullable(),
  archive_reason: z.string().nullable(), can_manage: z.boolean(),
}).refine(value => templateSaveSchema.safeParse({
  name: value.name, description: value.description ?? "", sections: value.sections, questions: value.questions,
}).success, "Invalid template structure");
export type SurveyTemplate = z.infer<typeof templateReadSchema>;
export type TemplateReadState = {
  status: "idle" | "loading" | "success" | "error" | "denied";
  data: SurveyTemplate[] | null;
};
export function parseTemplateLibrary(value: unknown): SurveyTemplate[] {
  return z.array(templateReadSchema).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Duplicate template IDs").parse(value);
}

/** One in-flight library request shared by mount/open/retry; cancellation invalidates stale results. */
export function createTemplateLibraryReader(fetcher: typeof fetch = fetch) {
  let pending: Promise<SurveyTemplate[] | undefined> | null = null;
  let controller: AbortController | null = null;
  return {
    load(publish: (state: TemplateReadState) => void): Promise<SurveyTemplate[] | undefined> {
      if (pending) return pending;
      const active = new AbortController();
      controller = active;
      publish({ status: "loading", data: null });
      pending = (async () => {
        try {
          const response = await fetcher("/api/survey-templates?include_archived=true", { cache: "no-store", signal: active.signal });
          if (active.signal.aborted) return;
          if (!response.ok) {
            publish({ status: [401, 403].includes(response.status) ? "denied" : "error", data: null });
            return;
          }
          const envelope = await response.json();
          const data = parseTemplateLibrary(envelope?.data);
          if (!active.signal.aborted) { publish({ status: "success", data }); return data; }
        } catch {
          if (!active.signal.aborted) publish({ status: "error", data: null });
        } finally {
          if (controller === active) { pending = null; controller = null; }
        }
      })();
      return pending;
    },
    cancel() { controller?.abort(); controller = null; pending = null; },
  };
}

export function currentTemplateSelection(id: string | null, rows: SurveyTemplate[]) {
  return rows.some(row => row.id === id && !row.archived_at) ? id : null;
}
