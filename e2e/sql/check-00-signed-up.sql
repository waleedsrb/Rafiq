-- After flow 00: Lina's account exists with the name, gender and phone she typed.
do $$
declare
  v_id uuid := (select id from auth.users where email = 'e2e-new@rafiq.test');
begin
  if v_id is null then
    raise exception 'CHECK 00: no account for e2e-new@rafiq.test';
  end if;
  if not exists (select 1 from public.profiles where id = v_id and full_name = 'Lina Nasser' and gender = 'f') then
    raise exception 'CHECK 00: Lina''s name or gender was not saved';
  end if;
  if not exists (select 1 from public.contact_phones where user_id = v_id and phone = '970599123456') then
    raise exception 'CHECK 00: Lina''s phone number was not saved';
  end if;
  raise notice 'CHECK 00 ok: Lina Nasser signed up';
end $$;
