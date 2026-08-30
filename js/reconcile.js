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
let rcRowsPeriodKey = null;   /* Period ที่ rcRows ชุดปัจจุบันตรวจไว้ — ใช้เช็คว่าตัวเลข "ไม่ตรงไฟล์"
                                  ในแท็บสรุปยังใช้ได้อยู่ไหม (สลับ Period แล้วไม่ได้ตรวจไฟล์รอบนั้นซ้ำ) */
let rcImported = false;   /* true หลังกดนำเข้าแล้ว — ซ่อนตารางตรวจก่อนนำเข้า แต่ตารางเทียบยอดยังโชว์ต่อ
                             ให้เลือกเคสที่เพิ่งนำเข้าไปปิด/ออก Memo ต่อได้เลยโดยไม่ต้องสลับแท็บ */
let rcLastImport = [];    /* เลขเคลมที่นำเข้ารอบล่าสุด — เผื่อนำเข้าผิด/ข้อมูลไม่ครบ จะได้ลบทั้งชุดได้ในคลิกเดียว
                             (จำได้แค่ในเซสชันนี้ รีเฟรชหน้าแล้วหาย ไม่ใช่ประวัติถาวร) */
let rcReimportSelect = new Set();   /* เลือกเคสที่ยังไม่มีทะเบียนรถและยังไม่ปิด เพื่อลบเคสเดิมแล้วสร้างใหม่จากไฟล์ */

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
          แถวที่นำเข้าใหม่จะสร้างเป็นเคสในระบบ — คอลัมน์ <b>ซับ</b> ในตาราง ระบบจะตั้งให้อัตโนมัติเมื่อรู้แน่ชัด
          (คอลัมน์ MK Transport ตรงตัว / คำในหมายเหตุ / หรือทะเบียนนี้เคยรับเคลม-ตั้งซับสัมปทานไว้แล้วซับเดียวชัดเจน)
          ถ้าไม่มีเบาะแสเลยหรือทะเบียนชี้ไปหลายซับพร้อมกัน จะปล่อยว่างไว้ ไปยืนยัน/เลือกเองที่ตาราง
          "ตรวจสอบยอดตรงกัน" ด้านล่างหลังนำเข้าได้
          <b>วางไฟล์เดิมซ้ำได้เสมอ</b> — เคสที่มีอยู่แล้วจะไม่ถูกนำเข้าซ้ำ แต่ถ้าเคสไหนสาขา/ทะเบียน/พขร. ยังว่างอยู่
          (เช่น นำเข้าไว้ตั้งแต่ก่อนระบบอ่านคอลัมน์พวกนี้ได้) จะมีปุ่มให้เติมข้อมูลที่ขาดให้แยกต่างหาก
          โดยไม่แตะฟิลด์ที่มีค่าอยู่แล้ว</p>
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
  rcRowsPeriodKey = RC.periodKey;
  rcImported = false;
  showReconcilePreview();
  renderReconcileCompare(buildReconcileCompare(pendingReportData()));
}

