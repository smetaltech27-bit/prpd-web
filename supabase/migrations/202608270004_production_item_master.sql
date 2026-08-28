-- Dedicated production-item master for Work Orders and production documents.
-- Purchasing master data remains unchanged and is used as a read-only fallback.

create table public.production_items (
  id uuid primary key default gen_random_uuid(),
  item_fg text not null,
  normalized_item_fg text generated always as (upper(btrim(item_fg))) stored,
  name_part text not null,
  drawing_no text not null,
  model text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint production_items_item_fg_not_blank check (length(btrim(item_fg)) > 0),
  constraint production_items_name_part_not_blank check (length(btrim(name_part)) > 0),
  constraint production_items_drawing_no_not_blank check (length(btrim(drawing_no)) > 0),
  constraint production_items_model_not_blank check (length(btrim(model)) > 0),
  constraint production_items_normalized_item_fg_key unique (normalized_item_fg)
);

create index production_items_search_idx
  on public.production_items (normalized_item_fg, upper(btrim(name_part)), upper(btrim(drawing_no)))
  where is_active;

alter table public.production_items enable row level security;
alter table public.production_items force row level security;
revoke all on table public.production_items from public, anon, authenticated;
grant select, insert on table public.production_items to authenticated;
grant update (item_fg, name_part, drawing_no, model, is_active)
  on public.production_items to authenticated;

create policy production_items_select_active_or_admin
  on public.production_items for select to authenticated
  using (is_active or public.is_settings_admin());
create policy production_items_admin_insert
  on public.production_items for insert to authenticated
  with check (public.is_settings_admin());
create policy production_items_admin_update
  on public.production_items for update to authenticated
  using (public.is_settings_admin())
  with check (public.is_settings_admin());

create trigger production_items_touch before update on public.production_items
  for each row execute function private.touch_updated_at();
create trigger production_items_actor before insert or update on public.production_items
  for each row execute function private.stamp_actor();
create trigger production_items_audit after insert or update or delete on public.production_items
  for each row execute function private.audit_row_change();

