-- Least-privilege API grants, RLS, and private document storage.
-- The normal UI should establish a Supabase anonymous Auth session. The unauthenticated
-- Postgres `anon` role receives no application data access in this design.

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.raw_materials enable row level security;
alter table public.factory_supplies enable row level security;
alter table public.document_assets enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_lines enable row level security;
alter table public.audit_logs enable row level security;

alter table public.profiles force row level security;
alter table public.vendors force row level security;
alter table public.raw_materials force row level security;
alter table public.factory_supplies force row level security;
alter table public.document_assets force row level security;
alter table public.purchase_requests force row level security;
alter table public.purchase_request_lines force row level security;
alter table public.audit_logs force row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.vendors from anon, authenticated;
revoke all on table public.raw_materials from anon, authenticated;
revoke all on table public.factory_supplies from anon, authenticated;
revoke all on table public.document_assets from anon, authenticated;
revoke all on table public.purchase_requests from anon, authenticated;
revoke all on table public.purchase_request_lines from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert on table public.vendors to authenticated;
grant update (name, legacy_name, contact_name, phone, email, address, tax_id, is_active)
  on public.vendors to authenticated;
grant select, insert on table public.raw_materials to authenticated;
grant update (
  name_part, spec, dwg_no, item_fg, code_order_rm, vendor_id, material_type,
  dimension, unit_price, usage_qty, comment, is_active
) on public.raw_materials to authenticated;
grant select, insert on table public.factory_supplies to authenticated;
grant update (
  name_part, spec, dwg_no, item_fg, code_order_rm, vendor_id, supply_type,
  dimension, unit_price, usage_qty, comment, is_active
) on public.factory_supplies to authenticated;
grant select, insert on table public.document_assets to authenticated;
grant update (is_active) on table public.document_assets to authenticated;
grant select on table public.purchase_requests to authenticated;
grant select on table public.purchase_request_lines to authenticated;
grant select on table public.audit_logs to authenticated;

create policy profiles_select_self_or_admin
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_settings_admin());

create policy vendors_select_active_or_admin
  on public.vendors for select to authenticated
  using (is_active or public.is_settings_admin());
create policy vendors_admin_insert
  on public.vendors for insert to authenticated
  with check (public.is_settings_admin());
create policy vendors_admin_update
  on public.vendors for update to authenticated
  using (public.is_settings_admin())
  with check (public.is_settings_admin());

create policy raw_materials_select_active_or_admin
  on public.raw_materials for select to authenticated
  using (is_active or public.is_settings_admin());
create policy raw_materials_admin_insert
  on public.raw_materials for insert to authenticated
  with check (public.is_settings_admin());
create policy raw_materials_admin_update
  on public.raw_materials for update to authenticated
  using (public.is_settings_admin())
  with check (public.is_settings_admin());

create policy factory_supplies_select_active_or_admin
  on public.factory_supplies for select to authenticated
  using (is_active or public.is_settings_admin());
create policy factory_supplies_admin_insert
  on public.factory_supplies for insert to authenticated
  with check (public.is_settings_admin());
create policy factory_supplies_admin_update
  on public.factory_supplies for update to authenticated
  using (public.is_settings_admin())
  with check (public.is_settings_admin());

create policy document_assets_select_active_or_admin
  on public.document_assets for select to authenticated
  using (is_active or public.is_settings_admin());
create policy document_assets_admin_insert
  on public.document_assets for insert to authenticated
  with check (public.is_settings_admin());
create policy document_assets_admin_update
  on public.document_assets for update to authenticated
  using (public.is_settings_admin())
  with check (public.is_settings_admin());

create policy purchase_requests_authenticated_read
  on public.purchase_requests for select to authenticated
  using (true);

create policy purchase_request_lines_authenticated_read
  on public.purchase_request_lines for select to authenticated
  using (true);

create policy audit_logs_admin_read
  on public.audit_logs for select to authenticated
  using (public.is_settings_admin());

-- Private buckets. Versioned objects are immutable to the browser: admins may insert
-- a new path, but there is deliberately no UPDATE or DELETE storage policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'drawing',
    'drawing',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'inprocess-check-sheet',
    'inprocess-check-sheet',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  ),
  (
    'qc-check-sheet',
    'qc-check-sheet',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy prpd_document_objects_read
  on storage.objects for select to authenticated
  using (
    bucket_id in ('drawing', 'inprocess-check-sheet', 'qc-check-sheet')
    and (
      public.is_settings_admin()
      or exists (
        select 1
        from public.document_assets da
        where da.storage_bucket = storage.objects.bucket_id
          and da.storage_path = storage.objects.name
          and da.is_active
      )
    )
  );

create policy prpd_document_objects_admin_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('drawing', 'inprocess-check-sheet', 'qc-check-sheet')
    and public.is_settings_admin()
  );

comment on policy prpd_document_objects_admin_insert on storage.objects is
  'Upload each revision to a new immutable path, then insert document_assets metadata.';
