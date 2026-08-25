-- Trusted helper functions, audit triggers, document versioning, and atomic PR creation.

create or replace function public.is_settings_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'settings_admin'
      and p.is_active
  );
$$;

revoke all on function public.is_settings_admin() from public;
grant execute on function public.is_settings_admin() to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Anonymous Auth users need application access but no durable authorization profile.
  -- Named users (including Settings admins) receive a default non-admin profile.
  if new.email is not null then
    insert into public.profiles (id, role, display_name)
    values (
      new.id,
      'app_user',
      nullif(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.created_at := now();
    else
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_entity_id := v_new ->> 'id';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  else
    v_old := to_jsonb(old);
    v_entity_id := v_old ->> 'id';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data
  ) values (
    auth.uid(),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    v_entity_id,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.prepare_document_asset_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize revisions for the same Item FG and document kind.
  perform pg_advisory_xact_lock(
    hashtextextended(upper(btrim(new.item_fg)) || ':' || new.document_type::text, 0)
  );

  if tg_op = 'INSERT' and new.version is null then
    select coalesce(max(da.version), 0) + 1
      into new.version
    from public.document_assets da
    where upper(btrim(da.item_fg)) = upper(btrim(new.item_fg))
      and da.document_type = new.document_type;
  end if;

  if new.is_active then
    update public.document_assets da
       set is_active = false,
           updated_at = now(),
           updated_by = coalesce(auth.uid(), new.updated_by)
     where upper(btrim(da.item_fg)) = upper(btrim(new.item_fg))
       and da.document_type = new.document_type
       and da.is_active
       and da.id <> new.id;
  end if;

  return new;
end;
$$;

create trigger document_assets_prepare_version
  before insert or update of is_active, item_fg, document_type
  on public.document_assets
  for each row execute function private.prepare_document_asset_version();

create or replace function private.next_pr_number(p_request_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period text := to_char(p_request_date, 'YYMM');
  v_next integer;
begin
  insert into private.pr_sequences as sequence_row (period_key, last_value)
  values (v_period, 1)
  on conflict (period_key) do update
    set last_value = sequence_row.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  if v_next > 9999 then
    raise exception using
      errcode = '22003',
      message = format('PR sequence exhausted for period %s', v_period);
  end if;

  return 'PR-' || v_period || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function private.next_pr_number(date) from public, anon, authenticated;

create or replace function public.create_purchase_requests(
  p_request_kind public.pr_request_kind,
  p_items jsonb,
  p_request_date date default null,
  p_due_date date default null,
  p_requester_name text default null,
  p_header_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item jsonb;
  v_ordinal bigint;
  v_source_id uuid;
  v_quantity numeric(14,4);
  v_fg_qty numeric(14,4);
  v_unit_price numeric(14,2);
  v_item_due_date date;
  v_raw public.raw_materials%rowtype;
  v_supply public.factory_supplies%rowtype;
  v_vendor_id uuid;
  v_vendor_name text;
  v_pr_id uuid;
  v_pr_number text;
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  p_request_date := coalesce(p_request_date, (clock_timestamp() at time zone 'Asia/Bangkok')::date);

  if p_due_date is not null and p_due_date < p_request_date then
    raise exception using errcode = '22007', message = 'due_date cannot be before request_date';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'items must be a non-empty JSON array';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception using errcode = '54000', message = 'A request may contain at most 500 input lines';
  end if;

  drop table if exists pg_temp.prpd_resolved_items;
  create temporary table prpd_resolved_items (
    ordinal bigint not null,
    vendor_id uuid not null,
    raw_material_id uuid,
    factory_supply_id uuid,
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
    comment text
  ) on commit drop;

  for v_item, v_ordinal in
    select value, ordinality
    from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using errcode = '22023', message = format('Item %s must be an object', v_ordinal);
    end if;

    begin
      v_source_id := nullif(btrim(v_item ->> 'source_id'), '')::uuid;
      v_quantity := nullif(btrim(v_item ->> 'quantity'), '')::numeric(14,4);
      v_fg_qty := nullif(btrim(v_item ->> 'fg_qty'), '')::numeric(14,4);
      v_unit_price := nullif(btrim(v_item ->> 'unit_price'), '')::numeric(14,2);
      v_item_due_date := nullif(btrim(v_item ->> 'due_date'), '')::date;
    exception when others then
      raise exception using errcode = '22023', message = format('Item %s contains an invalid id, number, or date', v_ordinal);
    end;

    if v_source_id is null then
      raise exception using errcode = '22023', message = format('Item %s is missing source_id', v_ordinal);
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception using errcode = '22023', message = format('Item %s quantity must be greater than zero', v_ordinal);
    end if;

    if v_fg_qty is not null and v_fg_qty <= 0 then
      raise exception using errcode = '22023', message = format('Item %s fg_qty must be greater than zero', v_ordinal);
    end if;

    if v_unit_price is not null and v_unit_price < 0 then
      raise exception using errcode = '22023', message = format('Item %s unit_price cannot be negative', v_ordinal);
    end if;

    if coalesce(v_item_due_date, p_due_date) is not null
       and coalesce(v_item_due_date, p_due_date) < p_request_date then
      raise exception using errcode = '22007', message = format('Item %s due_date cannot be before request_date', v_ordinal);
    end if;

    if p_request_kind = 'raw_material' then
      select * into v_raw
      from public.raw_materials rm
      where rm.id = v_source_id and rm.is_active;

      if not found then
        raise exception using errcode = 'P0002', message = format('Active raw material not found for item %s', v_ordinal);
      end if;

      insert into pg_temp.prpd_resolved_items (
        ordinal, vendor_id, raw_material_id, item_fg, code_order_rm, name_part,
        material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity,
        unit_price, due_date, comment
      ) values (
        v_ordinal, v_raw.vendor_id, v_raw.id, v_raw.item_fg, v_raw.code_order_rm,
        v_raw.name_part, v_raw.material_type, v_raw.spec, v_raw.dwg_no, v_raw.dimension,
        v_fg_qty, v_quantity, coalesce(v_unit_price, v_raw.unit_price),
        coalesce(v_item_due_date, p_due_date),
        coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_raw.comment)
      );
    else
      select * into v_supply
      from public.factory_supplies fs
      where fs.id = v_source_id and fs.is_active;

      if not found then
        raise exception using errcode = 'P0002', message = format('Active factory supply not found for item %s', v_ordinal);
      end if;

      insert into pg_temp.prpd_resolved_items (
        ordinal, vendor_id, factory_supply_id, item_fg, code_order_rm, name_part,
        material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity,
        unit_price, due_date, comment
      ) values (
        v_ordinal, v_supply.vendor_id, v_supply.id, v_supply.item_fg,
        v_supply.code_order_rm, v_supply.name_part, v_supply.supply_type,
        v_supply.spec, v_supply.dwg_no, v_supply.dimension, v_fg_qty, v_quantity,
        coalesce(v_unit_price, v_supply.unit_price), coalesce(v_item_due_date, p_due_date),
        coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_supply.comment)
      );
    end if;
  end loop;

  for v_vendor_id in
    select distinct ri.vendor_id
    from pg_temp.prpd_resolved_items ri
    order by ri.vendor_id
  loop
    v_pr_number := private.next_pr_number(p_request_date);

    select v.name into v_vendor_name
    from public.vendors v
    where v.id = v_vendor_id and v.is_active;

    if not found then
      raise exception using errcode = 'P0002', message = 'An active vendor for the PR was not found';
    end if;

    insert into public.purchase_requests (
      pr_number,
      request_kind,
      vendor_id,
      vendor_name,
      request_date,
      due_date,
      requester_name,
      header_comment,
      status,
      created_by,
      updated_by
    ) values (
      v_pr_number,
      p_request_kind,
      v_vendor_id,
      v_vendor_name,
      p_request_date,
      p_due_date,
      nullif(btrim(p_requester_name), ''),
      nullif(btrim(p_header_comment), ''),
      'submitted',
      auth.uid(),
      auth.uid()
    ) returning id into v_pr_id;

    insert into public.purchase_request_lines (
      purchase_request_id,
      line_no,
      raw_material_id,
      factory_supply_id,
      item_fg,
      code_order_rm,
      name_part,
      material_or_supply_type,
      spec,
      dwg_no,
      dimension,
      fg_qty,
      quantity,
      unit_price,
      due_date,
      comment
    )
    select
      v_pr_id,
      row_number() over (order by ri.ordinal),
      ri.raw_material_id,
      ri.factory_supply_id,
      ri.item_fg,
      ri.code_order_rm,
      ri.name_part,
      ri.material_or_supply_type,
      ri.spec,
      ri.dwg_no,
      ri.dimension,
      ri.fg_qty,
      ri.quantity,
      ri.unit_price,
      ri.due_date,
      ri.comment
    from pg_temp.prpd_resolved_items ri
    where ri.vendor_id = v_vendor_id
    order by ri.ordinal;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id', v_pr_id,
        'pr_number', v_pr_number,
        'vendor_id', v_vendor_id,
        'line_count', (
          select count(*) from pg_temp.prpd_resolved_items ri where ri.vendor_id = v_vendor_id
        )
      )
    );
  end loop;

  return v_result;
