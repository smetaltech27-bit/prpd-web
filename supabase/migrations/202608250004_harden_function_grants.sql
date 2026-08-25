-- Keep SECURITY DEFINER helpers off the unauthenticated Postgres role.
-- Anonymous Auth users receive the authenticated role after signInAnonymously().

revoke all on function public.is_settings_admin() from public, anon;
grant execute on function public.is_settings_admin() to authenticated, service_role;

revoke all on function public.create_purchase_requests(
  public.pr_request_kind, jsonb, date, date, text, text
) from public, anon;
grant execute on function public.create_purchase_requests(
  public.pr_request_kind, jsonb, date, date, text, text
) to authenticated, service_role;
