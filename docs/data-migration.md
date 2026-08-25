# PRPD: Supabase data migration and security runbook

This runbook prepares the existing Google Sheets/XLSX and JPG data for Supabase. The
repository contains migrations and local export tooling only. Nothing in this folder
automatically links, migrates, uploads, or deploys data to a remote Supabase project.

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

The baseline has **154 document Item FG values not present in the Raw Material master**.
This is not automatically treated as corruption: some may be legacy/inactive items, or
filename/master inconsistencies. Review `orphan_asset_item_fg` in `summary.json` before
upload. Do not silently discard those assets.

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

## Document storage mapping

Legacy filenames are Item FG values. The exporter uppercases the database key and creates
lowercase, URL-safe immutable paths:

```text
drawing bucket:               tm4207a/v001/tm4207a.jpg
inprocess-check-sheet bucket: tm4207a/v001/tm4207a.jpg
qc-check-sheet bucket:        tm4207a/v001/tm4207a.jpg
```

If duplicate source filenames normalize to the same Item FG/type, the exporter assigns
increasing versions and marks only the newest active. Upload the object to its new path
first, verify size/checksum/preview, then insert the matching `document_assets` row. The
database trigger deactivates the former active revision. Browser roles cannot overwrite
or delete Storage objects, so replacing a document always creates a new immutable path.

Buckets remain private. A normal authenticated app session may read only an object that
has matching active metadata. `settings_admin` may read every revision and upload new
objects. Signed URLs should be short-lived and generated after the search succeeds.

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

Use session-only browser storage for the admin session to satisfy the “refresh/close locks
Settings” requirement. The 15-minute inactivity lock and five-attempt UI cooldown are
frontend behavior; Supabase Auth rate limits remain the authoritative server protection.
For an internet-facing GitHub Pages app, enable CAPTCHA and review Auth rate limits.

## RLS/security test matrix

Run these checks in staging before any production import:

| Actor | Expected behavior |
| --- | --- |
| Unauthenticated `anon` database role | No master, PR, audit, or Storage access |
| Anonymous Supabase Auth user (`authenticated`) | Read active masters/doc metadata, read PR history, call atomic create-PR RPC |
| Anonymous Auth user | Cannot insert/update/deactivate masters or upload objects |
| `settings_admin` | Read inactive/versioned records, insert/update/deactivate masters, upload new immutable document versions |
| `settings_admin` | Cannot hard-delete master rows or overwrite/delete Storage objects through the browser API |
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
- Storage upload and metadata insert are two operations, not one transaction. Upload to a
  new path first; if metadata insertion fails, record and clean up the orphan only through
  an approved maintenance process.
- RLS does not constrain the Supabase `service_role`. Keep that key only in trusted server
  environments and never in GitHub Pages, React variables, logs, or migration CSVs.