create or replace function public.search_production_items(
  p_query text,
  p_limit integer default 50
)
returns table (
  id uuid,
  item_fg text,
  name_part text,
  drawing_no text,
  model text,
  source text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with production_matches as (
    select
      item.id,
      item.item_fg,
      item.name_part,
      item.drawing_no,
      item.model,
      'production'::text as source,
      item.updated_at
    from public.production_items item
    where item.is_active
      and length(btrim(coalesce(p_query, ''))) > 0
      and (
        item.item_fg ilike '%' || btrim(p_query) || '%'
        or item.name_part ilike '%' || btrim(p_query) || '%'
        or item.drawing_no ilike '%' || btrim(p_query) || '%'
        or item.model ilike '%' || btrim(p_query) || '%'
      )
  ),
  raw_matches as (
    select distinct on (upper(btrim(material.item_fg)))
      material.id,
      material.item_fg,
      material.name_part,
      coalesce(material.dwg_no, '') as drawing_no,
      coalesce(material.spec, '') as model,
      'raw_material'::text as source,
      material.updated_at
    from public.raw_materials material
    where material.is_active
      and length(btrim(coalesce(p_query, ''))) > 0
      and not exists (
        select 1 from public.production_items item
        where item.normalized_item_fg = upper(btrim(material.item_fg))
          and item.is_active
      )
      and (
        material.item_fg ilike '%' || btrim(p_query) || '%'
        or material.name_part ilike '%' || btrim(p_query) || '%'
        or coalesce(material.dwg_no, '') ilike '%' || btrim(p_query) || '%'
        or coalesce(material.spec, '') ilike '%' || btrim(p_query) || '%'
      )
    order by upper(btrim(material.item_fg)), material.updated_at desc, material.id
  ),
  combined as (
    select * from production_matches
    union all
    select * from raw_matches
  )
  select combined.id, combined.item_fg, combined.name_part,
    combined.drawing_no, combined.model, combined.source
  from combined
  order by
    case when upper(btrim(combined.item_fg)) = upper(btrim(p_query)) then 0 else 1 end,
    combined.item_fg,
    combined.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.search_production_items(text, integer) from public, anon;
grant execute on function public.search_production_items(text, integer) to authenticated;

create or replace function public.create_production_item_with_documents(
  p_item_fg text,
  p_name_part text,
  p_drawing_no text,
  p_model text,
  p_documents jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_document jsonb;
  v_document_count integer;
  v_document_type_count integer;
begin
  if not public.is_settings_admin() then
    raise exception using errcode = '42501', message = 'Settings admin access is required';
  end if;
  if length(btrim(coalesce(p_item_fg, ''))) = 0
    or length(btrim(coalesce(p_name_part, ''))) = 0
    or length(btrim(coalesce(p_drawing_no, ''))) = 0
    or length(btrim(coalesce(p_model, ''))) = 0 then
    raise exception using errcode = '22023', message = 'Item FG, Name Part, Drawing No. and Model are required';
  end if;
  if exists (
    select 1 from public.production_items item
    where item.normalized_item_fg = upper(btrim(p_item_fg))
  ) or exists (
    select 1 from public.raw_materials material
    where upper(btrim(material.item_fg)) = upper(btrim(p_item_fg))
      and material.is_active
  ) then
    raise exception using errcode = '23505', message = 'Item FG already exists';
  end if;

  if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) <> 3 then
    raise exception using errcode = '22023', message = 'Exactly three production documents are required';
  end if;

  select count(*), count(distinct document_type)
    into v_document_count, v_document_type_count
  from jsonb_to_recordset(coalesce(p_documents, '[]'::jsonb))
    as document(document_type text, storage_path text, original_filename text, mime_type text, size_bytes bigint)
  where document.document_type in ('drawing', 'inprocess', 'qc')
    and length(btrim(coalesce(document.storage_path, ''))) > 0
    and length(btrim(coalesce(document.original_filename, ''))) > 0
    and coalesce(document.size_bytes, 0) >= 0;

  if v_document_count <> 3 or v_document_type_count <> 3 then
    raise exception using errcode = '22023', message = 'Drawing, Inprocess and QC documents are all required';
  end if;

  insert into public.production_items (item_fg, name_part, drawing_no, model)
  values (upper(btrim(p_item_fg)), btrim(p_name_part), btrim(p_drawing_no), btrim(p_model))
  returning id into v_item_id;

  for v_document in select value from jsonb_array_elements(p_documents)
  loop
    insert into public.document_assets (
      item_fg, document_type, version, storage_provider, storage_bucket,
      storage_path, original_filename, mime_type, size_bytes, is_active
    ) values (
      upper(btrim(p_item_fg)),
      (v_document ->> 'document_type')::public.document_kind,
      null,
      'r2',
      'prpd-documents',
      v_document ->> 'storage_path',
      v_document ->> 'original_filename',
      nullif(v_document ->> 'mime_type', ''),
      (v_document ->> 'size_bytes')::bigint,
      true
    );
  end loop;

  return v_item_id;
end;
$$;

revoke all on function public.create_production_item_with_documents(text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_production_item_with_documents(text, text, text, text, jsonb)
  to authenticated;

-- Production documents can now resolve metadata from the dedicated master first,
-- while keeping all legacy Raw Material items searchable.
create or replace function public.search_document_assets(
  p_query text,
  p_document_type public.document_kind,
  p_limit integer default 30
)
returns table (
  id uuid,
  item_fg text,
  document_type public.document_kind,
  version integer,
  storage_provider text,
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  part_name text,
  drawing_no text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    asset.id,
    asset.item_fg,
    asset.document_type,
    asset.version,
    asset.storage_provider,
    asset.storage_bucket,
    asset.storage_path,
    asset.original_filename,
    asset.mime_type,
    asset.size_bytes,
    asset.checksum_sha256,
    master.name_part,
    master.drawing_no,
    asset.updated_at
  from public.document_assets asset
  join lateral (
    select candidate.name_part, candidate.drawing_no
    from (
      select item.name_part, item.drawing_no, 0 as priority, item.updated_at, item.id
      from public.production_items item
      where item.normalized_item_fg = upper(btrim(asset.item_fg)) and item.is_active
      union all
      select material.name_part, coalesce(material.dwg_no, ''), 1, material.updated_at, material.id
      from public.raw_materials material
      where upper(btrim(material.item_fg)) = upper(btrim(asset.item_fg)) and material.is_active
    ) candidate
    order by candidate.priority, candidate.updated_at desc, candidate.id
    limit 1
  ) master on true
  where asset.is_active
    and asset.document_type = p_document_type
    and length(btrim(coalesce(p_query, ''))) > 0
    and (
      asset.item_fg ilike '%' || btrim(p_query) || '%'
      or coalesce(master.name_part, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(master.drawing_no, '') ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when upper(btrim(asset.item_fg)) = upper(btrim(p_query)) then 0 else 1 end,
    asset.item_fg,
    asset.version desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.search_document_assets(text, public.document_kind, integer)
  from public, anon;
grant execute on function public.search_document_assets(text, public.document_kind, integer)
  to authenticated;
