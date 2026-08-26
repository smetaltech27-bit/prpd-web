-- Restore the legacy PR workflow while retaining atomic numbering and immutable history.
-- User-editable display fields are snapshots for the PR only; master rows are not changed.

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
  v_vendor_key text;
  v_vendor_name text;
  v_default_vendor_name text;
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
    vendor_key text not null,
    vendor_id uuid not null,
    vendor_name text not null,
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
    select value, ordinality from jsonb_array_elements(p_items) with ordinality
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
    if coalesce(v_item_due_date, p_due_date) is not null and coalesce(v_item_due_date, p_due_date) < p_request_date then
      raise exception using errcode = '22007', message = format('Item %s due_date cannot be before request_date', v_ordinal);
    end if;

    if p_request_kind = 'raw_material' then
      select * into v_raw from public.raw_materials rm where rm.id = v_source_id and rm.is_active;
      if not found then
        raise exception using errcode = 'P0002', message = format('Active raw material not found for item %s', v_ordinal);
      end if;
      select name into v_default_vendor_name from public.vendors where id = v_raw.vendor_id and is_active;
      v_vendor_name := coalesce(nullif(btrim(v_item ->> 'vendor_name'), ''), v_default_vendor_name);
      if v_vendor_name is null then raise exception using errcode = '22023', message = format('Item %s vendor is required', v_ordinal); end if;
      v_vendor_key := lower(regexp_replace(btrim(v_vendor_name), '\s+', ' ', 'g'));
      insert into pg_temp.prpd_resolved_items (
        ordinal, vendor_key, vendor_id, vendor_name, raw_material_id, item_fg, code_order_rm,
        name_part, material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity, unit_price, due_date, comment
      ) values (
        v_ordinal, v_vendor_key, v_raw.vendor_id, v_vendor_name, v_raw.id, v_raw.item_fg, v_raw.code_order_rm,
        coalesce(nullif(btrim(v_item ->> 'name_part'), ''), v_raw.name_part), v_raw.material_type,
        case when v_item ? 'spec' then nullif(btrim(v_item ->> 'spec'), '') else v_raw.spec end,
        v_raw.dwg_no, v_raw.dimension, v_fg_qty, v_quantity, coalesce(v_unit_price, v_raw.unit_price),
        coalesce(v_item_due_date, p_due_date), coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_raw.comment)
      );
    else
      select * into v_supply from public.factory_supplies fs where fs.id = v_source_id and fs.is_active;
      if not found then
        raise exception using errcode = 'P0002', message = format('Active factory supply not found for item %s', v_ordinal);
      end if;
      select name into v_default_vendor_name from public.vendors where id = v_supply.vendor_id and is_active;
      v_vendor_name := coalesce(nullif(btrim(v_item ->> 'vendor_name'), ''), v_default_vendor_name);
      if v_vendor_name is null then raise exception using errcode = '22023', message = format('Item %s vendor is required', v_ordinal); end if;
      v_vendor_key := lower(regexp_replace(btrim(v_vendor_name), '\s+', ' ', 'g'));
      insert into pg_temp.prpd_resolved_items (
        ordinal, vendor_key, vendor_id, vendor_name, factory_supply_id, item_fg, code_order_rm,
        name_part, material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity, unit_price, due_date, comment
      ) values (
        v_ordinal, v_vendor_key, v_supply.vendor_id, v_vendor_name, v_supply.id, v_supply.item_fg, v_supply.code_order_rm,
        coalesce(nullif(btrim(v_item ->> 'name_part'), ''), v_supply.name_part), v_supply.supply_type,
        case when v_item ? 'spec' then nullif(btrim(v_item ->> 'spec'), '') else v_supply.spec end,
        v_supply.dwg_no, v_supply.dimension, v_fg_qty, v_quantity, coalesce(v_unit_price, v_supply.unit_price),
        coalesce(v_item_due_date, p_due_date), coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_supply.comment)
      );
    end if;
  end loop;

  for v_vendor_key in
    select ri.vendor_key from pg_temp.prpd_resolved_items ri group by ri.vendor_key order by min(ri.ordinal)
  loop
    select ri.vendor_id, ri.vendor_name into v_vendor_id, v_vendor_name
    from pg_temp.prpd_resolved_items ri where ri.vendor_key = v_vendor_key order by ri.ordinal limit 1;
    v_pr_number := private.next_pr_number(p_request_date);
    insert into public.purchase_requests (
      pr_number, request_kind, vendor_id, vendor_name, request_date, due_date,
      requester_name, header_comment, status, created_by, updated_by
    ) values (
      v_pr_number, p_request_kind, v_vendor_id, v_vendor_name, p_request_date, p_due_date,
      nullif(btrim(p_requester_name), ''), nullif(btrim(p_header_comment), ''), 'submitted', auth.uid(), auth.uid()
    ) returning id into v_pr_id;

    insert into public.purchase_request_lines (
      purchase_request_id, line_no, raw_material_id, factory_supply_id, item_fg, code_order_rm,
      name_part, material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity, unit_price, due_date, comment
    )
    select v_pr_id, row_number() over (order by ri.ordinal), ri.raw_material_id, ri.factory_supply_id,
      ri.item_fg, ri.code_order_rm, ri.name_part, ri.material_or_supply_type, ri.spec, ri.dwg_no,
      ri.dimension, ri.fg_qty, ri.quantity, ri.unit_price, ri.due_date, ri.comment
    from pg_temp.prpd_resolved_items ri where ri.vendor_key = v_vendor_key order by ri.ordinal;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_pr_id, 'pr_number', v_pr_number, 'vendor_id', v_vendor_id, 'vendor_name', v_vendor_name,
      'line_count', (select count(*) from pg_temp.prpd_resolved_items ri where ri.vendor_key = v_vendor_key)
    ));
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

