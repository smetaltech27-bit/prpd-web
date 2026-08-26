# PRPD: Supabase + Cloudflare R2 migration and security runbook

This runbook prepares the existing Google Sheets/XLSX data for Supabase and production
documents for one private Cloudflare R2 bucket. Remote writes and deployments are always
separate, explicit operational steps.

## Target model

- `vendors` normalizes vendor names used by both master tables.
- `raw_materials` maps the 11 legacy columns from `master material.xlsx`.
- `factory_supplies` maps the same 11 columns from `master factory supply.xlsx`.
- `document_assets` keys each Drawing, Inprocess Check Sheet, or QC Check Sheet by
  `item_fg`, type, and immutable version.
- `purchase_requests` and `purchase_request_lines` use PR terminology. Each header keeps
  a vendor-name snapshot and each line keeps an item/price snapshot, so later master edits
  cannot rewrite old documents.
- `private.pr_sequences` allocates a shared monthly number atomically. The default
  format is `PR-YYMM-NNNN`; one RPC call creates one PR per distinct vendor.
- `audit_logs` records inserts/updates/deletes executed by trusted database paths.
- Master and document records use `is_active = false` instead of application deletes.

The database does not implement the 12-row print pagination rule. The frontend must
paginate each PR independently and render Requester/Checked/Approved signatures only on
the final page. Database `line_no` preserves deterministic ordering for this purpose.

## Migration files

Apply in filename order after the target project and backup are confirmed:

1. `202608250001_core_schema.sql` creates types, tables, constraints, and indexes.
2. `202608250002_functions_and_audit.sql` creates audit/version triggers and the atomic
   `create_purchase_requests` RPC.
3. `202608250003_rls_and_storage.sql` removes broad grants, enables RLS, and creates
   three private Storage buckets and policies.
4. `202608250004_harden_function_grants.sql` explicitly removes unauthenticated
   function execution and keeps the two browser RPCs available only after Supabase Auth.
5. `202608260001_cloudflare_r2_documents.sql` adds the storage-provider field, accepts
   the private `prpd-documents` R2 bucket, and creates authenticated document search that
   returns only documents whose Item FG exists in the active Raw Material master.

Do not apply these migrations to production first. Use a fresh staging project, inspect
the SQL diff, import a sample, exercise RLS as both roles, and take a production backup
before the final migration.

## Create and verify a local export

The exporter is dependency-free Python: it reads XLSX as ZIP/XML and does not require
Excel, `openpyxl`, or an npm package.

```powershell
python scripts/export-legacy-data.py
node scripts/verify-legacy-export.mjs
```

If `python` is not on PATH in Codex Desktop, use the bundled Python path reported by
the workspace-dependencies tool. For the final asset pass, add `--with-checksums` to
calculate SHA-256 (slower because all images are read).

Generated files are written to `supabase/seed/generated/`:

- `vendors.csv`
- `raw_materials.csv`
- `factory_supplies.csv`
- `legacy_purchase_history.csv`
- `document_assets.csv`
- `storage-upload-manifest.csv`
- `legacy-export.json` and `summary.json`

That directory is ignored by Git because it contains vendor names, prices, purchasing
history, and local file paths. Never publish it to a public repository.

Baseline export observed on 2026-08-25:

| Dataset | Count |
| --- | ---: |
| Vendors after exact normalized-name merge | 41 |
| Raw Material rows | 820 |
| Factory Supply rows | 325 |
| Legacy history lines | 379 |
| Drawing files | 666 |
| Inprocess files | 476 |
| QC files | 610 |

The baseline has **154 document Item FG values not present in the Raw Material master**
(247 physical files). Import all of them into R2 and keep all matching metadata. The
document-search RPC deliberately hides an orphan until its Item FG is corrected or added
as an active Raw Material; no source asset is silently discarded.

## Legacy column mapping

