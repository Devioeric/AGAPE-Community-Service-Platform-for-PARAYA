import { createHash } from "node:crypto";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedSql(value) {
  return value.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
}

/** Split pg_dump DDL without breaking quoted strings or dollar-quoted bodies. */
export function splitSqlStatements(source) {
  const statements = [];
  let start = 0;
  let single = false;
  let double = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") { blockComment = false; index += 1; }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) { index += dollarTag.length - 1; dollarTag = null; }
      continue;
    }
    if (!single && !double && current === "-" && next === "-") { lineComment = true; index += 1; continue; }
    if (!single && !double && current === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (!double && current === "'") {
      if (single && next === "'") { index += 1; continue; }
      single = !single;
      continue;
    }
    if (!single && current === '"') {
      if (double && next === '"') { index += 1; continue; }
      double = !double;
      continue;
    }
    if (!single && !double && current === "$") {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(source.slice(index));
      if (match) { dollarTag = match[0]; index += dollarTag.length - 1; continue; }
    }
    if (!single && !double && current === ";") {
      const value = source.slice(start, index + 1).trim();
      if (value) statements.push(value);
      start = index + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function identifier(value) {
  return value?.replaceAll('"', "") ?? null;
}

function statementItem(stableIdentifier, statement, extra = {}) {
  return { stableIdentifier, definitionSha256: sha256(normalizedSql(statement)), ...extra };
}

function matchObject(statement, pattern) {
  return pattern.exec(statement.replace(/^\s*(?:--[^\r\n]*[\r\n]+)*/g, ""));
}

export function extractPublicCatalog(publicSchemaSource, extensionSchemaSource = "") {
  const statements = splitSqlStatements(publicSchemaSource);
  const tablesColumns = [];
  const constraintsIndexes = [];
  const functions = [];
  const triggers = [];
  const rlsPolicies = [];
  const grants = [];
  const extensions = [];

  for (const statement of statements) {
    let match = matchObject(statement, /^CREATE TABLE(?: IF NOT EXISTS)?\s+"?public"?\."?([^"\s(]+)"?/i);
    if (match) {
      const table = identifier(match[1]);
      tablesColumns.push(statementItem(`public.table.${table}`, statement, { schema: "public", objectType: "table", tableName: table }));
      continue;
    }
    match = matchObject(statement, /^ALTER TABLE(?: ONLY)?\s+"?public"?\."?([^"\s]+)"?\s+ADD CONSTRAINT\s+"?([^"\s]+)"?/i);
    if (match) {
      const table = identifier(match[1]); const name = identifier(match[2]);
      constraintsIndexes.push(statementItem(`public.constraint.${table}.${name}`, statement, { schema: "public", objectType: "constraint", tableName: table, name }));
      continue;
    }
    match = matchObject(statement, /^CREATE(?: UNIQUE)? INDEX\s+"?([^"\s]+)"?\s+ON\s+"?public"?\."?([^"\s]+)"?/i);
    if (match) {
      const name = identifier(match[1]); const table = identifier(match[2]);
      constraintsIndexes.push(statementItem(`public.index.${table}.${name}`, statement, { schema: "public", objectType: "index", tableName: table, name }));
      continue;
    }
    match = matchObject(statement, /^CREATE(?: OR REPLACE)? FUNCTION\s+"?public"?\."?([^"(]+)"?\s*\(([^)]*)\)/i);
    if (match) {
      const name = identifier(match[1]);
      const argumentsSha256 = sha256(normalizedSql(match[2]));
      functions.push(statementItem(`public.function.${name}.${argumentsSha256.slice(0, 16)}`, statement, {
        schema: "public", objectType: "function", name, argumentsSha256,
        securityMode: /\bSECURITY\s+DEFINER\b/i.test(statement) ? "definer" : "invoker",
        configuredSearchPath: /\bSET\s+(?:search_path|"search_path")\s*(?:TO|=)\s*([^\r\n;]+)/i.test(statement),
      }));
      continue;
    }
    match = matchObject(statement, /^CREATE(?: OR REPLACE)? TRIGGER\s+"?([^"\s]+)"?.*?\sON\s+"?public"?\."?([^"\s]+)"?/is);
    if (match) {
      const name = identifier(match[1]); const table = identifier(match[2]);
      triggers.push(statementItem(`public.trigger.${table}.${name}`, statement, { schema: "public", objectType: "trigger", tableName: table, name }));
      continue;
    }
    match = matchObject(statement, /^CREATE POLICY\s+"?([^"\r\n]+?)"?\s+ON\s+"?public"?\."?([^"\s]+)"?/i);
    if (match) {
      const name = identifier(match[1]); const table = identifier(match[2]);
      rlsPolicies.push(statementItem(`public.policy.${table}.${name}`, statement, { schema: "public", objectType: "policy", tableName: table, name }));
      continue;
    }
    match = matchObject(statement, /^ALTER TABLE\s+"?public"?\."?([^"\s]+)"?\s+(ENABLE|FORCE) ROW LEVEL SECURITY/i);
    if (match) {
      const table = identifier(match[1]); const mode = match[2].toLowerCase();
      rlsPolicies.push(statementItem(`public.rls.${table}.${mode}`, statement, { schema: "public", objectType: "rls-state", tableName: table, mode }));
      continue;
    }
    if (/^(?:GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)\b/i.test(statement.trim())) {
      grants.push(statementItem(`public.grant.${sha256(normalizedSql(statement)).slice(0, 24)}`, statement, { schema: "public", objectType: "grant" }));
    }
  }

  for (const statement of splitSqlStatements(extensionSchemaSource)) {
    const match = matchObject(statement, /^CREATE EXTENSION(?: IF NOT EXISTS)?\s+"?([^"\s]+)"?(?:\s+WITH\s+SCHEMA\s+"?([^"\s;]+)"?)?/i);
    if (!match) continue;
    const name = identifier(match[1]);
    extensions.push(statementItem(`extension.${name}`, statement, { objectType: "extension", name, schema: identifier(match[2]) }));
  }

  const sort = (items) => items.sort((left, right) => left.stableIdentifier.localeCompare(right.stableIdentifier));
  return {
    tablesColumns: sort(tablesColumns), constraintsIndexes: sort(constraintsIndexes),
    functions: sort(functions), triggers: sort(triggers), rlsPolicies: sort(rlsPolicies),
    grantsDefaultPrivileges: sort(grants), extensions: sort(extensions),
  };
}

