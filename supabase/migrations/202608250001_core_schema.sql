-- PRPD core schema. This migration is intentionally data-free.
-- Apply with the Supabase CLI only after reviewing the target project and backups.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('app_user', 'settings_admin');
create type public.pr_request_kind as enum ('raw_material', 'factory_supply');
create type public.pr_status as enum ('draft', 'submitted', 'approved', 'cancelled');
create type public.document_kind as enum ('drawing', 'inprocess', 'qc');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'app_user',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Application authorization profile. Passwords remain exclusively in Supabase Auth.';

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))) stored,
  legacy_name text,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint vendors_name_not_blank check (length(btrim(name)) > 0),
  constraint vendors_normalized_name_key unique (normalized_name)
);

create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name_part text not null,
  spec text,
  dwg_no text,
  item_fg text not null,
  code_order_rm text,
  vendor_id uuid not null references public.vendors(id),
  material_type text,
  dimension text,
  unit_price numeric(14,2),
  usage_qty numeric(14,4),
  comment text,
  legacy_source_row integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint raw_materials_name_not_blank check (length(btrim(name_part)) > 0),
  constraint raw_materials_item_fg_not_blank check (length(btrim(item_fg)) > 0),
  constraint raw_materials_unit_price_nonnegative check (unit_price is null or unit_price >= 0),
  constraint raw_materials_usage_positive check (usage_qty is null or usage_qty > 0),
  constraint raw_materials_source_row_key unique (legacy_source_row)
);

create table public.factory_supplies (
  id uuid primary key default gen_random_uuid(),
  name_part text not null,
  spec text,
  dwg_no text,
  item_fg text,
  code_order_rm text,
  vendor_id uuid not null references public.vendors(id),
  supply_type text,
  dimension text,
  unit_price numeric(14,2),
  usage_qty numeric(14,4),
  comment text,
  legacy_source_row integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint factory_supplies_name_not_blank check (length(btrim(name_part)) > 0),
  constraint factory_supplies_item_fg_not_blank check (item_fg is null or length(btrim(item_fg)) > 0),
  constraint factory_supplies_unit_price_nonnegative check (unit_price is null or unit_price >= 0),
  constraint factory_supplies_usage_positive check (usage_qty is null or usage_qty > 0),
  constraint factory_supplies_source_row_key unique (legacy_source_row)
);

create table public.document_assets (
  id uuid primary key default gen_random_uuid(),
  item_fg text not null,
  document_type public.document_kind not null,
  version integer not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint document_assets_item_fg_not_blank check (length(btrim(item_fg)) > 0),
  constraint document_assets_version_positive check (version > 0),
  constraint document_assets_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint document_assets_storage_path_safe check (
    length(btrim(storage_path)) > 0
    and storage_path !~ '^/'
    and strpos(storage_path, chr(92)) = 0
    and storage_path !~ '(^|/)[.][.](/|$)'
  ),
  constraint document_assets_bucket_matches_kind check (
    (document_type = 'drawing' and storage_bucket = 'drawing') or
    (document_type = 'inprocess' and storage_bucket = 'inprocess-check-sheet') or
    (document_type = 'qc' and storage_bucket = 'qc-check-sheet')
  ),
  constraint document_assets_item_type_version_key unique (item_fg, document_type, version),
  constraint document_assets_storage_object_key unique (storage_bucket, storage_path)
);

create unique index document_assets_one_active_per_item_type
  on public.document_assets (upper(btrim(item_fg)), document_type)
  where is_active;

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  pr_number text not null unique,
  legacy_reference text unique,
  request_kind public.pr_request_kind not null,
  vendor_id uuid not null references public.vendors(id),
  vendor_name text not null,
  request_date date not null default current_date,
  due_date date,
  requester_name text,
  header_comment text,
  status public.pr_status not null default 'submitted',
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint purchase_requests_pr_number_format check (pr_number ~ '^PR-[0-9]{4}-[0-9]{4,}$'),
  constraint purchase_requests_vendor_name_not_blank check (length(btrim(vendor_name)) > 0),
  constraint purchase_requests_due_date_valid check (due_date is null or due_date >= request_date),
  constraint purchase_requests_cancel_state check (
    (status <> 'cancelled' and cancelled_at is null and cancelled_by is null) or
    (status = 'cancelled' and cancelled_at is not null and length(btrim(cancel_reason)) > 0)
  )
);

create table public.purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests(id),
  line_no integer not null,
  raw_material_id uuid references public.raw_materials(id),
  factory_supply_id uuid references public.factory_supplies(id),
  item_fg text,
  code_order_rm text,
  name_part text not null,
  material_or_supply_type text,
  spec text,
  dwg_no text,
  dimension text,
  fg_qty numeric(14,4),
  quantity numeric(14,4) not null,
  unit_price numeric(14,2),
  due_date date,
  comment text,
  created_at timestamptz not null default now(),
  constraint purchase_request_lines_line_positive check (line_no > 0),
  constraint purchase_request_lines_quantity_positive check (quantity > 0),
  constraint purchase_request_lines_unit_price_nonnegative check (unit_price is null or unit_price >= 0),
  constraint purchase_request_lines_one_source check (
    (raw_material_id is not null and factory_supply_id is null) or
    (raw_material_id is null and factory_supply_id is not null)
  ),
  constraint purchase_request_lines_parent_line_key unique (purchase_request_id, line_no)
);

create table private.pr_sequences (
  period_key text primary key,
  last_value integer not null,
  updated_at timestamptz not null default now(),
  constraint pr_sequences_period_key_format check (period_key ~ '^[0-9]{4}$'),
  constraint pr_sequences_last_value_positive check (last_value > 0)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_table text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create index raw_materials_item_fg_idx on public.raw_materials (upper(btrim(item_fg))) where is_active;
create index raw_materials_vendor_idx on public.raw_materials (vendor_id) where is_active;
create index raw_materials_code_idx on public.raw_materials (upper(btrim(code_order_rm))) where is_active;
create index factory_supplies_name_idx on public.factory_supplies (lower(name_part)) where is_active;
create index factory_supplies_vendor_idx on public.factory_supplies (vendor_id) where is_active;
create index document_assets_lookup_idx on public.document_assets (upper(btrim(item_fg)), document_type, version desc);
create index purchase_requests_date_idx on public.purchase_requests (request_date desc, pr_number desc);
create index purchase_requests_vendor_idx on public.purchase_requests (vendor_id, request_date desc);
create index purchase_request_lines_parent_idx on public.purchase_request_lines (purchase_request_id, line_no);
create index purchase_request_lines_item_idx on public.purchase_request_lines (upper(btrim(item_fg)));
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

comment on column public.purchase_request_lines.name_part is 'Snapshot copied from master data when the PR is created.';
comment on column public.purchase_request_lines.unit_price is 'Snapshot/approved override; later master edits never rewrite historical PR lines.';
comment on table private.pr_sequences is 'Atomic shared monthly PR counter. Not exposed through the Data API.';
