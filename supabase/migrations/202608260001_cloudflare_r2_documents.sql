-- Add Cloudflare R2 as an external private document provider while preserving
-- the existing Supabase Storage metadata and policies for backward compatibility.

alter table public.document_assets
  add column storage_provider text not null default 'supabase';

alter table public.document_assets
  add constraint document_assets_storage_provider_valid
  check (storage_provider in ('supabase', 'r2'));

alter table public.document_assets
  drop constraint document_assets_bucket_matches_kind;

alter table public.document_assets
  add constraint document_assets_bucket_matches_provider check (
    (
      storage_provider = 'supabase'
      and (
        (document_type = 'drawing' and storage_bucket = 'drawing') or
        (document_type = 'inprocess' and storage_bucket = 'inprocess-check-sheet') or
        (document_type = 'qc' and storage_bucket = 'qc-check-sheet')
      )
    )
    or (storage_provider = 'r2' and storage_bucket = 'prpd-documents')
  );

alter table public.document_assets
  drop constraint document_assets_storage_object_key;

alter table public.document_assets
  add constraint document_assets_storage_object_key
  unique (storage_provider, storage_bucket, storage_path);

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
    da.id,
    da.item_fg,
    da.document_type,
    da.version,
    da.storage_provider,
    da.storage_bucket,
    da.storage_path,
    da.original_filename,
    da.mime_type,
    da.size_bytes,
    da.checksum_sha256,
    rm.name_part,
    rm.dwg_no,
    da.updated_at
  from public.document_assets da
  join lateral (
    select material.name_part, material.dwg_no
    from public.raw_materials material
    where upper(btrim(material.item_fg)) = upper(btrim(da.item_fg))
      and material.is_active
    order by material.updated_at desc, material.id
    limit 1
  ) rm on true
  where da.is_active
    and da.document_type = p_document_type
    and length(btrim(coalesce(p_query, ''))) > 0
    and (
      da.item_fg ilike '%' || btrim(p_query) || '%'
      or coalesce(rm.name_part, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(rm.dwg_no, '') ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when upper(btrim(da.item_fg)) = upper(btrim(p_query)) then 0 else 1 end,
    da.item_fg,
    da.version desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.search_document_assets(text, public.document_kind, integer)
  from public, anon;
grant execute on function public.search_document_assets(text, public.document_kind, integer)
  to authenticated;

comment on column public.document_assets.storage_provider is
  'Private object provider: supabase for legacy Storage objects or r2 for Cloudflare R2.';
comment on function public.search_document_assets(text, public.document_kind, integer) is
  'RLS-aware active document search by Item FG, part name, or drawing number.';