function parseReconcile(rows, cols){
  const get = (r, field) => cols[field] >= 0 ? (r[cols[field]] ?? '') : '';
  const hasItemCols = cols.code >= 0 || cols.name >= 0 || cols.qty >= 0;
  const cand = vendorCandidates();

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

    /* หาซับให้เคสนี้ — เรียงตามความน่าเชื่อถือ: (1) คอลัมน์ MK Transport ตรงตัว (2) คำในหมายเหตุ
       (3) ถ้าไฟล์ไม่บอกเลย ใช้ทะเบียนรถเทียบกับที่ระบบรู้จักอยู่แล้ว (เคยรับเคลม/ตั้งซับสัมปทานไว้)
       แต่ต้องชี้ไปซับเดียวชัดเจนเท่านั้น (bestGuess) ถ้าเสมอกันหลายรายจะไม่เดาให้ ปล่อยว่างไว้ให้ไปเลือกเองที่
       ตาราง "ตรวจสอบยอดตรงกัน" หลังนำเข้า — ค่านี้จะถูกใช้ตั้งซับให้เคสจริงตอนกดนำเข้าเลย ไม่ใช่แค่โชว์ */
    out_.vendor = null; out_.vendorSrc = '';
    const byMk = out_.mkTransport ? matchVendorExact(out_.mkTransport, cand) : null;
    const byNote = matchVendorInText(out_.note, cand);
    if(byMk && byNote && byMk !== byNote){ out_.vendor = byMk; out_.vendorSrc = `MK Transport (หมายเหตุกลับชี้ ${byNote})`; }
    else if(byMk){ out_.vendor = byMk; out_.vendorSrc = 'MK Transport'; }
    else if(byNote){ out_.vendor = byNote; out_.vendorSrc = 'เดาจากหมายเหตุ'; }
    else if(out_.truck){
      const g = bestGuess(out_);
      if(g){ out_.vendor = g.vendor; out_.vendorSrc = `ทะเบียนนี้ (${g.why})`; }
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

    if(caseIdExists(out_.id)){
      out_.status = 'skip'; out_.msg = 'มีเคสนี้ในระบบแล้ว — ข้ามไม่นำเข้าซ้ำ';
      /* เคสมีอยู่แล้วแต่บางฟิลด์ยังว่าง (เช่น นำเข้าไว้ก่อนที่ระบบจะอ่านสาขา/ทะเบียนได้) — ถ้าไฟล์รอบนี้มีข้อมูล
         ที่ระบบยังไม่มี เก็บไว้เป็นตัวเลือก "อัปเดตข้อมูลที่ขาด" ให้ ไม่แตะฟิลด์ที่มีค่าอยู่แล้วเด็ดขาด กันทับของเดิม */
      const existing = String(out_.id).trim() in S.cases ? S.cases[String(out_.id).trim()]
        : allCases().find(c => c.id.toUpperCase() === String(out_.id).trim().toUpperCase());
      if(existing){
        const fill = {};
        if(!existing.store && out_.store) fill.store = out_.store;
        if(!existing.truck && out_.truck) fill.truck = out_.truck;
        if(!existing.driver && out_.driver) fill.driver = out_.driver;
        if(Object.keys(fill).length){ out_.backfillId = existing.id; out_.backfill = fill; }

        /* เคสที่ยังไม่มีทะเบียนรถ และยังไม่เคยปิด/ออก Memo (ยังไม่มีใครไปทำงานต่อ) — ปลอดภัยพอจะลบเคสเดิม
           ทิ้งแล้วสร้างใหม่จากไฟล์นี้ทั้งเคส (ได้ข้อมูลครบกว่าแค่เติมทะเบียน) เคสที่ปิด/มี Memo แล้วห้ามแตะเด็ดขาด */
        if(!existing.truck){
          const em = compute(existing);
          if(em.status === 'OPEN') out_.reimportId = existing.id;
        }
      }
      out.push(out_); continue;
    }

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

  const rows = [];
  for(const key of new Set([...sysById.keys(), ...fileById.keys()])){
    const sys = sysById.get(key), file = fileById.get(key);
    const sysAmt = sys ? (sys.c.amount||0) : null;
    const fileAmt = file ? file.amt : null;
    const cmp = sys && file ? (Math.abs(sysAmt - fileAmt) < 0.01 ? 'match' : 'mismatch')
      : sys ? 'sysonly' : 'fileonly';

    let vendor = sys ? sys.m.vendor : null, vendorSrc = vendor ? 'ระบบ' : '';
    if(!vendor && file && file.vendor){ vendor = file.vendor; vendorSrc = file.vendorSrc; }
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
              <td style="font-size:12px">${esc(x.vendorSrc || '')}</td>
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
  const backfillable = rcRows.filter(r => r.backfill);
  const reimportable = rcRows.filter(r => r.reimportId);
  for(const id of [...rcReimportSelect]) if(!reimportable.some(r => r.reimportId === id)) rcReimportSelect.delete(id);
  document.getElementById('rcPreview').innerHTML = `
    <div class="tw" style="margin-top:14px"><table style="min-width:1340px"><thead><tr>
      <th>#</th><th>เลขเคลม</th><th>ขนส่ง</th><th>วันที่รับเมล</th><th>สาขา</th><th>ทะเบียน</th><th>พขร.</th><th>ซับ</th><th>สาเหตุ</th>
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
        <td style="font-size:12px">${r.vendor ? `${esc(r.vendor)}<span class="hint" style="display:block">${esc(r.vendorSrc)}</span>` : '—'}</td>
        <td style="font-size:12px">${esc(r.reason || '—')}</td>
        <td class="r">${r.items.length || '—'}</td>
        <td class="r">${r.exVat ? r.exVat.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td class="r">${r.vat ? r.vat.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td class="r">${r.amt ? r.amt.toLocaleString('th-TH', {minimumFractionDigits:2}) : '—'}</td>
        <td>${r.status === 'skip' ? `<span class="chip bad">ข้าม — ${esc(r.msg)}</span>${r.backfill?' <span class="chip warn">เติมข้อมูลที่ขาดได้</span>':''}`
            : r.status === 'warn' ? `<span class="chip warn">${esc(r.msg)}</span>`
            : '<span class="chip ok">พร้อมนำเข้า</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    ${rcRows.length > 300 ? `<p class="hint">แสดง 300 บรรทัดแรกจาก ${rcRows.length} — นำเข้าครบทุกบรรทัด</p>` : ''}
    <div class="actions" style="margin-top:12px">
      <button type="button" class="pri" id="rcApply" ${good.length?'':'disabled'}>นำเข้า ${good.length} เคส</button>
      ${backfillable.length ? `<button type="button" id="rcBackfill">เติมสาขา/ทะเบียน/พขร. ที่ขาดให้เคสเดิม (${backfillable.length} เคส)</button>` : ''}
      <span class="hint" style="margin:0">${skip.length} เคลมถูกข้าม (ซ้ำกับที่มีอยู่แล้ว)${backfillable.length?` · ${backfillable.length} เคสในนั้นเติมข้อมูลที่ขาดได้`:''}</span></div>
    ${reimportable.length ? `
    <div class="panel" style="margin-top:16px">
      <div class="phead"><h3>เคสที่ยังไม่มีทะเบียนรถ (นำเข้าไว้ก่อนหน้า)</h3>
        <span class="sp hint" style="margin:0">${reimportable.length} เคส — เฉพาะเคสที่ยังเปิดอยู่ ยังไม่ปิด/ไม่มีเลข Memo เท่านั้น</span></div>
      <div class="pbody" style="padding:0">
        <div class="tw" style="border:0"><table style="min-width:600px"><thead><tr>
          <th style="width:30px"><input type="checkbox" id="rcReimportAll" ${reimportable.length && rcReimportSelect.size===reimportable.length?'checked':''}></th>
          <th>เลขเคลม</th><th>สาขา</th><th style="text-align:right">ยอดในไฟล์</th></tr></thead><tbody>
          ${reimportable.map(r => `<tr style="cursor:default">
            <td onclick="event.stopPropagation()"><input type="checkbox" class="rcReimportPick" data-id="${esc(r.reimportId)}" ${rcReimportSelect.has(r.reimportId)?'checked':''}></td>
            <td class="mono">${esc(r.id)}</td>
            <td>${esc(r.store||'—')}</td>
            <td class="r">${r.amt?r.amt.toLocaleString('th-TH',{minimumFractionDigits:2}):'—'}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="pbody">
        <div class="actions" style="margin:0">
          <button type="button" id="rcReimport" ${rcReimportSelect.size?'':'disabled'}>ลบแล้วนำเข้าใหม่ (${rcReimportSelect.size} เคสที่เลือก)</button>
        </div>
      </div>
    </div>` : ''}`;
  const ap = document.getElementById('rcApply');
  if(ap) ap.onclick = applyReconcileImport;
  const bf = document.getElementById('rcBackfill');
  if(bf) bf.onclick = applyBackfill;
  document.querySelectorAll('.rcReimportPick').forEach(cb => cb.onchange = () => {
    if(cb.checked) rcReimportSelect.add(cb.dataset.id); else rcReimportSelect.delete(cb.dataset.id);
    showReconcilePreview();
  });
  const selAll = document.getElementById('rcReimportAll');
  if(selAll) selAll.onchange = () => {
    if(selAll.checked) reimportable.forEach(r => rcReimportSelect.add(r.reimportId));
    else rcReimportSelect.clear();
    showReconcilePreview();
  };
  const ri = document.getElementById('rcReimport');
  if(ri) ri.onclick = applyReimport;
}

/* ---------- เติมสาขา/ทะเบียน/พขร. ที่ขาดให้เคสที่มีอยู่แล้ว — ไม่แตะฟิลด์ที่มีค่าอยู่แล้ว
   ใช้ตอนนำเข้าไปแล้วก่อนที่ระบบจะอ่านคอลัมน์เหล่านี้ได้ (เช่น deploy รุ่นเก่า) แล้วอยากอัปเดตให้ครบทีหลัง ---------- */
async function applyBackfill(){
  const rows = rcRows.filter(r => r.backfill);
  if(!rows.length) return;
  let updated = 0, failed = 0;
  for(const r of rows){
    try{
      const j = await API.patchCase(r.backfillId, r.backfill);
      S.cases[r.backfillId] = j.case;
      updated++;
    }catch(e){ failed++; }
  }
  render();
  toast(`เติมข้อมูลที่ขาดแล้ว ${updated} เคส${failed ? ` · ${failed} รายการไม่สำเร็จ` : ''}`);
}

/* ---------- ลบเคสเดิมที่ยังไม่มีทะเบียนรถแล้วสร้างใหม่จากไฟล์นี้ทั้งเคส ----------
   ปลอดภัยกว่าลบทั้งชุดแบบ SQL ตรง ๆ เพราะเลือกเฉพาะเคสที่ parseReconcile() เห็นแล้วว่ายังเปิดอยู่
   (ไม่เคยปิด ไม่เคยมีเลข Memo) เท่านั้น — เคสที่ทำงานต่อไปแล้วจะไม่ถูกแตะเด็ดขาด */
async function applyReimport(){
  const ids = [...rcReimportSelect];
  if(!ids.length) return;
  if(!confirm(`ลบเคสเดิม ${ids.length} เคส แล้วสร้างใหม่จากไฟล์นี้?\n\nระบบเลือกมาให้เฉพาะเคสที่ยังเปิดอยู่ (ยังไม่ปิด ไม่มีเลข Memo) เท่านั้น เคสที่ทำงานต่อแล้วจะไม่ถูกลบแน่นอน\n\nลบแล้วลบถาวร ไทม์ไลน์เดิมของเคสที่ลบจะหายไปด้วย (จะสร้างไทม์ไลน์ใหม่จากไฟล์แทน)`)) return;
  const rows = rcRows.filter(r => ids.includes(r.reimportId));
  let done = 0, failed = 0;
  for(const r of rows){
    try{
      await API.delCase(r.reimportId);
      delete S.cases[r.reimportId]; delete S.events[r.reimportId]; boardSelect.delete(r.reimportId);
      const j = await API.addCase(buildCaseRecord(r, 'นำเข้าใหม่แทนเคสเดิมที่ข้อมูลไม่ครบ (ไม่มีทะเบียนรถ)'));
      S.cases[r.id] = j.case;
      done++;
    }catch(e){ failed++; }
  }
  const st = await API.state();
  S.events = st.events;
  rcReimportSelect.clear();
  render();
  toast(`ลบแล้วนำเข้าใหม่ ${done} เคส${failed ? ` · ${failed} รายการไม่สำเร็จ` : ''}`);
}

/* ใช้ทั้งตอนนำเข้าเคสใหม่ และตอน "ลบแล้วนำเข้าใหม่" — สร้าง payload เคสจากแถวที่แปลงไฟล์ไว้แล้ว */
function buildCaseRecord(r, note){
  const at = r.atIso || isoLocal(NOW());
  return {id:r.id, carrier:r.carrier, store:r.store, store_name:'', dept:'',
    driver:r.driver, truck:r.truck, reason:r.reason, ref_date:at.slice(0,10),
    amount:r.amt, ex_vat:r.exVat, vat:r.vat, items:r.items,
    events:[{type:'RECEIVE', at, vendor:r.vendor || null, text:note || r.note || 'นำเข้าจากไฟล์สรุป Period', src:'reconcile'}],
    source:'reconcile'};
}

async function applyReconcileImport(){
  const good = rcRows.filter(r => r.status !== 'skip');
  let added = 0, failed = 0;
  const importedIds = [];
  for(const r of good){
    const rec = buildCaseRecord(r);
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

/* ============================================================
   แท็บ "สรุปราย Period" — ตารางเทียบหลาย Period พร้อมกัน เคารพตัวกรอง
   Slicer ด้านบน (ขนส่ง/BU/สถานะ/ซับ/คำค้น) ทุกคอลัมน์ ยกเว้น "ไม่ตรงไฟล์"
   ที่จงใจไม่กรอง เพราะเป็นการตรวจความครบถ้วนของข้อมูลทั้งรอบเทียบกับไฟล์
   ขนส่ง ไม่ใช่มุมมองที่เลือกดู — กรองแล้วจะเทียบไม่ครบ เข้าใจผิดว่าขาดทั้งที่แค่ถูกกรองออก
   ============================================================ */
let SUM = {anchorKey: periodOf(NOW()).key};
const SUM_WINDOW = 6;

function periodSummaryRow(periodKey){
  const p = periodFromKey(periodKey);
  const inRange = ({m}) => m.t0 && D(m.t0) >= p.start && D(m.t0) < p.end;
  const inPeriod = visible().filter(inRange);        /* เคารพ Slicer — ใช้แสดงจำนวน/ยอดตามมุมมองที่เลือก */
  const fullPeriod = CACHE.filter(inRange);           /* ไม่กรอง — ใช้ตรวจกับไฟล์ขนส่งเท่านั้น */
  const closed = inPeriod.filter(x => x.m.status === 'CLOSED');
  const pending = inPeriod.filter(x => x.m.status === 'OPEN');
  const sum = arr => arr.reduce((s,x) => s + (x.c.amount || 0), 0);
  const noVendor = inPeriod.filter(x => !x.m.vendor);
  const vendorsN = new Set(inPeriod.map(x => x.m.vendor).filter(Boolean)).size;

  /* ยอด "ไม่ตรงไฟล์" มีให้ดูเฉพาะรอบที่เพิ่งวาง/ตรวจไฟล์สรุป Period นั้นไว้ในเซสชันนี้เท่านั้น
     (ไม่ได้เก็บถาวร) รอบอื่นจะโชว์ "ยังไม่ตรวจไฟล์" แทนเลข 0 กันเข้าใจผิดว่าตรงกันครบ */
  let fileMismatch = null;
  if(rcRows && rcRowsPeriodKey === periodKey){
    const groups = buildReconcileCompare({list: fullPeriod});
    fileMismatch = groups.reduce((s,g) => s + g.items.filter(x => x.cmp === 'mismatch').length, 0);
  }

  return {p, periodKey, n: inPeriod.length, amt: sum(inPeriod),
    closedN: closed.length, closedAmt: sum(closed), pendingN: pending.length, pendingAmt: sum(pending),
    noVendorN: noVendor.length, vendorsN, fileMismatch};
}

function activeFilterText(){
  const parts = [];
  if(F.carrier !== 'all') parts.push(`ขนส่ง ${F.carrier}`);
  if(F.bu !== 'all') parts.push(`BU ${F.bu}`);
  if(F.status !== 'all') parts.push(`สถานะ ${({open:'ยังไม่ปิด', breach:'เกิน 48 ชม.', flag:'ข้อมูลน่าสงสัย'})[F.status] || F.status}`);
  if(F.vendor !== 'all') parts.push(`ซับ ${F.vendor === NOVENDOR ? 'ยังไม่ระบุซับ' : F.vendor}`);
  if(F.q.trim()) parts.push(`ค้นหา "${F.q.trim()}"`);
  return parts.length ? parts.join(' · ') : 'ไม่มีตัวกรอง (ดูทุกเคส)';
}

function renderSummaryView(){
  const keys = Array.from({length:SUM_WINDOW}, (_, i) => shiftPeriod(SUM.anchorKey, -i));
  const rows = keys.map(periodSummaryRow);
  const fmtAmt = v => v.toLocaleString('th-TH', {minimumFractionDigits:2});
  document.getElementById('count').textContent =
    `รวม ${rows.reduce((s,r)=>s+r.n,0)} เคส ใน ${SUM_WINDOW} Period ที่แสดง`;

  document.getElementById('summary').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>สรุปราย Period</h3>
        <span class="sp">
          <button type="button" class="sm" id="sumPrev">‹ ย้อนหลัง ${SUM_WINDOW} รอบ</button>
          <button type="button" class="sm" id="sumNow">Period ปัจจุบัน</button>
          <button type="button" class="sm" id="sumNext">ไปข้างหน้า ${SUM_WINDOW} รอบ ›</button></span></div>
      <div class="pbody" style="padding:12px 16px 0">
        <p class="hint" style="margin:0">ตัวกรองตอนนี้: <b>${esc(activeFilterText())}</b> — เปลี่ยนได้จากแถบตัวกรองด้านบนเหมือนหน้าอื่น
          ยกเว้นคอลัมน์ "ไม่ตรงไฟล์" ที่ไม่ถูกกรองตามนี้ เพราะเป็นการตรวจข้อมูลทั้งรอบเทียบไฟล์ขนส่ง ไม่ใช่มุมมองที่เลือกดู
          กดที่แถวเพื่อดูรายละเอียด Period นั้นต่อในหน้า "นำเข้าสรุป Period"</p>
      </div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule);margin-top:12px">
        <table style="min-width:980px"><thead><tr>
          <th>Period</th><th style="text-align:right">จำนวนเคลม</th><th style="text-align:right">ยอดเงินรวม</th>
          <th style="text-align:right">ปิดแล้ว</th><th style="text-align:right">ค้าง (Pending)</th>
          <th style="text-align:right">ซับที่รับ</th><th>ยัง Unmatch</th></tr></thead><tbody>
        ${rows.map(r => `<tr data-sumopen="${esc(r.periodKey)}">
          <td class="mono">${esc(periodLabel(r.p))}</td>
          <td class="r">${r.n}</td>
          <td class="r">${fmtAmt(r.amt)}</td>
          <td class="r">${r.closedN}<span class="sub">${fmtAmt(r.closedAmt)} บาท</span></td>
          <td class="r">${r.pendingN}<span class="sub">${fmtAmt(r.pendingAmt)} บาท</span></td>
          <td class="r">${r.vendorsN} ซับ</td>
          <td>${r.noVendorN ? `<span class="chip warn">ไม่รู้ซับ ${r.noVendorN}</span>` : '<span class="chip ok">รู้ซับครบ</span>'}
            ${r.fileMismatch == null ? '<span class="chip n">ยังไม่ตรวจไฟล์</span>'
              : r.fileMismatch ? `<span class="chip bad">ไม่ตรงไฟล์ ${r.fileMismatch}</span>` : '<span class="chip ok">ตรงไฟล์ครบ</span>'}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;

  document.getElementById('sumPrev').onclick = () => { SUM.anchorKey = shiftPeriod(SUM.anchorKey, -SUM_WINDOW); render(); };
  document.getElementById('sumNext').onclick = () => { SUM.anchorKey = shiftPeriod(SUM.anchorKey, SUM_WINDOW); render(); };
  document.getElementById('sumNow').onclick  = () => { SUM.anchorKey = periodOf(NOW()).key; render(); };
  document.querySelectorAll('#summary [data-sumopen]').forEach(tr => tr.onclick = () => {
    RC.periodKey = tr.dataset.sumopen;
    setView('close');
  });
}

/* ============================================================
   แท็บ "ปิดงาน Period" — รวม 4 ขั้นตอนที่เดิมต้องสลับหน้าไปมา (ยังไม่รู้ซับ →
   รู้ซับ รอยืนยัน → ยืนยันรับแล้ว รอ Memo → ปิด Memo แล้ว) มาไว้หน้าเดียว ยึด "1 Period"
   เป็นศูนย์กลาง เป้าหมายไม่ใช่ปิดให้ครบ 100% แต่ให้รู้สถานะของทุกเคสในรอบชัดเจนว่าติดอยู่ขั้นไหน
   ใช้ RC.periodKey ตัวเดียวกับแท็บ "นำเข้าสรุป Period" (สลับแท็บแล้ว Period ที่เลือกไว้ยังเป็นรอบเดิม)
   ============================================================ */
let PC = {stage:'all'};
const CLOSE_STAGE_TH = {novendor:'ยังไม่รู้ซับ', pending:'รู้ซับ รอยืนยัน', confirm:'ยืนยันรับแล้ว รอ Memo', memo:'ปิด Memo แล้ว'};
const CLOSE_STAGE_CLS = {novendor:'bad', pending:'warn', confirm:'a', memo:'okdark'};
function closeStage(m){
  if(m.status === 'CLOSED' && m.memoNo) return 'memo';
  if(m.status === 'CLOSED') return 'confirm';
  if(m.vendor) return 'pending';
  return 'novendor';
}

/* ข้อมูลไฟล์เทียบยอด (ยอดไม่ตรง/มีแต่ในไฟล์) มีให้ดูเฉพาะตอนที่เพิ่งวาง/ตรวจไฟล์ของ Period นี้ไว้ในเซสชันนี้
   เท่านั้น (เหมือนคอลัมน์ "ยัง Unmatch" ในหน้าสรุปราย Period) — ถ้ายังไม่ตรวจ จะโชว์แค่สถานะระบบล้วน ๆ */
function periodCloseData(periodKey){
  const p = periodFromKey(periodKey);
  const list = CACHE.filter(({m}) => m.t0 && D(m.t0) >= p.start && D(m.t0) < p.end);
  const hasFile = !!(rcRows && rcRowsPeriodKey === periodKey);
  let cmpById = new Map(), fileOnly = [], fileAmtById = new Map();
  if(hasFile){
    const groups = buildReconcileCompare({list});
    for(const g of groups) for(const it of g.items){
      if(it.cmp === 'fileonly'){ fileOnly.push(it); continue; }
      cmpById.set(it.id, it.cmp);
      if(it.fileAmt != null) fileAmtById.set(it.id, it.fileAmt);
    }
  }
  const rows = list.map(x => ({...x, stage:closeStage(x.m),
    cmp: cmpById.get(x.c.id) || null,
    fileAmt: fileAmtById.has(x.c.id) ? fileAmtById.get(x.c.id) : null,
    guess: !x.m.vendor ? bestGuess(x.c) : null}));
  return {p, rows, hasFile, fileOnly};
}

function renderPeriodClose(){
  const D_ = periodCloseData(RC.periodKey);
  const counts = {novendor:0, pending:0, confirm:0, memo:0};
  for(const r of D_.rows) counts[r.stage]++;
  const nMismatch = D_.rows.filter(r => r.cmp === 'mismatch').length;
  const shown = D_.rows.filter(r => PC.stage === 'all' ? true
    : PC.stage === 'mismatch' ? r.cmp === 'mismatch' : r.stage === PC.stage);
  const fmtAmt = v => (v||0).toLocaleString('th-TH', {minimumFractionDigits:2});
  const chip = (key, label, n) => `<button type="button" class="sm ${PC.stage===key?'pri':''}" data-pcstage="${key}">${label} <b>${n}</b></button>`;

  document.getElementById('close').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>ปิดงาน Period (16–15)</h3>
        <span class="sp">
          <button type="button" class="sm" id="pcPrev">‹ Period ก่อนหน้า</button>
          <span class="mono" style="font-size:12.5px">${esc(periodLabel(D_.p))}</span>
          <button type="button" class="sm" id="pcNext">Period ถัดไป ›</button>
          <button type="button" class="sm" id="pcNow">Period ปัจจุบัน</button></span></div>
      <div class="pbody" style="padding:12px 16px">
        <p class="hint" style="margin:0">เป้าหมายของหน้านี้คือรู้สถานะของทุกเคสในรอบให้ครบ ไม่จำเป็นต้องปิดให้หมด 100%
          เคสที่ยังไม่จบค้างข้ามไปรอบถัดไปได้ตามจริง — ${D_.hasFile
            ? `ตรวจไฟล์ Period นี้ไว้แล้วในเซสชันนี้ จึงเห็นคอลัมน์ยอดไฟล์/ผลตรวจด้วย`
            : `ยังไม่ได้ตรวจไฟล์สรุป Period นี้ในเซสชันนี้ — ไปวาง/ตรวจไฟล์ที่แท็บ "นำเข้าสรุป Period" ก่อน
               ถ้าอยากเห็นว่ายอดตรงไฟล์ขนส่งไหม`}</p>
      </div>
      <div class="pbody" style="padding:0 16px 14px">
        <div class="actions" style="margin:0;flex-wrap:wrap">
          ${chip('all','ทั้งหมด',D_.rows.length)}
          ${chip('novendor',CLOSE_STAGE_TH.novendor,counts.novendor)}
          ${chip('pending',CLOSE_STAGE_TH.pending,counts.pending)}
          ${chip('confirm',CLOSE_STAGE_TH.confirm,counts.confirm)}
          ${chip('memo',CLOSE_STAGE_TH.memo,counts.memo)}
          ${D_.hasFile ? chip('mismatch','ยอดไม่ตรงไฟล์',nMismatch) : ''}
        </div>
      </div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule)">
        <table style="min-width:${D_.hasFile?1100:820}px"><thead><tr>
          <th style="width:30px"></th><th>เลขเคลม</th><th>ซับ</th>
          <th style="text-align:right">ยอดระบบ</th>
          ${D_.hasFile ? '<th style="text-align:right">ยอดไฟล์</th><th>ผลตรวจ</th>' : ''}
          <th>สถานะ</th><th></th></tr></thead><tbody>
        ${shown.length ? shown.map(r => { const pickable = r.m.status === 'OPEN' || (r.m.status === 'CLOSED' && !r.m.memoNo);
          return `<tr style="cursor:default">
          <td onclick="event.stopPropagation()">${pickable
            ? `<input type="checkbox" class="pcPick" data-id="${esc(r.c.id)}" ${boardSelect.has(r.c.id)?'checked':''}>` : ''}</td>
          <td class="mono">${esc(r.c.id)}</td>
          <td>${r.m.vendor ? esc(r.m.vendor)
              : r.guess ? `<span class="chip a">${esc(r.guess.vendor)}?</span><span class="sub">${esc(r.guess.why)}</span>`
              : '<span class="chip bad">ไม่มีเบาะแส</span>'}</td>
          <td class="r">${r.c.amount?fmtAmt(r.c.amount):'—'}</td>
          ${D_.hasFile ? `<td class="r">${r.fileAmt!=null?fmtAmt(r.fileAmt):'—'}</td>
            <td>${r.cmp==='mismatch' ? '<span class="chip bad">ไม่ตรงกัน</span>'
                : r.cmp==='match' ? '<span class="chip ok">ตรงกัน</span>'
                : '<span class="chip n">ไม่มีในไฟล์</span>'}</td>` : ''}
          <td><span class="chip ${CLOSE_STAGE_CLS[r.stage]}">${CLOSE_STAGE_TH[r.stage]}</span></td>
          <td><button type="button" class="sm gh" data-pcopen="${esc(r.c.id)}">เปิด</button></td>
        </tr>`; }).join('') : `<tr><td colspan="${D_.hasFile?8:6}" class="empty">ไม่มีเคสในหมวดนี้</td></tr>`}
        </tbody></table>
      </div>
      ${D_.hasFile && D_.fileOnly.length ? `<div class="pbody" style="padding:0 16px 14px">
        <div class="warnbox"><b>มีในไฟล์แต่ยังไม่คีย์เข้าระบบเลย ${D_.fileOnly.length} รายการ</b> —
          ${D_.fileOnly.map(x => esc(x.id)).join(' · ')}<br>
          ไปนำเข้าที่แท็บ "นำเข้าสรุป Period" ได้เลย</div>
      </div>` : ''}
    </div>`;

  document.getElementById('pcPrev').onclick = () => { RC.periodKey = shiftPeriod(RC.periodKey, -1); render(); };
  document.getElementById('pcNext').onclick = () => { RC.periodKey = shiftPeriod(RC.periodKey, 1); render(); };
  document.getElementById('pcNow').onclick  = () => { RC.periodKey = periodOf(NOW()).key; render(); };
  document.querySelectorAll('[data-pcstage]').forEach(b => b.onclick = () => { PC.stage = b.dataset.pcstage; render(); });
  document.querySelectorAll('[data-pcopen]').forEach(b => b.onclick = () => openCase(b.dataset.pcopen));
  document.querySelectorAll('.pcPick').forEach(cb => cb.onchange = () => {
    if(cb.checked) boardSelect.add(cb.dataset.id); else boardSelect.delete(cb.dataset.id);
    renderMemoBar();
  });
}
