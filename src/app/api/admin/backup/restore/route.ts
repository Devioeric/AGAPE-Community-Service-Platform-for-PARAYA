import { authorizeCapability } from "@/lib/auth/authorize";
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  type BackupFile,
} from "@/lib/backup/tables";
import { NextResponse } from "next/server";

type RestoreMode = "dry_run" | "commit";

interface Body {
  mode: RestoreMode;
  file: BackupFile;
}

interface TableResult {
  table: string;
  status: "ok" | "skipped" | "error";
  rows: number;
  message?: string;
}

function validateFile(
  file: unknown,
): { ok: true; file: BackupFile } | { ok: false; error: string } {
  if (!file || typeof file !== "object") {
    return { ok: false, error: "Backup file payload missing" };
  }
  const candidate = file as Partial<BackupFile>;
  if (typeof candidate.version !== "number") {
    return { ok: false, error: "Backup file missing version" };
  }
  if (candidate.version !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version ${candidate.version} (expected ${BACKUP_FORMAT_VERSION})`,
    };
  }
  if (!candidate.tables || typeof candidate.tables !== "object") {
    return { ok: false, error: "Backup file missing tables object" };
  }
  return { ok: true, file: candidate as BackupFile };
}

/**
 * Phase 0 retains read-only restore validation but disables restore commits.
 * The previous generic service-role upsert accepted arbitrary uploaded row
 * objects and could bypass account, ownership, workflow, and append-only
 * controls. A future restore implementation must use a signed manifest,
 * per-table schemas, a maintenance window, and one database transaction.
 */
export async function POST(request: Request) {
  const auth = await authorizeCapability("admin.recovery.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.mode !== "dry_run" && body.mode !== "commit") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (body.mode === "commit") {
    return NextResponse.json(
      {
        error:
          "Backup restore commits are temporarily disabled pending a transactional, schema-validated restore design.",
        code: "restore_commit_disabled",
      },
      { status: 503 },
    );
  }

  const validated = validateFile(body.file);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const file = validated.file;
  const unknownTables = Object.keys(file.tables).filter(
    (table) => !(BACKUP_TABLES as readonly string[]).includes(table),
  );
  const results: TableResult[] = [];

  for (const table of BACKUP_TABLES) {
    const rows = file.tables[table];
    if (!Array.isArray(rows)) {
      results.push({
        table,
        status: "skipped",
        rows: 0,
        message: "Not in backup file",
      });
      continue;
    }
    results.push({ table, status: "ok", rows: rows.length });
  }

  const totalRows = results.reduce(
    (sum, result) => sum + (result.status === "ok" ? result.rows : 0),
    0,
  );

  return NextResponse.json({
    mode: "dry_run",
    source_generated_at: file.generated_at,
    total_rows: totalRows,
    error_count: 0,
    unknown_tables: unknownTables,
    results,
  });
}
