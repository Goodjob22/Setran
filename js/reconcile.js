/* ============================================================
   reconcile.js — นำเข้าไฟล์สรุป Period (16–15) มาเทียบกับที่คีย์รายวัน
   ------------------------------------------------------------
   ทำไมต้องมี: เคสถูกคีย์เข้าระบบทุกวันอยู่แล้วที่หน้า "คีย์งานเข้า"
   แต่ขนส่งส่งไฟล์สรุปมาอีกทีเป็นรอบ (ทุก 10/20/30 วัน) ไฟล์นี้ใช้ไล่เทียบว่าตรงกันไหม
   เลขเคลมที่มีอยู่แล้วในระบบจะถูกข้ามอัตโนมัติ ไม่นำเข้าซ้ำ — จับคู่ด้วยคอลัมน์
   Claim_ID (Final) ของไฟล์จริง (หรือ "เลขเคลม" ถ้าวางแบบเทมเพลตง่าย)

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

/* ---------- อ่านตัวเลขแบบยืดหยุ่น — ไฟล์บัญชีมักมีลูกน้ำคั่นหลักพันและวงเล็บแทนติดลบ ---------- */
function parseAmt(s){
  if(s == null) return 0;
  let t = String(s).trim();
  if(!t) return 0;
  let neg = false;
  if(/^\(.*\)$/.test(t)){ neg = true; t = t.slice(1, -1); }
  t = t.replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(t);
  if(isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

/* ---------- หาคอลัมน์อัตโนมัติจากหัวตาราง — รองรับทั้งเทมเพลตง่าย และไฟล์สรุปจริงจากขนส่ง
   (เช่น Claim_ID (Final), Ex_vat, Vat, Net_amt, Reason20, Deldate, Item No, Art_Desc, Note21) ---------- */
const RC_ALIASES = {
  id:      ['claim_id (final)', 'claim id (final)', 'เลขเคลม', 'claim id'],
  carrier: ['ขนส่ง', 'carrier'],
  at:      ['deldate', 'delivery date', 'วันที่รับเมล', 'วันที่'],
  store:   ['สาขา', 'store'],
  truck:   ['ทะเบียนรถ', 'ทะเบียน', 'truck no', 'truck'],
  driver:  ['พขร.', 'พขร', 'truck driver', 'driver'],
  reason:  ['reason20', 'สาเหตุ', 'reason'],
  exvat:   ['ex_vat', 'exvat'],
  vat:     ['vat'],
  net:     ['net_amt', 'netamt', 'ยอด (บาท)', 'ยอด', 'amount'],
  code:    ['item no', 'itemno', 'รหัส'],
  name:    ['art_desc', 'artdesc', 'ชื่อสินค้า'],
  note:    ['note21', 'หมายเหตุ', 'note'],
};
function detectColumns(headerRow){
  const cells = headerRow.map(s => String(s || '').trim().toLowerCase());
  const idx = {};
  for(const [field, aliases] of Object.entries(RC_ALIASES)){
    /* จับคู่แบบตรงเป๊ะเท่านั้น (ไม่ใช้ substring) — ไฟล์จริงมีคอลัมน์ข้อความอิสระหลายคอลัมน์
       ที่บังเอิญมีคำอย่าง "สาขา" ปนอยู่ในชื่อหัวตาราง จับแบบ substring จะดึงคอลัมน์ผิดมาแทน
       ไล่ตามลำดับความสำคัญของ alias (ชื่อเจาะจงสุดมาก่อน) เช่น "Reason20" ต้องมาก่อน "Reason" เฉย ๆ */
    let found = -1;
    for(const a of aliases){ found = cells.indexOf(a); if(found >= 0) break; }
    idx[field] = found;
  }
  return idx;
}
/* เลขเคลมจริงต้องมีรูปแบบ "รหัส-..." (MKM-… / CLM-…) — แถวที่ไม่มีเลขเคลม
   (เช่น "Reject claim", "สาขายกเลิกเคลม", "สาขาตัด DA ผิด") ไม่มี ID ให้จับคู่หรือสร้างเคสได้
   ตามที่ตกลงกันไว้ว่าให้ข้ามไปเลยแบบเงียบ ๆ ไม่ต้องนับหรือแสดง */
const looksLikeClaimId = s => /^[A-Za-z]{2,6}-/.test(String(s || '').trim());

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
        <span class="sp"><button type="button" class="sm" id="rcTemplate">โหลดไฟล์ตัวอย่าง (เทมเพลตง่าย)</button></span></div>
      <div class="pbody">
        <p class="hint">วางได้ทั้งสองแบบ: <b>(1)</b> คัดลอกทั้งชีตจากไฟล์สรุปจริงของขนส่ง (คอลัมน์
          <span class="mono" style="font-size:12px">Claim_ID (Final) · Ex_vat · Vat · Net_amt · Reason20 · Deldate · Item No · Art_Desc · Note21</span>
          ) มาวางได้เลย ระบบหาคอลัมน์ให้เอง ไม่ต้องเรียงคอลัมน์เอง หรือ <b>(2)</b> เทมเพลตง่าย 9 คอลัมน์เดิม
          (เลขเคลม · ขนส่ง · วันที่รับเมล · สาขา · ทะเบียนรถ · พขร. · สาเหตุ · ยอด · หมายเหตุ)</p>
        <p class="hint"><b>เลขเคลมที่มีอยู่แล้วในระบบจะถูกข้ามอัตโนมัติ ไม่นำเข้าซ้ำ</b> —
          ใช้จุดนี้ตรวจว่าที่คีย์รายวันไว้ครบกับไฟล์สรุปที่ขนส่งส่งมาไหม
          ถ้าเลขเคลมเดียวมีหลายบรรทัดสินค้า ระบบรวมเป็นเคสเดียวให้อัตโนมัติ (ยอดรวมกัน)
          แถวที่ไม่มีเลขเคลม (เช่น Reject claim / สาขายกเลิกเคลม) จะถูกข้ามไปเงียบ ๆ ไม่แสดงในตาราง
          แถวที่นำเข้าใหม่จะสร้างเป็นเคสในระบบ ยังไม่ระบุสาขา/ซับ (ไปเติมต่อได้ทีหลัง)</p>
        <textarea class="paste" id="rcPaste" placeholder="วางตารางจาก Excel ตรงนี้ (Ctrl+V)"></textarea>
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

  /* หาแถวหัวตาราง — ไล่ดู 5 แถวแรก เอาแถวแรกที่หาคอลัมน์ "เลขเคลม" เจอ */
  let headerRowIdx = -1, cols = null;
  for(let i = 0; i < Math.min(raw.length, 5); i++){
    const c = detectColumns(raw[i]);
    if(c.id >= 0){ headerRowIdx = i; cols = c; break; }
  }
  if(headerRowIdx < 0){
    toast('หาคอลัมน์ "เลขเคลม" / "Claim_ID (Final)" ในหัวตารางไม่เจอ — ตรวจว่าคัดลอกมาครบทั้งแถวหัวตารางไหม');
    return;
  }
  rcRows = parseReconcile(raw.slice(headerRowIdx + 1), cols);
  showReconcilePreview();
}

function parseReconcile(rows, cols){
  const get = (r, field) => cols[field] >= 0 ? (r[cols[field]] ?? '') : '';
  const hasItemCols = cols.code >= 0 || cols.name >= 0;

  /* รวมทุกบรรทัดของเลขเคลมเดียวกันเข้าด้วยกันก่อน — ไฟล์จริง 1 เคลมมีได้หลายบรรทัดสินค้า */
  const groups = new Map();
  for(const r of rows){
    const idRaw = String(get(r, 'id') || '').trim();
    if(!idRaw || !looksLikeClaimId(idRaw)) continue;   /* ไม่มีเลขเคลม → ข้ามเงียบ ๆ ตามที่ตกลงไว้ */
    const key = idRaw.toUpperCase();
    if(!groups.has(key)) groups.set(key, {id:idRaw, rows:[]});
    groups.get(key).rows.push(r);
  }

  let n = 0;
  const out = [];
  for(const {id, rows:grp} of groups.values()){
    n++;
    const first = f => { for(const r of grp){ const v = get(r, f); if(String(v||'').trim()) return String(v).trim(); } return ''; };
    const out_ = {n, id, carrier:first('carrier').toUpperCase(), atRaw:first('at'), atIso:'',
      store:first('store'), truck:first('truck'), driver:first('driver'), reason:first('reason'),
      note:[...new Set(grp.map(r => String(get(r,'note')||'').trim()).filter(Boolean))].join(' // '),
      exVat:0, vat:0, amt:0, items:[], status:'ok', msg:''};

    /* ยอด: รวม Ex_vat/Vat/Net_amt ของทุกบรรทัดสินค้าในเลขเคลมนี้ */
    for(const r of grp){
      const ev = cols.exvat >= 0 ? Math.abs(parseAmt(get(r,'exvat'))) : 0;
      const vt = cols.vat   >= 0 ? Math.abs(parseAmt(get(r,'vat')))   : 0;
      let net  = cols.net   >= 0 ? Math.abs(parseAmt(get(r,'net')))   : 0;
      if(!net && (ev || vt)) net = ev + vt;
      out_.exVat += ev; out_.vat += vt; out_.amt += net;
      if(hasItemCols){
        const code = String(get(r,'code')||'').trim(), name = String(get(r,'name')||'').trim();
        if(code || name || net) out_.items.push({code, name, amt: net || null});
      }
    }
    out_.exVat = Math.round(out_.exVat*100)/100; out_.vat = Math.round(out_.vat*100)/100; out_.amt = Math.round(out_.amt*100)/100;

    if(caseIdExists(out_.id)){ out_.status = 'skip'; out_.msg = 'มีเคสนี้ในระบบแล้ว — ข้ามไม่นำเข้าซ้ำ'; out.push(out_); continue; }

    if(out_.carrier === 'DHL' || out_.carrier === 'CJ'){ /* ระบุมาแล้วในไฟล์ */ }
    else if(/^MKM-/i.test(out_.id)) out_.carrier = 'DHL';
    else if(/^CLM-/i.test(out_.id)) out_.carrier = 'CJ';
    else { out_.carrier = 'DHL'; out_.status = 'warn'; out_.msg = 'ไม่ระบุขนส่งชัดเจน จะตั้งเป็น DHL ให้ก่อน — แก้ทีหลังได้'; }

    if(out_.atRaw){
      const d = parseFlexibleDate(out_.atRaw);
      if(d) out_.atIso = isoLocal(d);
      else { out_.status = 'warn'; out_.msg = (out_.msg?out_.msg+' · ':'')+'อ่านวันที่รับเมลไม่ออก จะใช้เวลานำเข้าแทน'; }
    } else { out_.status = 'warn'; out_.msg = (out_.msg?out_.msg+' · ':'')+'ไม่มีวันที่รับเมล จะใช้เวลานำเข้าแทน'; }
    out.push(out_);
  }
  return out;
}

function showReconcilePreview(){
  const good = rcRows.filter(r => r.status !== 'skip');
  const skip = rcRows.filter(r => r.status === 'skip');
  document.getElementById('rcPreview').innerHTML = `
    <div class="tw" style="margin-top:14px"><table style="min-width:1080px"><thead><tr>
      <th>#</th><th>เลขเคลม</th><th>ขนส่ง</th><th>วันที่รับเมล</th><th>สาเหตุ</th>
      <th style="text-align:right">รายการ</th><th style="text-align:right">Ex_vat</th>
      <th style="text-align:right">VAT</th><th style="text-align:right">Net_amt</th><th>ผลตรวจ</th></tr></thead><tbody>
      ${rcRows.slice(0, 300).map(r => `<tr style="cursor:default">
        <td class="mono">${r.n}</td>
        <td class="mono">${esc(r.id || '—')}</td>
        <td>${esc(r.carrier || '—')}</td>
        <td class="mono" style="font-size:12px">${r.atIso ? fmt(r.atIso, true) : (r.atRaw ? esc(r.atRaw) : '—')}</td>
        <td style="font-size:12px">${esc(r.reason || '—')}</td>
        <td class="r">${r.items.length || '—'}</td>
        <td class="r">${r.exVat ? r.exVat.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td class="r">${r.vat ? r.vat.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td class="r">${r.amt ? r.amt.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td>${r.status === 'skip' ? `<span class="chip bad">ข้าม — ${esc(r.msg)}</span>`
            : r.status === 'warn' ? `<span class="chip warn">${esc(r.msg)}</span>`
            : '<span class="chip ok">พร้อมนำเข้า</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    ${rcRows.length > 300 ? `<p class="hint">แสดง 300 บรรทัดแรกจาก ${rcRows.length} — นำเข้าครบทุกบรรทัด</p>` : ''}
    <div class="actions" style="margin-top:12px">
      <button type="button" class="pri" id="rcApply" ${good.length?'':'disabled'}>นำเข้า ${good.length} เคส</button>
      <span class="hint" style="margin:0">${skip.length} เคลมถูกข้าม (ซ้ำกับที่มีอยู่แล้ว)</span></div>`;
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
      amount:r.amt, ex_vat:r.exVat, vat:r.vat, items:r.items,
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
  const rows = [['เลขเคลม','ขนส่ง','BU','สาขา','ทะเบียน','Ex_vat','VAT','ยอด (บาท)','รับเมล','สถานะ']];
  for(const {c, m, bu} of R.list) rows.push([c.id, c.carrier, bu, c.store_name || c.store, c.truck,
    (c.ex_vat||0).toFixed(2), (c.vat||0).toFixed(2), (c.amount||0).toFixed(2),
    m.t0 ? fmt(m.t0, true) : '', m.status === 'CLOSED' ? 'ปิดแล้ว' : 'ค้าง (Pending)']);
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
