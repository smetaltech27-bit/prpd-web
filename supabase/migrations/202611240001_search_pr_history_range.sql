-- Search submitted PR lines by an inclusive, optionally open-ended request-date range.
-- Keep search_pr_history available for older deployed clients.

create or replace function public.search_pr_history_range(
  p_request_kind public.pr_request_kind,
  p_date_from date default null,
  p_date_to date default null,
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
    and (p_date_from is null or r.request_date >= p_date_from)
    and (p_date_to is null or r.request_date <= p_date_to)
    and (nullif(btrim(p_pr_number), '') is null or r.pr_number ilike '%' || btrim(p_pr_number) || '%')
    and (nullif(btrim(p_vendor), '') is null or r.vendor_name ilike '%' || btrim(p_vendor) || '%')
    and (nullif(btrim(p_item_fg), '') is null or coalesce(l.item_fg, '') ilike '%' || btrim(p_item_fg) || '%')
    and (nullif(btrim(p_code_order_rm), '') is null or coalesce(l.code_order_rm, '') ilike '%' || btrim(p_code_order_rm) || '%')
  order by r.request_date desc, r.pr_number desc, l.line_no
  limit 5000;
$$;

revoke all on function public.search_pr_history_range(public.pr_request_kind, date, date, text, text, text, text) from public, anon;
grant execute on function public.search_pr_history_range(public.pr_request_kind, date, date, text, text, text, text) to authenticated, service_role;