| XLSX column | Raw Material | Factory Supply |
| --- | --- | --- |
| NAME PART | `name_part` | `name_part` |
| SPEC | `spec` | `spec` |
| DWG NO | `dwg_no` | `dwg_no` |
| ITEM FG | `item_fg` (required) | `item_fg` (optional) |
| CODE ORDER RM | `code_order_rm` | `code_order_rm` |
| VENDER | normalized `vendor_id` | normalized `vendor_id` |
| TYPE | `material_type` | `supply_type` |
| DIMENSION | `dimension` | `dimension` |
| UNIT PRICE | `unit_price` | `unit_price` |
| USEAGE | `usage_qty` | `usage_qty` |
| COMMENT | `comment` | `comment` |

`legacy_source_row` preserves the original row number. Stable UUIDv5 identifiers make
re-running an export deterministic, but an import must still be executed in a single
controlled maintenance window to avoid mixing two source snapshots.

Import order is `vendors`, `raw_materials`, then `factory_supplies`. Load CSVs into a
staging schema/table first, validate counts and foreign keys, and only then merge into
public tables. Do not import directly from the browser with the public anon key.

Generate the ignored transactional master-data import after verifying the export:

```powershell
python scripts/generate-import-sql.py
supabase db query --linked --file supabase/seed/generated/import-masters.sql
```

The generated SQL uses temporary staging tables, validates source counts and vendor
foreign keys, and then performs idempotent upserts. It does not delete remote rows and
must never be committed because it contains vendor and price data.

### Legacy PR/PO history

The history exporter preserves the original number in `legacy_number` and proposes a
display-normalized value such as `2606-0001` -> `PR-2606-0001`. When history is migrated:

1. group rows by original number and vendor;
2. create one `purchase_requests` header for each group;
3. store the original number in `legacy_reference`;
4. store the prefixed value in `pr_number` after checking for duplicates;
5. preserve price, quantity, due date, request date, and comment as line snapshots;
6. determine `request_kind` from the authoritative legacy source, not filename guesses.

Do not seed `private.pr_sequences` until the history reconciliation is approved. Set each
period to at least the largest imported suffix so the first live PR cannot collide. This
update and all production data imports are external database writes and require explicit
approval immediately before execution.

## Private R2 document storage mapping

Legacy filenames are Item FG values. The exporter uppercases the database key and creates
lowercase, URL-safe immutable paths in one private bucket named `prpd-documents`:

```text
drawing/tm4207a/v001/tm4207a.jpg
inprocess/tm4207a/v001/tm4207a.jpg
qc/tm4207a/v001/tm4207a.jpg
```

If duplicate source filenames normalize to the same Item FG/type, the exporter assigns
increasing versions and marks only the newest active. The application creates new paths
under `<type>/<item-fg>/revisions/<uuid>.<ext>` for later Settings uploads, so a browser
never overwrites an existing object.

Keep R2 Public Access disabled. The browser never receives an R2 API credential. It calls
the `prpd-document-gateway` Worker with its Supabase access token; the Worker validates the
JWT before GET/HEAD and additionally calls `is_settings_admin()` before PUT. Supabase
stores only metadata/version pointers. Legacy Supabase Storage remains readable only for
backward compatibility and is not used by the new importer.

Use this order for the initial migration:

1. Export with checksums and verify all generated manifests.
2. Upload every manifest object to private R2 and verify key, byte size, and checksum.
3. Apply migration 5 to Supabase.
4. Generate the ignored metadata import:

   ```powershell
   python scripts/generate-document-import-sql.py
   ```

5. Apply `supabase/seed/generated/import-documents.sql` in one controlled transaction.
6. Compare R2 object count/bytes with the manifest, then test search, preview, and print.

Never insert metadata before its R2 object is verified. If an upload succeeds but the
metadata transaction fails, keep an operations log and reconcile that orphan in a later
approved maintenance pass; do not delete automatically.

## Authentication and Settings password

There is no Settings password column, password hash, or shared secret in this schema.
Passwords are owned by Supabase Auth.