export function extractStoragePolicies(storageSchemaSource) {
  const items = [];
  for (const statement of splitSqlStatements(storageSchemaSource)) {
    let match = matchObject(statement, /^CREATE POLICY\s+"?([^"\r\n]+?)"?\s+ON\s+"?storage"?\."?([^"\s]+)"?/i);
    if (match) {
      const name = identifier(match[1]); const table = identifier(match[2]);
      items.push(statementItem(`storage.policy.${table}.${name}`, statement, { schema: "storage", objectType: "policy", tableName: table, name }));
      continue;
    }
    match = matchObject(statement, /^ALTER TABLE\s+"?storage"?\."?([^"\s]+)"?\s+(ENABLE|FORCE) ROW LEVEL SECURITY/i);
    if (match) {
      const table = identifier(match[1]); const mode = match[2].toLowerCase();
      items.push(statementItem(`storage.rls.${table}.${mode}`, statement, { schema: "storage", objectType: "rls-state", tableName: table, mode }));
    }
  }
  return items.sort((left, right) => left.stableIdentifier.localeCompare(right.stableIdentifier));
}

export function sanitizeStorageBuckets(value) {
  if (!Array.isArray(value)) throw new Error("Storage bucket source must be an array");
  return value.map((bucket) => {
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) throw new Error("Storage bucket entry is malformed");
    const name = String(bucket.name ?? bucket.id ?? "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new Error("Storage bucket name is missing or unsafe");
    return {
      stableIdentifier: `storage.bucket.${name}`,
      name,
      public: bucket.public === true,
      fileSizeLimit: Number.isSafeInteger(bucket.file_size_limit) ? bucket.file_size_limit : null,
      allowedMimeTypes: Array.isArray(bucket.allowed_mime_types)
        ? [...new Set(bucket.allowed_mime_types.filter((item) => typeof item === "string"))].sort()
        : null,
    };
  }).sort((left, right) => left.stableIdentifier.localeCompare(right.stableIdentifier));
}
