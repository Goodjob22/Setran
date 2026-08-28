/* ============================================================
   util.js — ฟังก์ชันพื้นฐานที่ทุกหน้าใช้ร่วมกัน
   ============================================================ */
const SLA_H = 48, WARN_H = 36;

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
const pad = n => String(n).padStart(2, '0');
const D   = s => s ? new Date(s) : null;
const NOW = () => new Date();

function isoLocal(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmt(s, withYear){
  const d = D(s); if(!d || isNaN(d)) return '—';
  const y = withYear ? '/' + String(d.getFullYear() + 543).slice(2) : '';
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}${y} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function hrs(n){
  if(n == null) return '—';
  return Math.abs(n) < 48 ? n.toFixed(1) + ' ชม.' : (n/24).toFixed(1) + ' วัน';
}
const todayKey = d => {
  const x = d || NOW();
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
};
const baht  = n => (n||0).toLocaleString('th-TH', {minimumFractionDigits:2, maximumFractionDigits:2});
const baht0 = n => Math.round(n||0).toLocaleString('th-TH');
const kb = n => n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : Math.round(n/1024)+' KB';
const stamp = () => { const d = NOW(); return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`; };

/* ---------- ข้อความแจ้งเตือนมุมล่าง ---------- */
let _toastTimer;
function toast(msg){
  clearTimeout(_toastTimer);
  let t = document.querySelector('.toast');
  if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  _toastTimer = setTimeout(() => t.remove(), 3000);
}

/* ---------- ไฟล์ CSV ---------- */
function csv(rows){
  const q = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}
/* ดาวน์โหลดไฟล์จริง — ทำได้เพราะหน้านี้เป็นเว็บปกติ ไม่ใช่หน้าตัวอย่าง */
function download(filename, text, mime){
  const blob = new Blob([text], {type: mime || 'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('บันทึกไฟล์ ' + filename + ' แล้ว');
}
const offer = (filename, text) => download(filename, text);

/* ---------- แยกตารางที่วางมาจาก Excel ---------- */
function parseTable(text){
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    .map(l => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, '')));
}
