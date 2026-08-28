-- Allow Settings administrators to remove complete submitted PR documents from history.
-- The shared PR sequence is deliberately untouched so future numbers remain monotonic.

create or replace function public.delete_purchase_request_history(p_pr_ids uuid[])
returns table (deleted_requests integer, deleted_lines integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pr_ids uuid[];
  v_deleted_requests integer := 0;
  v_deleted_lines integer := 0;
begin
  if auth.uid() is null or not public.is_settings_admin() then
    raise exception using errcode = '42501', message = 'Settings administrator access is required';
  end if;

  if coalesce(cardinality(p_pr_ids), 0) = 0 then
    return query select 0, 0;
    return;
  end if;

  if cardinality(p_pr_ids) > 5000 then
    raise exception using errcode = '54000', message = 'At most 5000 PR records may be deleted at once';
  end if;

  select array_agg(distinct request.id)
    into v_pr_ids
  from public.purchase_requests request
  where request.id = any(p_pr_ids)
    and request.status = 'submitted';

  if coalesce(cardinality(v_pr_ids), 0) = 0 then
    return query select 0, 0;
    return;
  end if;

  delete from public.purchase_request_lines line
  where line.purchase_request_id = any(v_pr_ids);
  get diagnostics v_deleted_lines = row_count;

  delete from public.purchase_requests request
  where request.id = any(v_pr_ids);
  get diagnostics v_deleted_requests = row_count;

  return query select v_deleted_requests, v_deleted_lines;
end;
$$;

revoke all on function public.delete_purchase_request_history(uuid[]) from public, anon;
grant execute on function public.delete_purchase_request_history(uuid[]) to authenticated, service_role;

comment on function public.delete_purchase_request_history(uuid[]) is
  'Deletes complete submitted PR documents selected from history for Settings administrators without changing private.pr_sequences.';