create or replace function public.search_pr_history(
  p_request_kind public.pr_request_kind,
  p_request_date date default null,
  p_pr_number text default null,
  p_vendor text default null,
  p_item_fg text default null,
  p_code_order_rm text default null
)
returns table (
  line_id uuid, pr_id uuid, pr_number text, request_kind public.pr_request_kind,
  request_date date, vendor_name text, item_fg text, code_order_rm text, name_part text,
  material_or_supply_type text, spec text, fg_qty numeric, quantity numeric, unit_price numeric,
  due_date date, comment text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select l.id, r.id, r.pr_number, r.request_kind, r.request_date, r.vendor_name,
    l.item_fg, l.code_order_rm, l.name_part, l.material_or_supply_type, l.spec,
    l.fg_qty, l.quantity, l.unit_price, l.due_date, l.comment
  from public.purchase_requests r
  join public.purchase_request_lines l on l.purchase_request_id = r.id
  where r.request_kind = p_request_kind
    and (p_request_date is null or r.request_date = p_request_date)
    and (nullif(btrim(p_pr_number), '') is null or r.pr_number ilike '%' || btrim(p_pr_number) || '%')
    and (nullif(btrim(p_vendor), '') is null or r.vendor_name ilike '%' || btrim(p_vendor) || '%')
    and (nullif(btrim(p_item_fg), '') is null or coalesce(l.item_fg, '') ilike '%' || btrim(p_item_fg) || '%')
    and (nullif(btrim(p_code_order_rm), '') is null or coalesce(l.code_order_rm, '') ilike '%' || btrim(p_code_order_rm) || '%')
  order by r.request_date desc, r.pr_number desc, l.line_no
  limit 5000;
$$;

revoke all on function public.search_pr_history(public.pr_request_kind, date, text, text, text, text) from public, anon;
grant execute on function public.search_pr_history(public.pr_request_kind, date, text, text, text, text) to authenticated;

comment on function public.search_pr_history(public.pr_request_kind, date, text, text, text, text) is
  'Line-level PR history matching the legacy Raw Material and Equipment history screens.';
