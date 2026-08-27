-- Restore the specific raw-material row accidentally deactivated from Settings.
-- The identity checks keep this repair idempotent and prevent updating another row.
do $$
begin
  update public.raw_materials
  set is_active = true
  where id = '333fc3e5-9aa2-5f2f-bb44-905b38188c64'::uuid
    and item_fg = '112200'
    and name_part = 'CLAMPING PLATE MM3'
    and code_order_rm = '912737'
    and is_active = false;

  if not found and not exists (
    select 1
    from public.raw_materials
    where id = '333fc3e5-9aa2-5f2f-bb44-905b38188c64'::uuid
      and item_fg = '112200'
      and name_part = 'CLAMPING PLATE MM3'
      and code_order_rm = '912737'
      and is_active = true
  ) then
    raise exception 'Expected raw material 112200 row was not found; no data was changed';
  end if;
end
$$;
