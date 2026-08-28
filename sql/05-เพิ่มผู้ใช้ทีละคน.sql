-- ============================================================
--  05 — เพิ่มผู้ใช้ทีละคน (ใช้เมื่ออยากตั้งรหัสให้เพื่อนเอง)
--  Operations Transport เคลียร์เคลม 48 ชั่วโมง
-- ------------------------------------------------------------
--  ปกติไม่ต้องใช้ไฟล์นี้ก็ได้ — ให้เพื่อนกด "สมัครใช้งาน" เองที่หน้าเว็บ
--  แล้วเราไปกดเปิดใช้ที่ ตั้งค่า › ผู้ใช้ระบบ จะปลอดภัยกว่า
--  เพราะเราจะไม่รู้รหัสผ่านของใครเลย
--
--  ใช้ไฟล์นี้เมื่อ: เพื่อนไม่ถนัดสมัครเอง หรืออยากเปิดบัญชีรอไว้ก่อน
--
--  วิธีใช้ : แก้ห้าบรรทัดใต้เส้นประ แล้วกด Run — ทีละคน
--            อยากเพิ่มอีกคน ก็แก้แล้ว Run ใหม่
--  วางซ้ำได้ไม่พัง (ถ้ามีอีเมลนี้แล้ว จะเป็นการตั้งรหัสใหม่ + อัปเดตสิทธิ์)
--
--  *** รันเสร็จแล้วอย่าเก็บไฟล์นี้ไว้ในที่ที่คนอื่นเปิดได้ เพราะมีรหัสผ่านอยู่ ***
--  *** บอกเจ้าตัวให้เข้าไปเปลี่ยนรหัสผ่านเองทันทีที่เข้าระบบครั้งแรก ***
-- ============================================================

do $$
declare
  ---------------------------------------------------------------
  v_email    text := 'somchai@allnow.co.th';   -- อีเมลที่ใช้เข้าระบบ
  v_password text := 'Claim@2026';             -- รหัสผ่าน อย่างน้อย 8 ตัว
  v_display  text := 'สมชาย ฝ่ายเคลม';           -- ชื่อที่ขึ้นมุมขวาบน
  v_role     text := 'user';                   -- 'user' หรือ 'admin'
  v_bu       text := 'CDC';                    -- 'MKM' / 'CDC' / 'RDC'
                                               -- ใส่ null = เห็นทุก BU
  v_active   boolean := true;                  -- true = ใช้งานได้ทันที
  ---------------------------------------------------------------
  v_id  uuid;
  v_new boolean := false;
begin
  perform set_config('search_path', 'public, extensions, auth', true);

  if v_role not in ('user','admin') then
    raise exception 'v_role ต้องเป็น user หรือ admin เท่านั้น (ตอนนี้ใส่ %)', v_role;
  end if;
  if length(v_password) < 8 then
    raise exception 'รหัสผ่านสั้นเกินไป ต้องอย่างน้อย 8 ตัวอักษร';
  end if;

  select id into v_id from auth.users where lower(email) = lower(v_email);

  if v_id is null then
    v_id := gen_random_uuid(); v_new := true;
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
      now(), now(), '', '', '', '', ''
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      v_id::text, v_id,
      jsonb_build_object('sub', v_id::text, 'email', lower(v_email), 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;
  else
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_id;
  end if;

  insert into public.profiles (id, email, display, role, bu, active)
  values (v_id, lower(v_email), v_display, v_role, nullif(v_bu,''), v_active)
  on conflict (id) do update
     set display = excluded.display,
         role    = excluded.role,
         bu      = excluded.bu,
         active  = excluded.active;

  raise notice '% : % · สิทธิ์ % · BU % · %',
    case when v_new then 'เพิ่มผู้ใช้ใหม่' else 'อัปเดตผู้ใช้เดิม' end,
    v_email, v_role, coalesce(v_bu,'(ทุก BU)'),
    case when v_active then 'ใช้งานได้' else 'ยังปิดอยู่' end;
end $$;

-- ดูรายชื่อผู้ใช้ทั้งหมดในระบบ
select p.email, p.display, p.role, coalesce(p.bu,'(ทุก BU)') as bu, p.active
  from public.profiles p order by p.created_at;