Recommended setup:

1. In Supabase Auth settings, keep public email/password signup disabled and enable
   anonymous sign-ins for the passwordless normal UI session.
2. In **Authentication > Users**, invite a dedicated named admin email. Set/reset the
   password only through Supabase Auth; never paste it into SQL, source code, `.env`,
   GitHub, or browser local storage.
3. After the user has accepted the invite, promote exactly that UUID from the trusted SQL
   editor/service context:

   ```sql
   update public.profiles p
      set role = 'settings_admin', is_active = true
     from auth.users u
    where p.id = u.id
      and lower(u.email) = lower('ADMIN_EMAIL_TO_REPLACE');
   ```

4. Confirm that exactly one row was updated and audit the profile change. Remove the SQL
   editor statement/history containing the email if organizational policy requires it.
5. The normal frontend establishes an anonymous Supabase Auth session. Opening Settings
   asks for the dedicated admin email/password and verifies `is_settings_admin()` after
   sign-in. On lock, inactivity timeout, refresh, or browser close, sign the admin out and
   create a new anonymous session.

The invite/recovery redirect is handled by a dedicated one-time setup screen. It accepts
only Supabase `invite` or `recovery` URL fragments, validates the configured admin email
and `settings_admin` role, then calls `auth.updateUser()` in the invite session. After a
successful password update it signs that session out and returns to the locked Settings
screen. Never copy the password into the Dashboard, SQL Editor, source code, or chat.

Use session-only browser storage for the admin session to satisfy the “refresh/close locks
Settings” requirement. The 15-minute inactivity lock and five-attempt UI cooldown are
frontend behavior; Supabase Auth rate limits remain the authoritative server protection.
For an internet-facing GitHub Pages app, enable CAPTCHA and review Auth rate limits.

## RLS/security test matrix

Run these checks in staging before any production import:

| Actor | Expected behavior |
| --- | --- |
| Unauthenticated `anon` database role | No master, PR, audit, metadata, or R2 gateway access |
| Anonymous Supabase Auth user (`authenticated`) | Read active masters/doc metadata, read PR history, call atomic create-PR RPC |
| Anonymous Auth user | Read private active documents through the Worker; cannot upload objects |
| `settings_admin` | Read inactive/versioned records, insert/update/deactivate masters, upload new immutable R2 versions |
| `settings_admin` | Cannot hard-delete master rows or overwrite/delete R2 objects through the browser API |
| Any non-admin | Cannot read audit logs or another profile |

Also test concurrent calls with the same month. Numbers must be unique and consecutive
within committed transactions, and each distinct vendor in one call must get one number.
A failed multi-vendor call must roll back all headers, lines, and allocated counters.

## Security caveats requiring an operational decision

- An anonymous Auth session is still obtainable by anyone who can reach a public GitHub
  Pages site. RLS protects Settings writes but does not make normal PR history secret.
  If PR/vendor/price data is confidential, require employee email/SSO for the whole app
  or place it behind a private network gateway.
- The atomic RPC intentionally permits authenticated normal users to create PRs because
  the requested normal workflow has no login. CAPTCHA, Auth rate limits, monitoring, and
  possibly an Edge Function rate-limit layer are recommended before public launch.
- The RPC accepts a request date and uses it for the monthly sequence. Validate the chosen
  product rule for backdated/future PRs before production; imports bypass the live RPC.
- R2 upload and Supabase metadata insert are two operations, not one transaction. Upload to a
  new path first; if metadata insertion fails, record and clean up the orphan only through
  an approved maintenance process.
- RLS does not constrain the Supabase `service_role`. Keep that key only in trusted server
  environments and never in GitHub Pages, React variables, logs, or migration CSVs.
- Cloudflare R2 has usage-based billing beyond its included monthly allowance. Keep the
  bucket on Standard storage, monitor stored bytes and Class A/B operations, and configure
  a billing budget alert. A budget alert warns about usage; it is not a hard spending cap.