end;
$$;

revoke all on function public.create_purchase_requests(
  public.pr_request_kind, jsonb, date, date, text, text
) from public, anon;
grant execute on function public.create_purchase_requests(
  public.pr_request_kind, jsonb, date, date, text, text
) to authenticated;

-- Keep timestamps and actor fields trustworthy.
create trigger vendors_touch before update on public.vendors
  for each row execute function private.touch_updated_at();
create trigger raw_materials_touch before update on public.raw_materials
  for each row execute function private.touch_updated_at();
create trigger factory_supplies_touch before update on public.factory_supplies
  for each row execute function private.touch_updated_at();
create trigger document_assets_touch before update on public.document_assets
  for each row execute function private.touch_updated_at();
create trigger purchase_requests_touch before update on public.purchase_requests
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create trigger vendors_actor before insert or update on public.vendors
  for each row execute function private.stamp_actor();
create trigger raw_materials_actor before insert or update on public.raw_materials
  for each row execute function private.stamp_actor();
create trigger factory_supplies_actor before insert or update on public.factory_supplies
  for each row execute function private.stamp_actor();
create trigger document_assets_actor before insert or update on public.document_assets
  for each row execute function private.stamp_actor();
create trigger purchase_requests_actor before insert or update on public.purchase_requests
  for each row execute function private.stamp_actor();

-- Audit mutable business records. No application role gets DELETE access later.
create trigger profiles_audit after update or delete on public.profiles
  for each row execute function private.audit_row_change();
create trigger vendors_audit after insert or update or delete on public.vendors
  for each row execute function private.audit_row_change();
create trigger raw_materials_audit after insert or update or delete on public.raw_materials
  for each row execute function private.audit_row_change();
create trigger factory_supplies_audit after insert or update or delete on public.factory_supplies
  for each row execute function private.audit_row_change();
create trigger document_assets_audit after insert or update or delete on public.document_assets
  for each row execute function private.audit_row_change();
create trigger purchase_requests_audit after insert or update or delete on public.purchase_requests
  for each row execute function private.audit_row_change();
create trigger purchase_request_lines_audit after insert or update or delete on public.purchase_request_lines
  for each row execute function private.audit_row_change();
