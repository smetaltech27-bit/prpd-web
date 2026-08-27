-- Two-phase PR printing: reserve numbers as private drafts, then explicitly confirm
-- successful printing or discard the drafts while preserving the browser form.

create or replace function public.reserve_purchase_requests_for_print(
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
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  v_result := public.create_purchase_requests(
    p_request_kind,
    p_items,
    p_request_date,
    p_due_date,
    p_requester_name,
    p_header_comment
  );

  update public.purchase_requests r
  set status = 'draft', updated_at = clock_timestamp(), updated_by = auth.uid()
  where r.id in (
    select (entry ->> 'id')::uuid
    from jsonb_array_elements(v_result) entry
  )
    and r.created_by = auth.uid()
    and r.status = 'submitted';

  return v_result;
end;
$$;

revoke all on function public.reserve_purchase_requests_for_print(
  public.pr_request_kind, jsonb, date, date, text, text
) from public, anon;
grant execute on function public.reserve_purchase_requests_for_print(
  public.pr_request_kind, jsonb, date, date, text, text
) to authenticated, service_role;

create or replace function public.confirm_purchase_requests_printed(p_pr_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected integer;
  v_matched integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select count(distinct pr_id)::integer into v_expected
  from unnest(p_pr_ids) as ids(pr_id)
  where pr_id is not null;

  if coalesce(v_expected, 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one PR id is required';
  end if;

  select count(*)::integer into v_matched
  from public.purchase_requests r
  where r.id = any(p_pr_ids)
    and r.created_by = auth.uid()
    and r.status = 'draft';

  if v_matched <> v_expected then
    raise exception using errcode = '42501', message = 'One or more PR drafts cannot be confirmed';
  end if;

  update public.purchase_requests r
  set status = 'submitted', updated_at = clock_timestamp(), updated_by = auth.uid()
  where r.id = any(p_pr_ids)
    and r.created_by = auth.uid()
    and r.status = 'draft';

  return v_matched;
end;
$$;

revoke all on function public.confirm_purchase_requests_printed(uuid[]) from public, anon;
grant execute on function public.confirm_purchase_requests_printed(uuid[]) to authenticated, service_role;

create or replace function public.discard_purchase_request_drafts(p_pr_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected integer;
  v_matched integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select count(distinct pr_id)::integer into v_expected
  from unnest(p_pr_ids) as ids(pr_id)
  where pr_id is not null;

  if coalesce(v_expected, 0) = 0 then
    raise exception using errcode = '22023', message = 'At least one PR id is required';
  end if;

  select count(*)::integer into v_matched
  from public.purchase_requests r
  where r.id = any(p_pr_ids)
    and r.created_by = auth.uid()
    and r.status = 'draft';

  if v_matched <> v_expected then
    raise exception using errcode = '42501', message = 'One or more PR drafts cannot be discarded';
  end if;

  delete from public.purchase_request_lines l
  using public.purchase_requests r
  where l.purchase_request_id = r.id
    and r.id = any(p_pr_ids)
    and r.created_by = auth.uid()
    and r.status = 'draft';

  delete from public.purchase_requests r
  where r.id = any(p_pr_ids)
    and r.created_by = auth.uid()
    and r.status = 'draft';

  return v_matched;
end;
$$;

revoke all on function public.discard_purchase_request_drafts(uuid[]) from public, anon;
grant execute on function public.discard_purchase_request_drafts(uuid[]) to authenticated, service_role;

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
    and r.status = 'submitted'
    and (p_request_date is null or r.request_date = p_request_date)
    and (nullif(btrim(p_pr_number), '') is null or r.pr_number ilike '%' || btrim(p_pr_number) || '%')
    and (nullif(btrim(p_vendor), '') is null or r.vendor_name ilike '%' || btrim(p_vendor) || '%')
    and (nullif(btrim(p_item_fg), '') is null or coalesce(l.item_fg, '') ilike '%' || btrim(p_item_fg) || '%')
    and (nullif(btrim(p_code_order_rm), '') is null or coalesce(l.code_order_rm, '') ilike '%' || btrim(p_code_order_rm) || '%')
  order by r.request_date desc, r.pr_number desc, l.line_no
  limit 5000;
$$;

revoke all on function public.search_pr_history(public.pr_request_kind, date, text, text, text, text) from public, anon;
grant execute on function public.search_pr_history(public.pr_request_kind, date, text, text, text, text) to authenticated, service_role;

comment on function public.reserve_purchase_requests_for_print(public.pr_request_kind, jsonb, date, date, text, text) is
  'Atomically reserves PR numbers as owner-only drafts before opening the native print dialog.';
comment on function public.confirm_purchase_requests_printed(uuid[]) is
  'Promotes the current user drafts to submitted after the user confirms successful printing.';
comment on function public.discard_purchase_request_drafts(uuid[]) is
  'Deletes only the current user drafts and lines after print cancellation.';
