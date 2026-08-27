-- Keep reserved PR numbers while allowing the owner to edit and reprint the
-- draft. Only draft lines are refreshed; the PR id and number remain unchanged.

create or replace function public.update_purchase_request_drafts_for_print(
  p_request_kind public.pr_request_kind,
  p_drafts jsonb,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_draft jsonb;
  v_item jsonb;
  v_ordinal bigint;
  v_pr_id uuid;
  v_source_id uuid;
  v_quantity numeric(14,4);
  v_fg_qty numeric(14,4);
  v_unit_price numeric(14,2);
  v_item_due_date date;
  v_pr public.purchase_requests%rowtype;
  v_raw public.raw_materials%rowtype;
  v_supply public.factory_supplies%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  if jsonb_typeof(p_drafts) <> 'array' or jsonb_array_length(p_drafts) = 0 then
    raise exception using errcode = '22023', message = 'drafts must be a non-empty JSON array';
  end if;
  if jsonb_array_length(p_drafts) > 100 then
    raise exception using errcode = '54000', message = 'At most 100 PR drafts may be updated at once';
  end if;
  if (
    select count(distinct nullif(btrim(draft ->> 'id'), ''))
    from jsonb_array_elements(p_drafts) draft
  ) <> jsonb_array_length(p_drafts) then
    raise exception using errcode = '22023', message = 'Each PR draft id must be present and unique';
  end if;

  for v_draft in select value from jsonb_array_elements(p_drafts)
  loop
    begin
      v_pr_id := nullif(btrim(v_draft ->> 'id'), '')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'A PR draft contains an invalid id';
    end;

    select * into v_pr
    from public.purchase_requests r
    where r.id = v_pr_id
      and r.created_by = auth.uid()
      and r.request_kind = p_request_kind
      and r.status = 'draft'
    for update;
    if not found then
      raise exception using errcode = '42501', message = 'A reserved PR draft cannot be updated';
    end if;
    if p_due_date is not null and p_due_date < v_pr.request_date then
      raise exception using errcode = '22007', message = 'due_date cannot be before request_date';
    end if;
    if jsonb_typeof(v_draft -> 'items') <> 'array' or jsonb_array_length(v_draft -> 'items') = 0 then
      raise exception using errcode = '22023', message = format('PR %s must contain at least one item', v_pr.pr_number);
    end if;
    if jsonb_array_length(v_draft -> 'items') > 500 then
      raise exception using errcode = '54000', message = format('PR %s may contain at most 500 items', v_pr.pr_number);
    end if;

    delete from public.purchase_request_lines l where l.purchase_request_id = v_pr.id;

    for v_item, v_ordinal in
      select value, ordinality from jsonb_array_elements(v_draft -> 'items') with ordinality
    loop
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
        and coalesce(v_item_due_date, p_due_date) < v_pr.request_date then
        raise exception using errcode = '22007', message = format('Item %s due_date cannot be before request_date', v_ordinal);
      end if;

      if p_request_kind = 'raw_material' then
        select * into v_raw
        from public.raw_materials rm
        where rm.id = v_source_id and rm.vendor_id = v_pr.vendor_id and rm.is_active;
        if not found then
          raise exception using errcode = 'P0002', message = format('Active raw material for item %s does not belong to this PR vendor', v_ordinal);
        end if;
        insert into public.purchase_request_lines (
          purchase_request_id, line_no, raw_material_id, item_fg, code_order_rm, name_part,
          material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity, unit_price, due_date, comment
        ) values (
          v_pr.id, v_ordinal, v_raw.id, v_raw.item_fg, v_raw.code_order_rm,
          coalesce(nullif(btrim(v_item ->> 'name_part'), ''), v_raw.name_part), v_raw.material_type,
          case when v_item ? 'spec' then nullif(btrim(v_item ->> 'spec'), '') else v_raw.spec end,
          v_raw.dwg_no, v_raw.dimension, v_fg_qty, v_quantity, coalesce(v_unit_price, v_raw.unit_price),
          coalesce(v_item_due_date, p_due_date), coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_raw.comment)
        );
      else
        select * into v_supply
        from public.factory_supplies fs
        where fs.id = v_source_id and fs.vendor_id = v_pr.vendor_id and fs.is_active;
        if not found then
          raise exception using errcode = 'P0002', message = format('Active factory supply for item %s does not belong to this PR vendor', v_ordinal);
        end if;
        insert into public.purchase_request_lines (
          purchase_request_id, line_no, factory_supply_id, item_fg, code_order_rm, name_part,
          material_or_supply_type, spec, dwg_no, dimension, fg_qty, quantity, unit_price, due_date, comment
        ) values (
          v_pr.id, v_ordinal, v_supply.id, v_supply.item_fg, v_supply.code_order_rm,
          coalesce(nullif(btrim(v_item ->> 'name_part'), ''), v_supply.name_part), v_supply.supply_type,
          case when v_item ? 'spec' then nullif(btrim(v_item ->> 'spec'), '') else v_supply.spec end,
          v_supply.dwg_no, v_supply.dimension, v_fg_qty, v_quantity, coalesce(v_unit_price, v_supply.unit_price),
          coalesce(v_item_due_date, p_due_date), coalesce(nullif(btrim(v_item ->> 'comment'), ''), v_supply.comment)
        );
      end if;
    end loop;

    update public.purchase_requests r
    set due_date = p_due_date, updated_at = clock_timestamp(), updated_by = auth.uid()
    where r.id = v_pr.id;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', v_pr.id,
      'pr_number', v_pr.pr_number,
      'vendor_id', v_pr.vendor_id,
      'vendor_name', v_pr.vendor_name,
      'line_count', jsonb_array_length(v_draft -> 'items')
    ));
  end loop;

  return v_result;
end;
$$;

revoke all on function public.update_purchase_request_drafts_for_print(
  public.pr_request_kind, jsonb, date
) from public, anon;
grant execute on function public.update_purchase_request_drafts_for_print(
  public.pr_request_kind, jsonb, date
) to authenticated, service_role;

comment on function public.update_purchase_request_drafts_for_print(public.pr_request_kind, jsonb, date) is
  'Refreshes owner-only draft snapshots while preserving their PR ids and reserved numbers.';
