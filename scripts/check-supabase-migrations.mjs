#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(scriptDirectory, '../supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const expectedOrder = [
  '202608250001_core_schema.sql',
  '202608250002_functions_and_audit.sql',
  '202608250003_rls_and_storage.sql',
  '202608250004_harden_function_grants.sql',
  '202608260001_cloudflare_r2_documents.sql',
  '202608260002_restore_legacy_pr_flows.sql',
  '202608270001_print_confirmation_workflow.sql',
  '202608270002_reuse_reserved_pr_numbers.sql',
  '202608270003_restore_raw_material_112200.sql',
  '202608270004_production_item_master.sql',
];
const errors = [];

if (JSON.stringify(migrationFiles) !== JSON.stringify(expectedOrder)) {
  errors.push(`Unexpected migration set/order: ${migrationFiles.join(', ')}`);
}

const sqlByFile = new Map();
for (const filename of migrationFiles) {
  const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
  sqlByFile.set(filename, sql);
  if ((sql.match(/\$\$/g) ?? []).length % 2 !== 0) errors.push(`${filename} has unbalanced $$ blocks`);
  if (/\b(drop\s+table|truncate\s+table)\s+public\./i.test(sql)) {
    errors.push(`${filename} contains a destructive public table operation`);
  }
  if (/grant\s+.+\s+to\s+anon\b/i.test(sql)) errors.push(`${filename} grants application access to anon`);
}

const allSql = [...sqlByFile.values()].join('\n');
const exposedTables = [
  'profiles',
  'vendors',
  'raw_materials',
  'production_items',
  'factory_supplies',
  'document_assets',
  'purchase_requests',
  'purchase_request_lines',
  'audit_logs',
];

for (const table of exposedTables) {
  const rls = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  const forced = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`, 'i');
  if (!rls.test(allSql)) errors.push(`RLS is not enabled on public.${table}`);
  if (!forced.test(allSql)) errors.push(`RLS is not forced on public.${table}`);
}

for (const required of [
  "'drawing'",
  "'inprocess-check-sheet'",
  "'qc-check-sheet'",
  'public.is_settings_admin()',
  'public.create_purchase_requests(',
  'private.next_pr_number(',
  'PR-',
  "'prpd-documents'",
  'public.search_document_assets(',
  'public.search_production_items(',
  'public.create_production_item_with_documents(',
  'public.search_pr_history(',
]) {
  if (!allSql.includes(required)) errors.push(`Missing required migration token: ${required}`);
}

if (/create\s+policy[\s\S]{0,180}\bfor\s+delete\b/i.test(allSql)) {
  errors.push('An application DELETE policy exists; PRPD uses soft deactivation/versioning');
}

if (errors.length) {
  console.error(`Migration static checks failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Migration static checks passed for ${migrationFiles.length} files.`);
  console.log('Note: static checks do not replace applying migrations to a disposable local/staging Postgres.');
}
