/* ============================================================
   config.js — คีย์ของ Supabase สองบรรทัด ใส่ให้เรียบร้อยแล้ว
   ------------------------------------------------------------
   โปรเจกต์ : bjjatjmqvftrzqmehxxx

   ถ้าวันหลังย้ายโปรเจกต์ Supabase ให้กลับมาแก้สองค่านี้
     url      = Settings > Data API > ช่อง Project URL
                (ใส่แค่ถึง .supabase.co ไม่ต้องมี /rest/v1/ ต่อท้าย)
     anonKey  = Settings > API Keys > ช่อง publishable key
                ขึ้นต้นด้วย sb_publishable_...
                ของเดิมที่ใช้อยู่นี้เป็นคีย์แบบเก่า (ขึ้นต้น eyJ...)
                ยังใช้ได้ปกติ แต่ Supabase จะเลิกใช้ปลายปี 2026
                ถึงตอนนั้นค่อยไปสร้าง publishable key มาเปลี่ยน

   คีย์นี้เปิดเผยได้ ไม่ใช่ความลับ เพราะกฎ RLS ในฐานข้อมูล
   เป็นตัวกันข้อมูลอีกชั้นอยู่แล้ว
   *** ห้ามเอา secret key หรือ service_role มาใส่ตรงนี้เด็ดขาด ***
   ============================================================ */
const CONFIG = {
  url:     'https://bjjatjmqvftrzqmehxxx.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqamF0am1xdmZ0cnpxbWVoeHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczODcxOTgsImV4cCI6MjEwMjk2MzE5OH0.FRo9ZyIX055-db0Ytq8ITn32mC27wLYp5kivfpy9sk4',
};
