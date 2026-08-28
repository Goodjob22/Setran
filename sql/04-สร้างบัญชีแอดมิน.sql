-- ============================================================
--  04 — สร้างบัญชีผู้ดูแลระบบคนแรก
--  Operations Transport เคลียร์เคลม 48 ชั่วโมง
-- ------------------------------------------------------------
--  วางไฟล์นี้ใน  Supabase › SQL Editor  แล้วกด Run
--  วางซ้ำได้ไม่พัง (ถ้ามีบัญชีนี้แล้ว จะแค่ตั้งรหัสผ่านใหม่ให้)
--
--  *** อยากเปลี่ยนอีเมลหรือรหัสผ่าน แก้สองบรรทัดใต้คำว่า v_email / v_password ***
--  *** รันเสร็จแล้ว อย่าเก็บไฟล์นี้ไว้ในที่ที่คนอื่นเปิดได้ เพราะมีรหัสผ่านอยู่ ***
-- ============================================================

do $$
declare
  ---------------------------------------------------------------
  v_email    text := 'you@company.com';
  v_password text := 'CHANGE_ME_PASSWORD';
  v_display  text := 'ผู้ดูแลระบบ';        -- ชื่อที่จะขึ้นมุมขวาบนของหน้าจอ
  v_bu       text := null;             -- null = เห็นทุก BU (แอดมินควรเป็นแบบนี้)
  ---------------------------------------------------------------
  v_id  uuid;
  v_new boolean := false;
begin
  -- ให้หา crypt() เจอ ไม่ว่า pgcrypto จะติดตั้งไว้ที่ schema ไหน
  perform set_config('search_path', 'public, extensions, auth', true);

  select id into v_id from auth.users where lower(email) = lower(v_email);

  if v_id is null then
    v_id  := gen_random_uuid();
    v_new := true;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      lower(v_email), crypt(v_password, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display', v_display),
      now(), now(),
      '', '', '', '', ''
    );

    -- แถวนี้ทำให้ล็อกอินด้วยอีเมล+รหัสผ่านได้ (GoTrue รุ่นใหม่ต้องมี)
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', lower(v_email), 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider, provider_id) do nothing;

  else
    -- มีบัญชีนี้อยู่แล้ว → ตั้งรหัสผ่านใหม่ให้ และยืนยันอีเมลให้เรียบร้อย
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_id;
  end if;

  -- โปรไฟล์ฝั่งระบบเรา — ยกให้เป็นแอดมินและเปิดใช้งานทันที
  insert into public.profiles (id, email, display, role, bu, active)
  values (v_id, lower(v_email), v_display, 'admin', v_bu, true)
  on conflict (id) do update
     set role    = 'admin',
         active  = true,
         display = coalesce(nullif(excluded.display,''), public.profiles.display),
         bu      = excluded.bu;

  raise notice '% : % (admin, เปิดใช้งานแล้ว)',
    case when v_new then 'สร้างบัญชีใหม่' else 'ตั้งรหัสผ่านใหม่ให้บัญชีเดิม' end, v_email;
end $$;

-- ตรวจผล
select p.email, p.display, p.role, p.bu, p.active,
       (u.email_confirmed_at is not null) as ยืนยันอีเมลแล้ว
  from public.profiles p join auth.users u on u.id = p.id
 order by p.created_at;
