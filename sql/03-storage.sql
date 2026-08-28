-- ============================================================
--  ศูนย์เคลียร์เคลม 48 ชั่วโมง — ที่เก็บรูปหลักฐาน
--  ไฟล์ที่ 3 : รันหลังไฟล์ที่ 1
--  ถ้ารันแล้วขึ้น error เรื่องสิทธิ์ ให้ไปสร้าง bucket ชื่อ evidence
--  จากเมนู Storage แทน แล้วรันเฉพาะส่วนนโยบายด้านล่าง
-- ============================================================

-- ถังเก็บไฟล์ แบบไม่เปิดสาธารณะ จำกัดไฟล์ละ 5 MB เฉพาะไฟล์รูป
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ชื่อไฟล์จะเป็นรูปแบบ  <เลขเคลม>/<รหัสสุ่ม>.jpg
-- จึงเช็คสิทธิ์ด้วยการดูว่า "เห็นเคสนั้นไหม" ซึ่ง RLS ของตาราง cases จัดการให้อยู่แล้ว
drop policy if exists evidence_read   on storage.objects;
drop policy if exists evidence_upload on storage.objects;
drop policy if exists evidence_change on storage.objects;
drop policy if exists evidence_remove on storage.objects;

create policy evidence_read on storage.objects for select to authenticated
using (bucket_id = 'evidence'
       and exists (select 1 from public.cases c where c.id = split_part(name, '/', 1)));

create policy evidence_upload on storage.objects for insert to authenticated
with check (bucket_id = 'evidence'
       and exists (select 1 from public.cases c where c.id = split_part(name, '/', 1)));

create policy evidence_change on storage.objects for update to authenticated
using (bucket_id = 'evidence'
       and exists (select 1 from public.cases c where c.id = split_part(name, '/', 1)));

create policy evidence_remove on storage.objects for delete to authenticated
using (bucket_id = 'evidence'
       and exists (select 1 from public.cases c where c.id = split_part(name, '/', 1)));
