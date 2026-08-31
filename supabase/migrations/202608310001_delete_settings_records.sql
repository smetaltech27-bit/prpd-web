-- Permanently delete Settings records while preserving submitted PR history.
-- Master rows referenced by PR lines are deliberately rejected; document metadata is
-- removed first and its private object locations are returned for gateway cleanup.

create or replace function public.delete_settings_master_item(p_kind text, p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if auth.uid() is null or not public.is_settings_admin() then
    raise exception using errcode = '42501', message = 'Settings administrator access is required';
  end if;

  if p_id is null or p_kind is null or p_kind not in ('raw', 'equipment') then
    raise exception using errcode = '22023', message = 'A valid master kind and id are required';
  end if;

  if p_kind = 'raw' then
    if exists (
      select 1 from public.purchase_request_lines line
      where line.raw_material_id = p_id
    ) then
      raise exception using errcode = '23503',
        message = 'Master item is referenced by PR history; deactivate it instead';
    end if;

    delete from public.raw_materials material where material.id = p_id;
  else
    if exists (
      select 1 from public.purchase_request_lines line
      where line.factory_supply_id = p_id
    ) then
      raise exception using errcode = '23503',
        message = 'Master item is referenced by PR history; deactivate it instead';
    end if;

    delete from public.factory_supplies supply where supply.id = p_id;
  end if;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_settings_master_item(text, uuid) from public, anon;
grant execute on function public.delete_settings_master_item(text, uuid) to authenticated, service_role;

comment on function public.delete_settings_master_item(text, uuid) is
  'Permanently deletes one unreferenced purchasing master row for a Settings administrator.';

create or replace function public.delete_settings_document_item(
  p_source text,
  p_item_id uuid,
  p_item_fg text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_fg text := upper(btrim(coalesce(p_item_fg, '')));
  v_documents jsonb := '[]'::jsonb;
  v_deleted_assets integer := 0;
  v_deleted_item integer := 0;
begin
  if auth.uid() is null or not public.is_settings_admin() then
    raise exception using errcode = '42501', message = 'Settings administrator access is required';
  end if;

  if p_item_id is null or length(v_item_fg) = 0 or p_source is null or p_source not in ('production', 'raw_material') then
    raise exception using errcode = '22023', message = 'A valid document item is required';
  end if;

  if p_source = 'production' and not exists (
    select 1 from public.production_items item
    where item.id = p_item_id and item.normalized_item_fg = v_item_fg
  ) then
    raise exception using errcode = 'P0002', message = 'Production item was not found';
  end if;

  if p_source = 'raw_material' and not exists (
    select 1 from public.raw_materials material
    where material.id = p_item_id and upper(btrim(material.item_fg)) = v_item_fg
  ) then
    raise exception using errcode = 'P0002', message = 'Raw material item was not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'storage_provider', asset.storage_provider,
    'storage_bucket', asset.storage_bucket,
    'storage_path', asset.storage_path
  ) order by asset.version), '[]'::jsonb)
    into v_documents
  from public.document_assets asset
  where upper(btrim(asset.item_fg)) = v_item_fg;

  delete from public.document_assets asset
  where upper(btrim(asset.item_fg)) = v_item_fg;
  get diagnostics v_deleted_assets = row_count;

  if p_source = 'production' then
    delete from public.production_items item
    where item.id = p_item_id and item.normalized_item_fg = v_item_fg;
    get diagnostics v_deleted_item = row_count;
  end if;

  return jsonb_build_object(
    'documents', v_documents,
    'deleted_item', v_deleted_item,
    'deleted_assets', v_deleted_assets
  );
end;
$$;

revoke all on function public.delete_settings_document_item(text, uuid, text) from public, anon;
grant execute on function public.delete_settings_document_item(text, uuid, text) to authenticated, service_role;

comment on function public.delete_settings_document_item(text, uuid, text) is
  'Deletes one production item when applicable plus every document revision, returning private object locations for gateway cleanup.';
