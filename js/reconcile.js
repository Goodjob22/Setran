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
  store:   ['สาขา', 'store', 'st.', 'st'],
  truck:   ['ทะเบียนรถ', 'ทะเบียน', 'truck no', 'truck'],
  driver:  ['พขร.', 'พขร', 'truck driver', 'driver'],
  reason:  ['reason20', 'สาเหตุ', 'reason'],
  exvat:   ['ex_vat', 'exvat'],
  vat:     ['vat'],
  net:     ['net_amt', 'netamt', 'ยอด (บาท)', 'ยอด', 'amount'],
  code:    ['item no', 'itemno', 'รหัส'],
  name:    ['art_desc', 'artdesc', 'ชื่อสินค้า'],
  qty:     ['gor_qty', 'qty'],
  note:    ['note21', 'หมายเหตุ', 'note'],
  mktransport: ['mk transport'],
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

/* ---------- อ่านทะเบียนรถ/ชื่อ พขร. จากข้อความในหมายเหตุ — ไฟล์จริงไม่มีคอลัมน์แยก แต่ตัวปฏิบัติงาน
   มักพิมพ์ "...โดยทะเบียน 71-7665 คุณประสิทธิ์ ; ..." ไว้ในหมายเหตุเสมอเวลาตรวจรับเสร็จแล้ว (เจอเกือบ 1 ใน 3
   ของแถวจริง) ดึงมาเติมให้อัตโนมัติ ดีกว่าปล่อยว่างไว้ทั้งหมด ที่เหลือที่ดึงไม่ได้ก็ยังว่างเหมือนเดิม แก้เองทีหลังได้ */
function extractTruckDriver(note){
  const m = /ทะเบียน\s*([0-9]{1,3}-[0-9]{3,5})\s*คุณ\s*([ก-๙]+)/.exec(String(note || ''));
  return m ? {truck:m[1], driver:m[2]} : null;
}

let RC = {periodKey: periodOf(NOW()).key};
let rcRows = null;
let rcImported = false;   /* true หลังกดนำเข้าแล้ว — ซ่อนตารางตรวจก่อนนำเข้า แต่ตารางเทียบยอดยังโชว์ต่อ
                             ให้เลือกเคสที่เพิ่งนำเข้าไปปิด/ออก Memo ต่อได้เลยโดยไม่ต้องสลับแท็บ */
