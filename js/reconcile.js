/* ============================================================
   reconcile.js — นำเข้าไฟล์สรุป Period (16–15) มาเทียบกับที่คีย์รายวัน
   ------------------------------------------------------------
   ทำไมต้องมี: เคสถูกคีย์เข้าระบบทุกวันอยู่แล้วที่หน้า "คีย์งานเข้า"
   แต่ขนส่งส่งไฟล์สรุปมาอีกทีเป็นรอบ ไฟล์นี้ใช้ไล่เทียบว่าตรงกันไหม
   เลขเคลมที่มีอยู่แล้วในระบบจะถูกข้ามอัตโนมัติ ไม่นำเข้าซ้ำ

   พีเรียด = วันที่ 16 ของเดือนหนึ่ง ถึงวันที่ 15 ของเดือนถัดไป (เก็บแบบไม่รวมวันที่ 16 ถัดไป)
   ใช้ตัดรอบรายงาน ไม่ใช่ตัดรอบว่าไฟล์มาถึงวันไหน — คำนวณจากวันที่รับเมลของแต่ละเคส (m.t0)
   ============================================================ */

/* ---------- คำนวณพีเรียด 16–15 (วันที่ 16 ของเดือนหนึ่ง ถึงวันที่ 15 ของเดือนถัดไป) ---------- */
function periodOf(d){
  const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate();
  const sm = day >= 16 ? mo : mo - 1;
  const start = new Date(y, sm, 16);
  const end   = new Date(y, sm + 1, 16);
  return {start, end, key:`${start.getFullYear()}-${pad(start.getMonth()+1)}`};
}
function periodFromKey(key){
  const [y, m] = key.split('-').map(Number);
  return {start:new Date(y, m-1, 16), end:new Date(y, m, 16), key};
}
function shiftPeriod(key, delta){
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function periodLabel(p){
  /* พีเรียด 16–15 ตัวช่วงเก็บแบบไม่รวมวันสิ้นสุด (exclusive) จึงหักออกหนึ่งวันตอนแสดงผล
     ให้ได้ "16/xx – 15/xx+1" ตรงกับชื่อพีเรียดจริง */
  const th = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
  return `${th(p.start)} – ${th(new Date(p.end.getTime() - 864e5))}`;
}

/* ---------- อ่านวันที่แบบยืดหยุ่น — ไฟล์จากขนส่งเขียนวันที่ไม่เหมือนกันเสมอไป ---------- */
function parseFlexibleDate(s){
  s = String(s || '').trim();
  if(!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if(m) return new Date(+m[1], +m[2]-1, +m[3], 8, 0);
  m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if(m){ let yy = +m[3]; if(yy > 2400) yy -= 543; return new Date(yy, +m[2]-1, +m[1], 8, 0); }
  return null;
}

let RC = {periodKey: periodOf(NOW()).key};
let rcRows = null;

/* ---------- สรุปยอด Pending ของรอบที่เลือกอยู่ ---------- */
function pendingReportData(){
  const p = periodFromKey(RC.periodKey);
  const list = CACHE.filter(({m}) => m.t0 && D(m.t0) >= p.start && D(m.t0) < p.end);
  const pending = list.filter(x => x.m.status === 'OPEN');
  const closed  = list.filter(x => x.m.status === 'CLOSED');
  const sum = arr => arr.reduce((s,x) => s + (x.c.amount || 0), 0);
  return {p, list, pending, closed, pendingAmt:sum(pending), closedAmt:sum(closed), totalAmt:sum(list)};
}

function renderReconcile(){
  const R = pendingReportData();
  const pendingPct = R.list.length ? Math.round(R.pending.length / R.list.length * 100) : null;

  document.getElementById('reconcile').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>สรุปยอด Pending ราย Period (16–15)</h3>
        <span class="sp">
          <button type="button" class="sm" id="rcPrev">‹ Period ก่อนหน้า</button>
          <span class="mono" style="font-size:12.5px">${periodLabel(R.p)}</span>
          <button type="button" class="sm" id="rcNext">Period ถัดไป ›</button>
          <button type="button" class="sm" id="rcNow">Period ปัจจุบัน</button></span></div>
      <div class="pbody" style="padding:0"><div class="totrow" style="margin:0;border:0">
        <div class="tot"><div class="tk">เคสในรอบนี้</div><div class="tv">${R.list.length}</div>
          <div class="tn">${baht0(R.totalAmt)} บาท</div></div>
        <div class="tot"><div class="tk">Pending (ค้าง)</div><div class="tv bad">${R.pending.length}</div>
          <div class="tn">${baht0(R.pendingAmt)} บาท</div></div>
        <div class="tot"><div class="tk">ปิดแล้ว</div><div class="tv ok">${R.closed.length}</div>
          <div class="tn">${baht0(R.closedAmt)} บาท</div></div>
        <div class="tot"><div class="tk">สัดส่วน Pending</div>
          <div class="tv ${pendingPct != null && pendingPct > 30 ? 'bad' : ''}">${pendingPct != null ? pendingPct+'%' : '—'}</div>
          <div class="tn">ของจำนวนเคสในรอบนี้</div></div>
      </div></div>
      <div class="pbody">
        <div class="actions" style="margin:0">
          <button type="button" id="rcExport">ส่งออก CSV Period นี้</button>
          <button type="button" class="pri" id="rcReport">คัดลอกรายงานประจำสัปดาห์</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="phead"><h3>นำเข้าไฟล์สรุป Period</h3>
        <span class="sp"><button type="button" class="sm" id="rcTemplate">โหลดไฟล์ตัวอย่าง</button></span></div>
      <div class="pbody">
        <p class="hint">วางตารางจาก Excel (Ctrl+V) หรือเลือกไฟล์ CSV — ต้องมี 9 คอลัมน์เรียงตามนี้:
          <b>เลขเคลม · ขนส่ง · วันที่รับเมล · สาขา · ทะเบียนรถ · พขร. · สาเหตุ · ยอด (บาท) · หมายเหตุ</b>
          (แถวหัวตารางจะถูกข้ามให้เอง)</p>
        <p class="hint"><b>เลขเคลมที่มีอยู่แล้วในระบบจะถูกข้ามอัตโนมัติ ไม่นำเข้าซ้ำ</b> —
          ใช้จุดนี้ตรวจว่าที่คีย์รายวันไว้ครบกับไฟล์สรุปที่ขนส่งส่งมาไหม
          แถวที่นำเข้าใหม่จะสร้างเป็นเคสในระบบ ยังไม่ระบุซับ (ไปตามต่อได้ที่คิวต้องส่งวันนี้)</p>
        <textarea class="paste" id="rcPaste" placeholder="MKM-2569-08-00531&#9;DHL&#9;2026-08-05&#9;101&#9;71-4708&#9;จีรวัฒน์&#9;สินค้าส่งขาด&#9;1250.00&#9;"></textarea>
        <div class="actions" style="margin-top:10px">
          <label class="btn-file"><input type="file" id="rcFile" accept=".csv,text/csv,text/plain" hidden>
            <button type="button" class="sm" id="rcPick">เลือกไฟล์ CSV</button></label>
          <button type="button" class="pri" id="rcCheck">ตรวจข้อมูล</button>
        </div>
        <div id="rcPreview"></div>
      </div>
    </div>`;

  document.getElementById('rcPrev').onclick = () => { RC.periodKey = shiftPeriod(RC.periodKey, -1); render(); };
  document.getElementById('rcNext').onclick = () => { RC.periodKey = shiftPeriod(RC.periodKey, 1); render(); };
  document.getElementById('rcNow').onclick  = () => { RC.periodKey = periodOf(NOW()).key; render(); };
  document.getElementById('rcExport').onclick = () => exportPeriodCsv(R);
  document.getElementById('rcReport').onclick = () => copyPeriodReport(R);
  document.getElementById('rcTemplate').onclick = () => download('template-นำเข้าสรุป-period.csv',
    csv([['เลขเคลม','ขนส่ง','วันที่รับเมล','สาขา','ทะเบียนรถ','พขร.','สาเหตุ','ยอด','หมายเหตุ'],
         ['MKM-2569-08-00531','DHL','2026-08-05','101','71-4708','จีรวัฒน์','สินค้าส่งขาด','1250.00','']]));
  document.getElementById('rcPick').onclick = () => document.getElementById('rcFile').click();
  document.getElementById('rcFile').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => { document.getElementById('rcPaste').value = String(r.result).replace(/^﻿/, ''); checkReconcileImport(); };
    r.readAsText(f, 'utf-8');
  };
  document.getElementById('rcCheck').onclick = checkReconcileImport;
  if(rcRows) showReconcilePreview();
}

/* ---------- ตรวจข้อมูลก่อนนำเข้า ---------- */
function checkReconcileImport(){
  const raw = parseTable(document.getElementById('rcPaste').value);
  if(!raw.length){ toast('ยังไม่มีข้อมูลให้ตรวจ'); return; }
  const head = raw[0].join(' ').toLowerCase();
  const rows = /เลขเคลม|claim/.test(head) ? raw.slice(1) : raw;
  rcRows = parseReconcile(rows);
  showReconcilePreview();
}

function parseReconcile(rows){
  const seen = new Set();
  return rows.map((r, i) => {
    const [id, carrier, at, store, truck, driver, reason, amt, note] = r;
    const out = {n:i+1, id:(id||'').trim(), carrier:(carrier||'').trim().toUpperCase(),
      atRaw:(at||'').trim(), atIso:'', store:(store||'').trim(), truck:(truck||'').trim(),
      driver:(driver||'').trim(), reason:(reason||'').trim(),
      amt:parseFloat(amt) || 0, note:(note||'').trim(), status:'ok', msg:''};

    if(!out.id){ out.status = 'skip'; out.msg = 'ไม่มีเลขเคลม'; return out; }
    if(seen.has(out.id.toUpperCase())){ out.status = 'skip'; out.msg = 'เลขเคลมซ้ำในไฟล์ที่วางมา'; return out; }
    seen.add(out.id.toUpperCase());
    if(caseIdExists(out.id)){ out.status = 'skip'; out.msg = 'มีเคสนี้ในระบบแล้ว — ข้ามไม่นำเข้าซ้ำ'; return out; }

    if(out.carrier !== 'DHL' && out.carrier !== 'CJ'){
      out.msg = 'ไม่ระบุขนส่งชัดเจน จะตั้งเป็น DHL ให้ก่อน — แก้ทีหลังได้';
      out.carrier = 'DHL'; out.status = 'warn';
    }
    if(out.atRaw){
      const d = parseFlexibleDate(out.atRaw);
      if(d) out.atIso = isoLocal(d);
      else { out.status = 'warn'; out.msg = (out.msg?out.msg+' · ':'')+'อ่านวันที่รับเมลไม่ออก จะใช้เวลานำเข้าแทน'; }
    } else { out.status = 'warn'; out.msg = (out.msg?out.msg+' · ':'')+'ไม่มีวันที่รับเมล จะใช้เวลานำเข้าแทน'; }
    return out;
  });
}

function showReconcilePreview(){
  const good = rcRows.filter(r => r.status !== 'skip');
  const skip = rcRows.filter(r => r.status === 'skip');
  document.getElementById('rcPreview').innerHTML = `
    <div class="tw" style="margin-top:14px"><table style="min-width:900px"><thead><tr>
      <th>#</th><th>เลขเคลม</th><th>ขนส่ง</th><th>วันที่รับเมล</th><th>สาขา</th><th>ทะเบียน</th>
      <th style="text-align:right">ยอด</th><th>ผลตรวจ</th></tr></thead><tbody>
      ${rcRows.slice(0, 300).map(r => `<tr style="cursor:default">
        <td class="mono">${r.n}</td>
        <td class="mono">${esc(r.id || '—')}</td>
        <td>${esc(r.carrier || '—')}</td>
        <td class="mono" style="font-size:12px">${r.atIso ? fmt(r.atIso, true) : (r.atRaw ? esc(r.atRaw) : '—')}</td>
        <td>${esc(r.store || '—')}</td>
        <td class="mono">${esc(r.truck || '—')}</td>
        <td class="r">${r.amt ? r.amt.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td>${r.status === 'skip' ? `<span class="chip bad">ข้าม — ${esc(r.msg)}</span>`
            : r.status === 'warn' ? `<span class="chip warn">${esc(r.msg)}</span>`
            : '<span class="chip ok">พร้อมนำเข้า</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    ${rcRows.length > 300 ? `<p class="hint">แสดง 300 บรรทัดแรกจาก ${rcRows.length} — นำเข้าครบทุกบรรทัด</p>` : ''}
    <div class="actions" style="margin-top:12px">
      <button type="button" class="pri" id="rcApply" ${good.length?'':'disabled'}>นำเข้า ${good.length} เคส</button>
      <span class="hint" style="margin:0">${skip.length} แถวถูกข้าม (ซ้ำ / ไม่มีเลขเคลม)</span></div>`;
  const ap = document.getElementById('rcApply');
  if(ap) ap.onclick = applyReconcileImport;
}

async function applyReconcileImport(){
  const good = rcRows.filter(r => r.status !== 'skip');
  let added = 0, failed = 0;
  for(const r of good){
    const at = r.atIso || isoLocal(NOW());
    const rec = {id:r.id, carrier:r.carrier, store:r.store, store_name:'', dept:'',
      driver:r.driver, truck:r.truck, reason:r.reason, ref_date:at.slice(0,10),
      amount:Math.round(r.amt*100)/100, items:[],
      events:[{type:'RECEIVE', at, vendor:null, text:r.note || 'นำเข้าจากไฟล์สรุป Period', src:'reconcile'}],
      source:'reconcile'};
    try{
      const j = await API.addCase(rec);
      S.cases[r.id] = j.case;
      added++;
    }catch(e){ failed++; }
  }
  const st = await API.state();
  S.events = st.events;
  rcRows = null;
  render();
  toast(`นำเข้าแล้ว ${added} เคส${failed ? ` · ${failed} รายการนำเข้าไม่สำเร็จ` : ''}`);
}

/* ---------- ส่งออก / คัดลอกรายงาน Pending ราย Period ---------- */
function exportPeriodCsv(R){
  const rows = [['เลขเคลม','ขนส่ง','BU','สาขา','ทะเบียน','ยอด (บาท)','รับเมล','สถานะ']];
  for(const {c, m, bu} of R.list) rows.push([c.id, c.carrier, bu, c.store_name || c.store, c.truck,
    (c.amount||0).toFixed(2), m.t0 ? fmt(m.t0, true) : '', m.status === 'CLOSED' ? 'ปิดแล้ว' : 'ค้าง (Pending)']);
  download(`claim-period-${RC.periodKey}-${stamp()}.csv`, csv(rows));
}

function copyPeriodReport(R){
  const dt = periodLabel(R.p);
  const pct = R.list.length ? Math.round(R.pending.length / R.list.length * 100) : 0;
  const text =
`รายงานสรุปยอดเคลมค้าง (Pending) ประจำรอบ ${dt}
ออกรายงานเมื่อ ${fmt(isoLocal(NOW()), true)}

เคสในรอบนี้ทั้งหมด ${R.list.length} เคส รวม ${baht(R.totalAmt)} บาท
- ปิดแล้ว ${R.closed.length} เคส ${baht(R.closedAmt)} บาท
- ยังค้าง (Pending) ${R.pending.length} เคส ${baht(R.pendingAmt)} บาท (${pct}% ของเคสในรอบนี้)`;
  navigator.clipboard.writeText(text)
    .then(() => toast('คัดลอกรายงานแล้ว — วางในอีเมลหรือเอกสารได้เลย'))
    .catch(() => toast('คัดลอกไม่สำเร็จ — ใช้ปุ่มส่งออก CSV แทนได้'));
}