let rcLastImport = [];    /* เลขเคลมที่นำเข้ารอบล่าสุด — เผื่อนำเข้าผิด/ข้อมูลไม่ครบ จะได้ลบทั้งชุดได้ในคลิกเดียว
                             (จำได้แค่ในเซสชันนี้ รีเฟรชหน้าแล้วหาย ไม่ใช่ประวัติถาวร) */

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
          <span class="mono" style="font-size:12px">Claim_ID (Final) · Ex_vat · Vat · Net_amt · Reason20 · Deldate · St. · Item No · Art_Desc · Note21</span>
          ) มาวางได้เลย ระบบหาคอลัมน์ให้เอง ไม่ต้องเรียงคอลัมน์เอง — สาขาอ่านจากคอลัมน์ <b>St.</b> โดยตรง ส่วนทะเบียนรถ/พขร.
          ไม่มีคอลัมน์แยก แต่ลองอ่านจากข้อความในหมายเหตุให้ (เจอรูปแบบ "...โดยทะเบียน xx-xxxx คุณชื่อ..." ได้ประมาณ 1 ใน 3
          ของแถว ที่เหลือว่างไว้ แก้เองทีหลังได้) หรือ <b>(2)</b> เทมเพลตง่าย 9 คอลัมน์เดิม
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
    </div>
    <div id="rcCompare"></div>`;

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
  if(rcRows){
    if(rcImported) document.getElementById('rcPreview').innerHTML = '';
    else showReconcilePreview();
    renderReconcileCompare(buildReconcileCompare(R));
  }
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
  if(cols.exvat < 0 && cols.vat < 0 && cols.net < 0)
    toast('ไม่พบคอลัมน์ยอดเงินเลย (Ex_vat / Vat / Net_amt) — ทุกเคสจะนำเข้าด้วยยอด 0 บาท ตรวจว่าคัดลอกครบทุกคอลัมน์ไหม');
  rcRows = parseReconcile(raw.slice(headerRowIdx + 1), cols);
  rcImported = false;
  showReconcilePreview();
  renderReconcileCompare(buildReconcileCompare(pendingReportData()));
}

function parseReconcile(rows, cols){
  const get = (r, field) => cols[field] >= 0 ? (r[cols[field]] ?? '') : '';
  const hasItemCols = cols.code >= 0 || cols.name >= 0 || cols.qty >= 0;

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
      mkTransport:first('mktransport'),
      note:[...new Set(grp.map(r => String(get(r,'note')||'').trim()).filter(Boolean))].join(' // '),
      exVat:0, vat:0, amt:0, items:[], status:'ok', msg:''};

    /* ทะเบียนรถ/พขร. ไม่มีคอลัมน์แยกในไฟล์จริง — ลองดึงจากข้อความในหมายเหตุถ้ายังไม่มีค่าจากคอลัมน์ตรง ๆ */
    if(!out_.truck || !out_.driver){
      const td = extractTruckDriver(out_.note);
      if(td){ if(!out_.truck) out_.truck = td.truck; if(!out_.driver) out_.driver = td.driver; }
    }

    /* ยอด: รวม Ex_vat/Vat/Net_amt ของทุกบรรทัดสินค้าในเลขเคลมนี้ */
    for(const r of grp){
      const ev = cols.exvat >= 0 ? Math.abs(parseAmt(get(r,'exvat'))) : 0;
      const vt = cols.vat   >= 0 ? Math.abs(parseAmt(get(r,'vat')))   : 0;
      let net  = cols.net   >= 0 ? Math.abs(parseAmt(get(r,'net')))   : 0;
      if(!net && (ev || vt)) net = ev + vt;
      out_.exVat += ev; out_.vat += vt; out_.amt += net;
      if(hasItemCols){
        const code = String(get(r,'code')||'').trim(), name = String(get(r,'name')||'').trim();
        const qty = String(get(r,'qty')||'').trim();
        if(code || name || net || qty)
          out_.items.push({code, name, qty_load:'', qty_rec:'', qty_diff:qty, amt: net || null});
      }
    }
    out_.exVat = Math.round(out_.exVat*100)/100; out_.vat = Math.round(out_.vat*100)/100; out_.amt = Math.round(out_.amt*100)/100;

    if(caseIdExists(out_.id)){ out_.status = 'skip'; out_.msg = 'มีเคสนี้ในระบบแล้ว — ข้ามไม่นำเข้าซ้ำ'; out.push(out_); continue; }

    /* ไม่เจอยอดเงินเลย (Ex_vat/Vat/Net_amt ว่างหรือหาคอลัมน์ไม่เจอทั้งหมด) — เตือนไว้ก่อนนำเข้าเป็น 0 บาทเงียบ ๆ */
    if(!out_.amt) out_.status = 'warn', out_.msg = (out_.msg?out_.msg+' · ':'')+'ไม่พบยอดเงิน (Ex_vat/Vat/Net_amt) จะนำเข้าเป็น 0 บาท — ตรวจไฟล์หรือแก้ยอดทีหลัง';

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

/* ---------- หาว่าซับไหนน่าจะถือเคลมนี้ — เทียบกับรายชื่อ/รหัส/ชื่อเรียกอื่นของซับที่มีอยู่จริงในระบบ ---------- */
function vendorCandidates(){
  return Object.entries(S.vendors || {}).map(([code, v]) => ({
    code, needles: [code, v.display, ...(v.aliases||[])].filter(Boolean).map(s => String(s).trim().toLowerCase())
  })).filter(v => v.needles.length);
}
const matchVendorExact = (text, cand) => {
  const t = String(text||'').trim().toLowerCase();
  if(!t) return null;
  const hit = cand.find(v => v.needles.includes(t));
  return hit ? hit.code : null;
};
const matchVendorInText = (text, cand) => {
  const t = String(text||'').toLowerCase();
  if(!t) return null;
  const hit = cand.find(v => v.needles.some(n => n.length >= 3 && t.includes(n)));
  return hit ? hit.code : null;
};

/* ---------- ตรวจสอบยอดตรงกัน — เทียบเคลมในรอบ Period นี้ ระหว่างที่มีในระบบกับที่มีในไฟล์ที่เพิ่งตรวจ
   จัดกลุ่มตามซับ (เอาซับจากระบบก่อนถ้ารู้อยู่แล้ว ไม่งั้นลองเดาจากคอลัมน์ MK Transport และคำในหมายเหตุ) ---------- */
function buildReconcileCompare(R){
  if(!rcRows) return [];
  const sysById = new Map();
  for(const x of R.list) sysById.set(x.c.id.toUpperCase(), x);
  const fileById = new Map();
  for(const r of rcRows) fileById.set(r.id.toUpperCase(), r);
  const cand = vendorCandidates();

  const rows = [];
  for(const key of new Set([...sysById.keys(), ...fileById.keys()])){
    const sys = sysById.get(key), file = fileById.get(key);
    const sysAmt = sys ? (sys.c.amount||0) : null;
    const fileAmt = file ? file.amt : null;
    const cmp = sys && file ? (Math.abs(sysAmt - fileAmt) < 0.01 ? 'match' : 'mismatch')
      : sys ? 'sysonly' : 'fileonly';

    let vendor = sys ? sys.m.vendor : null, vendorSrc = vendor ? 'ระบบ' : '';
    if(!vendor && file){
      const byMk = file.mkTransport ? matchVendorExact(file.mkTransport, cand) : null;
      const byNote = matchVendorInText(file.note, cand);
      if(byMk && byNote && byMk !== byNote){ vendor = byMk; vendorSrc = `MK Transport (หมายเหตุกลับชี้ ${esc(byNote)})`; }
      else if(byMk){ vendor = byMk; vendorSrc = 'MK Transport'; }
      else if(byNote){ vendor = byNote; vendorSrc = 'เดาจากหมายเหตุ'; }
    }
    /* เลือกได้เฉพาะเคลมที่มีเคสในระบบจริงแล้ว และยังไม่ได้ปิด+ออก Memo ครบ — เอาไว้เลือกปิดเคส/ออก Memo
       ต่อจากตารางนี้ได้เลย โดยไม่ต้องสลับไปหน้ากระดาน (ใช้ Set ตัวเลือกร่วมกับหน้ากระดาน) */
    const pickable = !!sys && (sys.m.status === 'OPEN' || (sys.m.status === 'CLOSED' && !sys.m.memoNo));
    rows.push({id: sys ? sys.c.id : file.id, vendor, vendorSrc, cmp, sysAmt, fileAmt, pickable,
      status: sys ? sys.m.status : null});
  }

  const groups = new Map();
  for(const row of rows){
    const key = row.vendor || NOVENDOR;
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .sort((a,b) => a[0] === NOVENDOR ? 1 : b[0] === NOVENDOR ? -1 : a[0].localeCompare(b[0], 'th'))
    .map(([vendor, items]) => ({
      vendor, items: items.sort((a,b) => a.id.localeCompare(b.id)),
      sysTotal: items.reduce((s,x) => s+(x.sysAmt||0), 0),
      fileTotal: items.reduce((s,x) => s+(x.fileAmt||0), 0),
    }));
}

function renderReconcileCompare(groups){
  const box = document.getElementById('rcCompare');
  if(!box) return;
  const undoBanner = rcLastImport.length ? `<div class="warnbox" style="margin-bottom:14px">
    <b>นำเข้าไปแล้ว ${rcLastImport.length} เคสในรอบล่าสุด</b> — ถ้าเช็คแล้วพบว่าข้อมูลไม่ครบหรือผิด
    ลบทั้งชุดคืนได้ในปุ่มเดียว <button type="button" class="sm" id="rcUndo" style="margin-left:8px">ลบเคสที่นำเข้ารอบล่าสุดทั้งหมด</button>
  </div>` : '';
  if(!groups.length){ box.innerHTML = undoBanner; bindUndo(); return; }
  const fmtAmt = v => v == null ? '—' : v.toLocaleString('th-TH', {minimumFractionDigits:2});
  const cmpChip = c => c === 'match' ? '<span class="chip ok">ตรงกัน</span>'
    : c === 'mismatch' ? '<span class="chip bad">ไม่ตรงกัน</span>'
    : c === 'sysonly' ? '<span class="chip warn">มีแต่ในระบบ</span>'
    : '<span class="chip n">มีแต่ในไฟล์</span>';
  const nMismatch = groups.reduce((s,g) => s+g.items.filter(x=>x.cmp==='mismatch').length, 0);
  const nSysOnly  = groups.reduce((s,g) => s+g.items.filter(x=>x.cmp==='sysonly').length, 0);
  const nFileOnly = groups.reduce((s,g) => s+g.items.filter(x=>x.cmp==='fileonly').length, 0);

  box.innerHTML = `
    ${undoBanner}
    <div class="panel">
      <div class="phead"><h3>ตรวจสอบยอดตรงกัน — เรียงตามซับ</h3>
        <span class="sp hint" style="margin:0">ไม่ตรงกัน ${nMismatch} · มีแต่ในระบบ ${nSysOnly} · มีแต่ในไฟล์ ${nFileOnly}</span></div>
      <p class="hint" style="margin:10px 18px 0">ติ๊กเลือกเคลมที่มีเคสในระบบแล้ว (คอลัมน์ซ้ายสุด) แล้วใช้แถบด้านบนสุดของหน้า
        เพื่อทำเครื่องหมายซับรับเคลม/ใส่เลข Memo ต่อได้เลย ไม่ต้องสลับไปหน้ากระดาน</p>
      <div class="pbody" style="padding:0">
        ${groups.map(g => `
          <div class="tw" style="border-top:1px solid var(--rule)"><table style="min-width:800px"><thead>
            <tr><th colspan="6"><b>${esc(g.vendor)}</b> — ${g.items.length} เคลม ·
              ยอดระบบ ${fmtAmt(g.sysTotal)} บาท · ยอดไฟล์ ${fmtAmt(g.fileTotal)} บาท</th></tr>
            <tr><th style="width:30px"></th><th>เลขเคลม</th><th style="text-align:right">ยอดในระบบ</th>
              <th style="text-align:right">ยอดในไฟล์</th><th>ที่มาซับ</th><th>ผลตรวจ</th></tr></thead>
            <tbody>${g.items.map(x => `<tr style="cursor:default">
              <td onclick="event.stopPropagation()">${x.pickable
                ? `<input type="checkbox" class="rcPick" data-id="${esc(x.id)}" ${boardSelect.has(x.id)?'checked':''}>` : ''}</td>
              <td class="mono">${esc(x.id)}</td>
              <td class="r">${fmtAmt(x.sysAmt)}</td>
              <td class="r">${fmtAmt(x.fileAmt)}</td>
              <td style="font-size:12px">${x.vendorSrc || ''}</td>
              <td>${cmpChip(x.cmp)}</td></tr>`).join('')}
            </tbody></table></div>`).join('')}
      </div>
    </div>`;
  box.querySelectorAll('.rcPick').forEach(cb => cb.onchange = () => {
    if(cb.checked) boardSelect.add(cb.dataset.id); else boardSelect.delete(cb.dataset.id);
    renderMemoBar();
  });
  bindUndo();
  function bindUndo(){
    const b = document.getElementById('rcUndo');
    if(b) b.onclick = undoLastImport;
  }
}

function showReconcilePreview(){
  const good = rcRows.filter(r => r.status !== 'skip');
  const skip = rcRows.filter(r => r.status === 'skip');
  document.getElementById('rcPreview').innerHTML = `
    <div class="tw" style="margin-top:14px"><table style="min-width:1240px"><thead><tr>
      <th>#</th><th>เลขเคลม</th><th>ขนส่ง</th><th>วันที่รับเมล</th><th>สาขา</th><th>ทะเบียน</th><th>พขร.</th><th>สาเหตุ</th>
      <th style="text-align:right">รายการ</th><th style="text-align:right">Ex_vat</th>
      <th style="text-align:right">VAT</th><th style="text-align:right">Net_amt</th><th>ผลตรวจ</th></tr></thead><tbody>
      ${rcRows.slice(0, 300).map(r => `<tr style="cursor:default">
        <td class="mono">${r.n}</td>
        <td class="mono">${esc(r.id || '—')}</td>
        <td>${esc(r.carrier || '—')}</td>
        <td class="mono" style="font-size:12px">${r.atIso ? fmt(r.atIso, true) : (r.atRaw ? esc(r.atRaw) : '—')}</td>
        <td>${esc(r.store || '—')}</td>
        <td class="mono">${esc(r.truck || '—')}</td>
        <td>${esc(r.driver || '—')}</td>
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
  const importedIds = [];
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
      importedIds.push(r.id);
    }catch(e){ failed++; }
  }
  const st = await API.state();
  S.events = st.events;
  rcImported = true;
  rcLastImport = importedIds;
  render();
  toast(`นำเข้าแล้ว ${added} เคส${failed ? ` · ${failed} รายการนำเข้าไม่สำเร็จ` : ''} — เลือกด้านล่างเพื่อปิดเคส/ออก Memo ต่อได้เลย`);
}

/* ---------- ลบเคสที่นำเข้ารอบล่าสุดทั้งชุด — เผื่อกดนำเข้าแล้วพบว่าข้อมูลไม่ครบ/ผิด ---------- */
async function undoLastImport(){
  if(!rcLastImport.length) return;
  if(!confirm(`ลบเคสที่นำเข้ารอบล่าสุดทั้งหมด ${rcLastImport.length} เคส?\n\nลบแล้วลบถาวร รวมประวัติ/บันทึกใด ๆ ที่เพิ่มเข้าไปหลังนำเข้า (เช่น ทำเครื่องหมายรับเคลม หรือใส่เลข Memo ไปแล้ว) ก็จะหายไปด้วย`)) return;
  let removed = 0;
  for(const id of rcLastImport){
    try{ await API.delCase(id); delete S.cases[id]; delete S.events[id]; boardSelect.delete(id); removed++; }
    catch(e){}
  }
  rcLastImport = [];
  render();
  toast(`ลบเคสที่นำเข้าไว้แล้ว ${removed} เคส`);
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
