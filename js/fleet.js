/* ============================================================
   fleet.js — ทะเบียนรถ ↔ ซับ ↔ BU  และการนำเข้าทะเบียนทีละหลายคัน
   เก็บแยกกันสี่ชั้น เรียงตามความน่าเชื่อถือ (ห้ามสลับ ห้ามเขียนทับกันเอง):
     1 confirmed  ซับที่ตอบรับเคลมจริงของทะเบียนคันนี้   ← หลักฐาน
     2 viaDriver  ซับที่ พขร. คนนี้เคยวิ่งให้ในเคสอื่น    ← หลักฐานทางอ้อม
     3 roster     รายชื่อรถที่ซับแจ้งไว้ (ไฟล์อ้างอิง)    ← คำกล่าวอ้าง หนึ่งคันมีได้หลายซับ
     4 primary    ซับสัมปทานหลักตามสัญญา (ผู้ใช้ตั้งเอง)  ← ไม่ใช่หลักฐาน
   สี่ค่านี้ไม่ตรงกันได้ เพราะวันเกิดเหตุอาจเป็นรถของอีกรายวิ่งแทน
   ระบบไม่เดาแทนคนและไม่เขียนทับให้เอง — แค่บอกว่ารู้มาจากไหนและตรงกันหรือเปล่า
   ============================================================ */
const TSTATE = {
  CONFIRMED:{th:'ยืนยันเจ้าของแล้ว', cls:'ok'},
  CONFLICT:{th:'เคยถูกปฏิเสธผิดซับ', cls:'warn'},
  SPLIT:{th:'มีมากกว่าหนึ่งซับรับ', cls:'warn'},
  REJECTED_ONLY:{th:'ถูกปฏิเสธ ยังไม่มีใครรับ', cls:'bad'},
  VIA_DRIVER:{th:'เดาจากชื่อ พขร.', cls:'a'},
  VIA_ROSTER:{th:'มีในรายชื่อรถของซับ', cls:'a'},
  ROSTER_MANY:{th:'อยู่ในรายชื่อหลายซับ', cls:'warn'},
  UNKNOWN:{th:'ยังไม่ยืนยัน', cls:'n'},
};
let fleetFilter = 'all', fleetBU = 'all', importRows = null, importMode = 'primary', importOpen = false;
let vendorFix = {};   /* ชื่อซับในไฟล์ -> รหัสซับจริง ที่ผู้ใช้จับคู่เอง */

/* ---------- อ่านทะเบียนไทยออกจากข้อความที่มีชื่อจังหวัดปนมา ----------
   "1ฒก-3720 กรุงเทพมหานคร" -> "1ฒก-3720"
   "ผษ-1921 ลำปาง"          -> "ผษ-1921"
   "1ฒท-8251 ก รุงเทพมหานคร" -> "1ฒท-8251"   (เว้นวรรคผิดที่ก็ยังอ่านออก)
   "71-4708"                -> "71-4708"                                   */
const PLATE_RE = /(\d{0,2}\s*[ก-ฮ]{1,3}\s*[-–—]?\s*\d{1,4})|(\d{1,3}\s*[-–—]\s*\d{2,4})/;
function readPlate(raw){
  const t = String(raw || '').normalize('NFC').replace(/\u00a0/g, ' ').trim();
  if(!t) return {plate:'', rest:''};
  const m = PLATE_RE.exec(t);
  if(!m) return {plate:'', rest:t};
  const hit = m[0].replace(/\s+/g, '');
  return {plate:hit, rest:(t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).trim()};
}
const looksPlate = v => !!readPlate(v).plate;

/* ---------- เดาว่าคอลัมน์ไหนคืออะไร โดยดูจากเนื้อข้อมูลจริง ----------
   ไฟล์จากซับแต่ละรายเรียงคอลัมน์ไม่เหมือนกัน จึงไม่ยึดตำแหน่งตายตัว */
function detectCols(rows){
  const n = Math.max(...rows.map(r => r.length));
  const sample = rows.slice(0, 200);
  const bus = buList().map(b => b.toUpperCase());
  const score = Array.from({length:n}, () => ({plate:0, vendor:0, bu:0, num:0, thai:0, fill:0}));
  for(const r of sample){
    for(let i = 0; i < n; i++){
      const v = String(r[i] || '').trim();
      if(!v) continue;
      const c = score[i]; c.fill++;
      if(looksPlate(v)) c.plate++;
      if(bus.includes(v.toUpperCase()) || /^[A-Z]{2,5}$/.test(v)) c.bu++;
      if(/^[\d,.]+$/.test(v)) c.num++;
      if(/[ก-๙]/.test(v)) c.thai++;
      if(vendorMatch(v) || /(บจ|บจก|หจก|บริษัท|ทรานสปอร|โลจิสติก|ลอจิสติก|ขนส่ง|transport|logistic)/i.test(v))
        c.vendor++;
    }
  }
  const pick = (key, taken) => {
    let best = -1, bs = 0;
    for(let i = 0; i < n; i++){
      if(taken.includes(i) || !score[i].fill) continue;
      const s = score[i][key] / score[i].fill;
      if(s > bs){ bs = s; best = i; }
    }
    return bs >= 0.5 ? best : -1;
  };
  const taken = [];
  const plate = pick('plate', taken);  if(plate >= 0) taken.push(plate);
  const vendor = pick('vendor', taken); if(vendor >= 0) taken.push(vendor);
  const bu = pick('bu', taken);        if(bu >= 0) taken.push(bu);
  const num = pick('num', taken);      if(num >= 0) taken.push(num);
  const driver = pick('thai', taken);  if(driver >= 0) taken.push(driver);
  return {plate, vendor, bu, num, driver};
}


function buList(){
  const set = new Set(S.settings.bus || []);
  for(const t of Object.values(S.trucks)) if(t.bu) set.add(t.bu);
  return [...set].sort();
}

/* คำนวณครั้งเดียวต่อการวาดหน้าจอหนึ่งรอบ — recompute() เป็นคนล้างแคชให้
   ถ้าไม่แคช ทะเบียน 700+ คัน คูณจำนวนเคสที่ต้องเดาเจ้าของ จะช้าจนสังเกตได้ */
let _fleetCache = null;
function bustFleet(){ _fleetCache = null; }
function buildFleet(){
  if(_fleetCache) return _fleetCache;
  return _fleetCache = buildFleetNow();
}
function buildFleetNow(){
  const F2 = new Map();
  /* เริ่มจากทะเบียนที่บันทึกไว้ในระบบ (รวมที่นำเข้าเองแม้ยังไม่มีเคส) */
  for(const t of Object.values(S.trucks)){
    F2.set(t.key, {key:t.key, display:t.plate || t.key, drivers:new Set(t.drivers||[]),
      spellings:new Set([t.plate || t.key]), cases:[], accept:{}, reject:{}, sent:{}, last:null,
      primary:t.primary || null, bu:t.bu || '', note:t.note || '',
      roster:[...(t.roster || [])], rosterNote:t.rosterNote || ''});
  }
  for(const {c, m} of CACHE){
    for(const raw of splitPlates(c.truck)){
      const k = plateKey(raw);
      if(!k) continue;
      let t = F2.get(k);
      if(!t){ t = {key:k, display:raw, drivers:new Set(), spellings:new Set(), cases:[],
                   accept:{}, reject:{}, sent:{}, last:null, primary:null, bu:'', note:'',
                   roster:[], rosterNote:''}; F2.set(k, t); }
      if(raw.length > t.display.length) t.display = raw;
      t.spellings.add(raw);
      if(c.driver) c.driver.split('/').forEach(d => d.trim() && t.drivers.add(d.trim()));
      t.cases.push({c, m});
      if(m.t0 && (!t.last || m.t0 > t.last)) t.last = m.t0;
      if(!t.bu) t.bu = c.carrier === 'DHL' ? 'MKM' : 'CDC';
      for(const lg of m.legs){
        if(!lg.vendor) continue;
        t.sent[lg.vendor] = (t.sent[lg.vendor]||0) + 1;
        if(lg.result === 'ACCEPT') t.accept[lg.vendor] = (t.accept[lg.vendor]||0) + 1;
        else if(lg.result === 'REJECT' || lg.result === 'REJECT_FINAL') t.reject[lg.vendor] = (t.reject[lg.vendor]||0) + 1;
      }
    }
  }
  for(const t of F2.values()){
    const acc = Object.entries(t.accept).sort((a,b) => b[1]-a[1]);
    t.confirmed = acc.length ? acc[0][0] : null;
    t.rejectedBy = Object.keys(t.reject);
    t.openCount = t.cases.filter(x => x.m.status === 'OPEN').length;
    /* กุญแจดอกที่สอง: ถ้าทะเบียนยังยืนยันไม่ได้ ลองถามจากชื่อ พขร. ที่เคยขับคันนี้ */
    t.viaDriver = t.confirmed ? null : vendorFromDrivers([...t.drivers]);
    t.dupNames  = dupDriverNames(t.drivers);   /* ชื่อคนขับที่พิมพ์สองแบบในคันเดียวกัน */
    /* กุญแจดอกที่สาม: รายชื่อรถที่ซับแจ้งไว้ — ชี้ได้ก็ต่อเมื่อมีซับเดียวในรายชื่อ */
    t.rosterPick = t.roster.length === 1 ? t.roster[0] : null;
    /* ไฟล์อ้างอิงขัดกับหลักฐานจริงไหม — ใช้ตรวจความถูกต้องของไฟล์ที่ซับส่งมา */
    const proven = t.confirmed || (t.viaDriver && t.viaDriver.vendor) || null;
    t.rosterConflict = !!(proven && t.roster.length && !t.roster.includes(proven));
    if(acc.length > 1) t.state = 'SPLIT';
    else if(t.confirmed && t.rejectedBy.some(v => v !== t.confirmed)) t.state = 'CONFLICT';
    else if(t.confirmed) t.state = 'CONFIRMED';
    else if(t.viaDriver) t.state = 'VIA_DRIVER';
    else if(t.rosterPick) t.state = 'VIA_ROSTER';
    else if(t.roster.length > 1) t.state = 'ROSTER_MANY';
    else if(t.rejectedBy.length) t.state = 'REJECTED_ONLY';
    else t.state = 'UNKNOWN';
    /* ซับที่ระบบเชื่อว่าใช่ พร้อมบอกว่ารู้มาจากไหน */
    t.best   = t.confirmed || (t.viaDriver && t.viaDriver.vendor) || t.rosterPick || t.primary || null;
    t.bestBy = t.confirmed ? 'plate' : t.viaDriver ? 'driver'
             : t.rosterPick ? 'roster' : t.primary ? 'primary' : null;
    t.mismatch = !!(t.primary && t.confirmed && t.primary !== t.confirmed);
  }
  return [...F2.values()];
}

function renderFleet(){
  const all = buildFleet();
  const list = all.filter(t => {
    if(fleetBU !== 'all' && t.bu !== fleetBU) return false;
    if(F.carrier !== 'all' && t.cases.length && !t.cases.some(x => x.c.carrier === F.carrier)) return false;
    /* กรอง "(ยังไม่ระบุซับ)" ให้เห็นเฉพาะทะเบียนที่ยังไม่มีเบาะแสว่าเป็นของใคร */
    if(F.vendor === NOVENDOR){ if(t.best || t.roster.length) return false; }
    else if(F.vendor !== 'all' && !(t.confirmed === F.vendor || t.primary === F.vendor
       || (t.viaDriver && t.viaDriver.vendor === F.vendor) || t.sent[F.vendor])) return false;
    if(F.q){
      const q = F.q.trim().toLowerCase();
      if(![t.display, [...t.drivers].join(' '), t.confirmed, t.primary, t.bu,
           t.roster.join(' ')].join(' ').toLowerCase().includes(q)) return false;
    }
    if(fleetFilter === 'conflict' && !(t.state === 'CONFLICT' || t.state === 'SPLIT' || t.mismatch)) return false;
    if(fleetFilter === 'unknown'  && t.state !== 'UNKNOWN') return false;
    if(fleetFilter === 'viadriver'&& t.state !== 'VIA_DRIVER') return false;
    if(fleetFilter === 'roster'   && !(t.state === 'VIA_ROSTER' || t.state === 'ROSTER_MANY')) return false;
    if(fleetFilter === 'rosterbad'&& !t.rosterConflict) return false;
    if(fleetFilter === 'noclue'   && (t.best || t.roster.length)) return false;
    if(fleetFilter === 'confirmed'&& t.state !== 'CONFIRMED') return false;
    if(fleetFilter === 'noprimary'&& t.primary) return false;
    return true;
  }).sort((a,b) => {
    const r = t => (t.state === 'CONFLICT' || t.mismatch) ? 0 : t.state === 'SPLIT' ? 1
                 : t.state === 'REJECTED_ONLY' ? 2 : t.state === 'UNKNOWN' ? 3 : 4;
    return r(a) - r(b) || b.cases.length - a.cases.length;
  });
  document.getElementById('count').textContent = `${list.length} ทะเบียน`;

  const byBU = {};
  for(const t of all){ const b = t.bu || '—'; (byBU[b] ||= {n:0, pri:0}); byBU[b].n++; if(t.primary) byBU[b].pri++; }
  const nConf = all.filter(t => t.state === 'CONFIRMED').length;
  const nBad  = all.filter(t => t.state === 'CONFLICT' || t.state === 'SPLIT' || t.mismatch).length;
  const nUnk  = all.filter(t => t.state === 'UNKNOWN').length;
  const nVia  = all.filter(t => t.state === 'VIA_DRIVER').length;
  const nDup  = all.filter(t => t.dupNames.length).length;
  const nRost = all.filter(t => t.roster.length).length;
  const nRBad = all.filter(t => t.rosterConflict).length;
  const nNone = all.filter(t => !t.best && !t.roster.length).length;

  document.getElementById('fleet').innerHTML = `
    <div class="totrow">
      <div class="tot"><div class="tk">ทะเบียนทั้งหมด</div><div class="tv">${all.length}</div>
        <div class="tn">${Object.entries(byBU).map(([b,v])=>`${esc(b)} ${v.n}`).join(' · ')}</div></div>
      <div class="tot"><div class="tk">ยืนยันเจ้าของแล้ว</div><div class="tv ok">${nConf}</div>
        <div class="tn">ซับตอบรับเคลมจริง</div></div>
      <div class="tot"><div class="tk">ต้องตรวจสอบ</div><div class="tv bad">${nBad}</div>
        <div class="tn">ส่งผิดซับ หรือมีหลายซับรับ</div></div>
      <div class="tot"><div class="tk">เดาได้จากชื่อ พขร.</div><div class="tv">${nVia}</div>
        <div class="tn">ทะเบียนยังไม่ตอบ แต่คนขับเคยวิ่งให้ซับเดียว</div></div>
      <div class="tot"><div class="tk">ชื่อ พขร. พิมพ์ซ้อน</div><div class="tv ${nDup?'warn':''}">${nDup}</div>
        <div class="tn">คันเดียวกันมีชื่อคล้ายกันหลายแบบ</div></div>
      <div class="tot"><div class="tk">มีในรายชื่อรถของซับ</div><div class="tv">${nRost}</div>
        <div class="tn">${nRBad?`<span style="color:var(--bad)">ขัดกับผลจริง ${nRBad}</span>`:'จากไฟล์อ้างอิงที่นำเข้า'}</div></div>
      <div class="tot"><div class="tk">ยังไม่มีเบาะแสเลย</div><div class="tv ${nNone?'bad':''}">${nNone}</div>
        <div class="tn">ไม่มีทั้งผลตอบ ชื่อ พขร. และรายชื่อซับ</div></div>
      <div class="tot"><div class="tk">ยังไม่ยืนยัน</div><div class="tv">${nUnk}</div>
        <div class="tn">ยังไม่มีซับไหนตอบ</div></div>
      <div class="tot"><div class="tk">ตั้งซับหลักแล้ว</div><div class="tv">${all.filter(t=>t.primary).length}</div>
        <div class="tn">จาก ${all.length} ทะเบียน</div></div>
    </div>

    <div class="panel">
      <div class="phead">
        <h3>ทะเบียนรถ ↔ ซับ</h3>
        <div class="seg" id="fleetSeg">
          <button data-f="all" aria-pressed="${fleetFilter==='all'}">ทั้งหมด</button>
          <button data-f="conflict" aria-pressed="${fleetFilter==='conflict'}">ต้องตรวจสอบ</button>
          <button data-f="confirmed" aria-pressed="${fleetFilter==='confirmed'}">ยืนยันแล้ว</button>
          <button data-f="viadriver" aria-pressed="${fleetFilter==='viadriver'}">เดาจากชื่อ พขร.</button>
          <button data-f="roster" aria-pressed="${fleetFilter==='roster'}">จากรายชื่อซับ</button>
          <button data-f="rosterbad" aria-pressed="${fleetFilter==='rosterbad'}">รายชื่อซับขัดกับผลจริง</button>
          <button data-f="noclue" aria-pressed="${fleetFilter==='noclue'}">ไม่มีเบาะแสเลย</button>
          <button data-f="unknown" aria-pressed="${fleetFilter==='unknown'}">ยังไม่ยืนยัน</button>
          <button data-f="noprimary" aria-pressed="${fleetFilter==='noprimary'}">ยังไม่ตั้งซับหลัก</button>
        </div>
        <div class="seg" id="fleetBUSeg">
          <button data-b="all" aria-pressed="${fleetBU==='all'}">ทุก BU</button>
          ${buList().map(b=>`<button data-b="${esc(b)}" aria-pressed="${fleetBU===b}">${esc(b)}</button>`).join('')}
        </div>
        <span class="sp">
          <button type="button" class="sm" id="fAuto">ตั้งซับหลักตามผลที่ยืนยัน</button>
          <button type="button" class="sm" id="fExport">ส่งออก (${list.length})</button>
          <button type="button" class="sm pri" id="fImportBtn">นำเข้าทะเบียน</button></span>
      </div>
      <div class="tw" style="border:0">
        <table style="min-width:1120px"><thead><tr>
          <th>ทะเบียน</th><th>BU</th><th>พขร.</th><th>ซับหลัก (สัมปทาน)</th><th>ซับที่ยืนยันจากผลตอบ</th><th>รายชื่อรถของซับ</th><th>รู้มาจาก</th>
          <th>เคยปฏิเสธ</th><th style="text-align:right">เคส</th><th>สถานะ</th>
        </tr></thead><tbody>
        ${list.length ? list.map(t => `<tr data-t="${esc(t.key)}">
          <td class="id">${esc(t.display)}${t.spellings.size>1?`<span class="sub">เขียนต่างกัน ${t.spellings.size} แบบ</span>`:''}</td>
          <td>${t.bu ? `<span class="bu">${esc(t.bu)}</span>` : '<span style="color:var(--faint)">—</span>'}</td>
          <td>${esc([...t.drivers].join(', ')||'—')}${t.dupNames.length
              ? ` <span class="chip warn" title="${esc(t.dupNames.map(x=>x.join(' / ')).join(' · '))}">ชื่อคล้ายกัน</span>` : ''}</td>
          <td>${t.primary ? esc(t.primary) : '<span style="color:var(--faint)">ยังไม่ตั้ง</span>'}</td>
          <td>${t.confirmed
              ? `<b>${esc(t.confirmed)}</b>${t.mismatch?' <span class="chip bad">ไม่ตรงซับหลัก</span>':''}`
              : (t.viaDriver ? `<span style="color:var(--accent)">${esc(t.viaDriver.vendor)}</span>`
                             : '<span style="color:var(--faint)">—</span>')}</td>
          <td>${t.roster.length
              ? t.roster.map(v => `<span class="chip ${t.rosterConflict?'bad':'a'}">${esc(v)}</span>`).join(' ')
              : '<span style="color:var(--faint)">—</span>'}</td>
          <td class="sub">${t.confirmed ? 'ทะเบียนคันนี้เอง'
              : t.viaDriver ? `ชื่อ พขร. (${t.viaDriver.n} เคส)`
              : t.rosterPick ? 'รายชื่อรถของซับ'
              : t.roster.length ? `รายชื่อซับ ${t.roster.length} ราย — ต้องเลือกเอง` : '—'}</td>
          <td>${t.rejectedBy.length ? t.rejectedBy.map(v=>`<span class="chip warn">${esc(v)}</span>`).join(' ') : '—'}</td>
          <td class="r">${t.cases.length}${t.openCount?` <span style="color:var(--bad)">(ค้าง ${t.openCount})</span>`:''}</td>
          <td><span class="chip ${TSTATE[t.state].cls}">${TSTATE[t.state].th}</span></td>
        </tr>`).join('') : '<tr><td colspan="10" class="empty">ไม่พบทะเบียนตามเงื่อนไข</td></tr>'}
        </tbody></table>
      </div>
    </div>

    <div class="panel" id="importPanel" ${importRows || importOpen ? '' : 'hidden'}>
      <div class="phead"><h3>นำเข้ารายชื่อทะเบียนรถ</h3>
        <span class="sp"><button type="button" class="sm" id="fTemplate">โหลดไฟล์ตัวอย่าง</button>
        <button type="button" class="sm" id="fImportClose">ปิด</button></span></div>
      <div class="pbody">
        <div class="seg" id="fModeSeg" style="margin-bottom:12px">
          <button data-m="primary" aria-pressed="${importMode==='primary'}">ทะเบียนสัมปทาน (ตั้งซับหลัก)</button>
          <button data-m="roster" aria-pressed="${importMode==='roster'}">รายชื่อรถของซับ (ใช้ตรวจสอบ)</button>
        </div>
        ${importMode === 'primary' ? `
        <p class="hint">วางตารางจาก Excel (Ctrl+V) หรือเลือกไฟล์ CSV — ต้องมี 5 คอลัมน์เรียงตามนี้:
          <b>ทะเบียน · ซับ · BU · ชื่อ พขร. · หมายเหตุ</b> (แถวหัวตารางจะถูกข้ามให้เอง)<br>
          โหมดนี้ <b>ตั้งซับหลักให้</b> ใช้กับไฟล์สัญญาที่รู้แน่ว่าคันไหนของใคร</p>` : `
        <p class="hint">วางตารางจาก Excel (Ctrl+V) ทั้งแผ่นได้เลย <b>ไม่ต้องจัดคอลัมน์ใหม่</b> —
          ระบบหาเองว่าช่องไหนคือทะเบียน ช่องไหนคือชื่อซับ และตัดชื่อจังหวัดที่ติดมากับทะเบียนออกให้<br>
          ชื่อซับที่เขียนไม่ตรงกับทะเบียนกลาง ระบบจะเดาให้ก่อน ถ้ายังไม่แน่ใจจะขึ้นให้เลือกเอง
          แล้ว<b>จำไว้ให้ครั้งหน้า</b><br>
          โหมดนี้ <b>ไม่ตั้งซับหลักและไม่แตะ BU</b> — เก็บไว้เป็นรายชื่ออ้างอิงเฉย ๆ
          <b>ทะเบียนเดียวกันใส่ได้หลายบรรทัด</b> ถ้าอยู่ในรายชื่อของหลายซับ</p>`}
        <textarea class="paste" id="fPaste" placeholder="${importMode==='primary'
          ? '71-4708\tSC\tMKM\tจีรวัฒน์\tรถประจำสาย 148'
          : '71-4708\tSC&#10;71-4708\tDoitung&#10;70-0705\tParamee'}"></textarea>
        <div class="actions" style="margin-top:10px">
          <label class="btn-file"><input type="file" id="fFile" accept=".csv,text/csv,text/plain" hidden>
            <button type="button" class="sm" id="fPick">เลือกไฟล์ CSV</button></label>
          <button type="button" class="pri" id="fCheck">ตรวจข้อมูล</button>
        </div>
        <div id="fPreview"></div>
      </div>
    </div>

    <div class="note" style="border:1px solid var(--rule);border-left:3px solid var(--accent);
      background:var(--surface);padding:14px 18px;margin:0">
      <b style="font-family:'Bai Jamjuree',sans-serif">ทำไมช่องนี้มีสองคอลัมน์</b>
      <p style="margin:5px 0 0;font-size:14px;color:var(--muted)">“ซับหลัก” คือรายที่ถือสัมปทานทะเบียนนั้นตามสัญญา ส่วน “ซับที่ยืนยันจากผลตอบ” คือรายที่ตอบรับเคลมจริงในเคสที่ผ่านมา — สองค่านี้ไม่ตรงกันได้เพราะวันที่เกิดเหตุอาจเป็นรถของอีกรายวิ่งแทน ระบบจึงไม่ทับค่าให้เอง แต่จะติดป้าย “ไม่ตรงซับหลัก” ไว้ให้ตัดสินใจ</p>
      <p style="margin:8px 0 0;font-size:14px;color:var(--muted)">ทะเบียนที่ยังไม่มีซับไหนตอบ ระบบจะลองถามจาก<b>ชื่อพนักงานขับรถ</b>ให้อีกทาง — ถ้าคนขับคนนั้นเคยมีเคสที่ซับเดียวรับเคลม ก็จะขึ้นชื่อซับนั้นเป็นตัวเอียงพร้อมบอกว่ารู้มาจากไหน ค่านี้เป็นแค่การเดา ปุ่ม “ตั้งซับหลักตามผลที่ยืนยัน” จะไม่หยิบไปตั้งให้</p>
      <p style="margin:8px 0 0;font-size:14px;color:var(--muted)">ถ้ายังไม่รู้อีก ระบบจะดู<b>รายชื่อรถของซับ</b>ที่นำเข้าไว้เป็นทางสุดท้าย — ทะเบียนคันเดียวอยู่ได้หลายรายชื่อ ถ้าเจอรายเดียวจะเสนอชื่อนั้นให้ ถ้าเจอหลายรายจะขึ้นให้ครบแล้วให้เลือกเอง ไม่เดาแทน และถ้ารายชื่อขัดกับผลตอบจริง ระบบจะติดธงแดงให้ตรวจ เพราะแปลว่าไฟล์ที่ซับส่งมาอาจไม่ตรงกับความจริง</p>
    </div>`;

  document.querySelectorAll('#fleetSeg button').forEach(b => b.onclick = () => { fleetFilter = b.dataset.f; render(); });
  document.querySelectorAll('#fleetBUSeg button').forEach(b => b.onclick = () => { fleetBU = b.dataset.b; render(); });
  document.querySelectorAll('#fleet tr[data-t]').forEach(tr => tr.onclick = () => openTruck(tr.dataset.t));

  document.getElementById('fAuto').onclick = async () => {
    const rows = all.filter(t => t.confirmed && !t.primary)
      .map(t => ({key:t.key, plate:t.display, primary:t.confirmed, bu:t.bu, drivers:[...t.drivers], note:t.note}));
    if(!rows.length){ toast('ไม่มีทะเบียนที่ตั้งเพิ่มได้'); return; }
    await API.importTrucks(rows);
    await pullState(); render();
    const skipped = all.filter(t => !t.confirmed && t.viaDriver && !t.primary).length;
    toast(`ตั้งซับหลักให้ ${rows.length} ทะเบียน`
      + (skipped ? ` · ข้าม ${skipped} ทะเบียนที่รู้จากชื่อ พขร. อย่างเดียว ให้ตั้งเองทีละคัน` : ''));
  };
  document.getElementById('fExport').onclick = () => {
    const rows = [['ทะเบียน','ซับหลัก','BU','ชื่อ พขร.','หมายเหตุ','ซับที่ยืนยันจากผลตอบ','เคยปฏิเสธโดย',
                   'เคสทั้งหมด','เคสค้าง','สถานะ','ไม่ตรงซับหลัก','เคสล่าสุด','การเขียนแบบอื่น']];
    for(const t of list) rows.push([t.display, t.primary||'', t.bu||'', [...t.drivers].join(', '), t.note||'',
      t.confirmed||'', t.rejectedBy.join(', '), t.cases.length, t.openCount, TSTATE[t.state].th,
      t.mismatch?'ใช่':'', t.last?fmt(t.last,true):'', [...t.spellings].join(' | ')]);
    download(`claim-trucks-${stamp()}.csv`, csv(rows));
  };
  document.getElementById('fImportBtn').onclick = () => {
    importOpen = true;
    const p = document.getElementById('importPanel');
    p.hidden = false; p.scrollIntoView({block:'center'});
    document.getElementById('fPaste').focus();
  };
  document.getElementById('fImportClose').onclick = () => { importRows = null; importOpen = false; render(); };
  document.querySelectorAll('#fModeSeg button').forEach(b => b.onclick = () => {
    importMode = b.dataset.m; importRows = null; importOpen = true; render();
    setTimeout(() => {
      const el = document.getElementById('fPaste');
      if(el){ el.focus(); document.getElementById('importPanel').scrollIntoView({block:'center'}); }
    }, 30);
  });
  document.getElementById('fTemplate').onclick = () => importMode === 'roster'
    ? download('template-รายชื่อรถของซับ.csv',
        csv([['ทะเบียน','ซับ','หมายเหตุ'],
             ['71-4708','SC','ทะเบียนเดียวกันใส่ได้หลายบรรทัด'],
             ['71-4708','Doitung','ถ้าอยู่ในรายชื่อของหลายซับ'],
             ['70-0705','Paramee','']]))
    : download('template-ทะเบียนรถ.csv',
        csv([['ทะเบียน','ซับ','BU','ชื่อ พขร.','หมายเหตุ'],
             ['71-4708','SC','MKM','จีรวัฒน์','รถประจำสาย 148'],
             ['2ฒต-8542','DMT','CDC','เจนภพ','']]));
  document.getElementById('fPick').onclick = () => document.getElementById('fFile').click();
  document.getElementById('fFile').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => { document.getElementById('fPaste').value = String(r.result).replace(/^﻿/, ''); checkImport(); };
    r.readAsText(f, 'utf-8');
  };
  document.getElementById('fCheck').onclick = checkImport;
  if(importRows) showPreview();
}

/* ---------- ตรวจข้อมูลก่อนนำเข้า ---------- */
function checkImport(){
  const raw = parseTable(document.getElementById('fPaste').value);
  if(!raw.length){ toast('ยังไม่มีข้อมูลให้ตรวจ'); return; }
  const head = raw[0].join(' ').toLowerCase();
  const rows = /ทะเบียน|plate/.test(head) ? raw.slice(1) : raw;
  importRows = importMode === 'roster' ? parseRoster(rows) : parsePrimary(rows);
  showPreview();
}

/* โหมดที่ 1 — ไฟล์สัญญา รู้แน่ว่าคันไหนของใคร หนึ่งทะเบียนหนึ่งบรรทัด */
function parsePrimary(rows){
  const seen = new Set();
  return rows.map((r, i) => {
    const [rawPlate, vendor, bu, driver, note] = r;
    const {plate, rest} = readPlate(rawPlate);
    const key = plate ? plateKey(plate) : '';
    const out = {n:i+1, plate, province:rest, key, bu:(bu||'').trim().toUpperCase(),
                 driver:(driver||'').trim(), note:(note||'').trim(),
                 vendorRaw:(vendor||'').trim(), primary:null, status:'ok', msg:''};
    if(!key){ out.status = 'skip'; out.msg = 'อ่านทะเบียนจากช่องนี้ไม่ออก'; return out; }
    if(seen.has(key)){ out.status = 'skip'; out.msg = 'ทะเบียนซ้ำในไฟล์ที่วางมา'; return out; }
    seen.add(key);
    if(out.vendorRaw){
      const m = vendorMatch(out.vendorRaw);
      if(m && m.score >= 90) out.primary = m.v.code;
      else if(m){ out.primary = m.v.code; out.status = 'warn';
                  out.msg = `เดาว่าเป็น ${m.v.code} (${m.why}) — ตรวจก่อนนำเข้า`; }
      else { out.status = 'warn'; out.msg = `ไม่รู้จักซับ “${out.vendorRaw}” — จะนำเข้าโดยยังไม่ตั้งซับหลัก`; }
    }
    if(out.bu && !buList().includes(out.bu)){ out.status = out.status === 'ok' ? 'warn' : out.status;
      out.msg = (out.msg ? out.msg + ' · ' : '') + `BU “${out.bu}” เป็นค่าใหม่ จะถูกเพิ่มให้`; }
    if(S.trucks[key]) out.msg = (out.msg ? out.msg + ' · ' : '') + 'มีอยู่แล้ว จะอัปเดตทับ';
    return out;
  });
}

/* โหมดที่ 2 — รายชื่อรถที่ซับแจ้งไว้ ทะเบียนเดียวกันมีได้หลายซับ
   ไม่ตั้งซับหลัก ไม่แตะ BU และเทียบกับผลตอบจริงให้ด้วยว่าขัดกันไหม
   อ่านคอลัมน์เองจากเนื้อข้อมูล และตัดชื่อจังหวัดออกจากช่องทะเบียนให้ */
function parseRoster(rows){
  const col = detectCols(rows);
  if(col.plate < 0 || col.vendor < 0){
    toast('อ่านไฟล์ไม่ออก — ต้องมีคอลัมน์ทะเบียนและคอลัมน์ชื่อซับอย่างน้อยสองช่อง');
    return [];
  }
  const fleet = buildFleet();
  const byKey = new Map(fleet.map(t => [t.key, t]));
  const seen = new Set();

  return rows.map((r, i) => {
    const rawPlate  = String(r[col.plate]  || '').trim();
    const rawVendor = String(r[col.vendor] || '').trim();
    const {plate, rest} = readPlate(rawPlate);
    const out = {n:i+1, mode:'roster', rawPlate, plate, province:rest,
                 key:plate ? plateKey(plate) : '',
                 vendorRaw:rawVendor, vendor:null, guess:null,
                 bu:col.bu >= 0 ? String(r[col.bu] || '').trim().toUpperCase() : '',
                 driver:col.driver >= 0 ? String(r[col.driver] || '').trim() : '',
                 trips:col.num >= 0 ? String(r[col.num] || '').trim() : '',
                 status:'ok', msg:''};

    if(!out.key){ out.status = 'skip'; out.msg = 'อ่านทะเบียนจากช่องนี้ไม่ออก'; return out; }
    if(!rawVendor){ out.status = 'skip'; out.msg = 'ไม่มีชื่อซับ'; return out; }

    /* 1) ผู้ใช้เคยจับคู่ชื่อนี้ไว้แล้วในรอบนี้ */
    const fixed = vendorFix[vkey(rawVendor)];
    if(fixed && S.vendors[fixed]){ out.vendor = fixed; out.byUser = true; out.msg = 'จับคู่ชื่อเอง'; }
    else {
      /* 2) ให้ระบบเทียบกับทะเบียนซับกลางแบบหลวม */
      const m = vendorMatch(rawVendor);
      if(m && m.score >= 90){ out.vendor = m.v.code; out.msg = m.why; }
      else if(m){ out.guess = m; out.status = 'ask';
                  out.msg = `ไม่แน่ใจ — น่าจะเป็น ${m.v.code} (${m.why})`; return out; }
      else { out.status = 'ask'; out.msg = 'ไม่มีชื่อนี้ในทะเบียนซับ — เลือกให้หน่อย'; return out; }
    }

    const pair = out.key + '|' + out.vendor;
    if(seen.has(pair)){ out.status = 'skip'; out.msg = 'บรรทัดซ้ำในไฟล์ที่วางมา'; return out; }
    seen.add(pair);

    const t = byKey.get(out.key);
    if(!t){ out.msg = 'ทะเบียนใหม่ จะเพิ่มเข้าระบบให้'; return out; }
    if((t.roster || []).includes(out.vendor)){ out.status = 'skip'; out.msg = 'มีในรายชื่ออยู่แล้ว'; return out; }

    const proven = t.confirmed || (t.viaDriver && t.viaDriver.vendor);
    if(proven && proven !== out.vendor){
      out.status = 'warn';
      out.msg = `ผลจริงชี้ว่าเป็นของ ${proven} — เก็บไว้แต่ติดธงให้ตรวจ`;
    } else if(proven === out.vendor){
      out.msg = 'ตรงกับผลตอบจริง';
    } else if(t.openCount){
      out.msg = `ทะเบียนนี้มีเคสค้างอยู่ ${t.openCount} เคส — ได้คำตอบเพิ่ม`;
    } else if(t.roster && t.roster.length){
      out.msg = `จะเป็นซับรายที่ ${t.roster.length + 1} ของทะเบียนนี้`;
    }
    return out;
  });
}

/* แผงจับคู่ชื่อซับ — ชื่อในไฟล์ที่ระบบยังไม่มั่นใจ ให้คนเลือกเอง แล้วจำไว้เป็นชื่อพ้อง */
function renderVendorFix(){
  const ask = importRows.filter(r => r.status === 'ask');
  if(!ask.length) return '';
  const uniq = new Map();
  for(const r of ask){
    const k = vkey(r.vendorRaw);
    if(!uniq.has(k)) uniq.set(k, {raw:r.vendorRaw, guess:r.guess, n:0});
    uniq.get(k).n++;
  }
  const opts = vendorList().map(v => v.code);
  return `<div class="warnbox" style="margin-top:14px">
    <b>มีชื่อซับ ${uniq.size} ชื่อที่ยังจับคู่ไม่ได้</b>
    <p style="margin:4px 0 10px;font-size:13.5px">เลือกว่าตรงกับซับรายไหนในทะเบียนกลาง
      หรือกดเพิ่มเป็นซับรายใหม่ — เลือกแล้วระบบจะจำชื่อนี้ไว้ ครั้งหน้านำเข้าจะจับคู่ให้เอง</p>
    <div class="tw" style="background:var(--surface)"><table style="min-width:620px"><tbody>
      ${[...uniq.entries()].map(([k, u]) => `<tr style="cursor:default">
        <td style="width:44%"><b>${esc(u.raw)}</b>
          <span class="sub">${u.n} บรรทัด</span></td>
        <td><select class="vfix" data-k="${esc(k)}">
          <option value="">— ยังไม่เลือก —</option>
          ${opts.map(c => `<option value="${esc(c)}" ${u.guess && u.guess.v.code === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>${u.guess ? `<span class="sub">ระบบเดาว่า ${esc(u.guess.v.code)} · ${esc(u.guess.why)}</span>` : ''}</td>
        <td style="white-space:nowrap"><button type="button" class="sm" data-newv="${esc(k)}"
          data-name="${esc(u.raw)}">เพิ่มเป็นซับใหม่</button></td>
      </tr>`).join('')}
    </tbody></table></div></div>`;
}

function showPreview(){
  const roster = importMode === 'roster';
  const good = importRows.filter(r => r.status !== 'skip' && r.status !== 'ask');
  const ask  = importRows.filter(r => r.status === 'ask');
  const openGain = roster ? countOpenGain(good) : 0;

  document.getElementById('fPreview').innerHTML = `
    ${roster ? renderVendorFix() : ''}
    <div class="tw" style="margin-top:14px"><table style="min-width:${roster?820:720}px"><thead><tr>
      <th>#</th><th>ทะเบียน</th><th>ซับ</th>${roster?'<th>พขร.</th>':'<th>BU</th><th>พขร.</th>'}<th>ผลตรวจ</th></tr></thead><tbody>
      ${importRows.slice(0, 300).map(r => `<tr style="cursor:default">
        <td class="mono">${r.n}</td>
        <td class="mono">${r.plate ? esc(r.plate)
            : `<span style="color:var(--faint)">${esc((r.rawPlate||'').slice(0,28) || '—')}</span>`}${
            r.plate && r.province ? `<span class="sub">ตัด “${esc(r.province)}” ออก</span>` : ''}</td>
        <td>${(roster ? r.vendor : r.primary) ? esc(roster ? r.vendor : r.primary)
              : `<span style="color:var(--faint)">${esc(r.vendorRaw||'—')}</span>`}</td>
        ${roster ? `<td>${esc(r.driver||'—')}</td>`
                 : `<td>${r.bu?`<span class="bu">${esc(r.bu)}</span>`:'—'}</td><td>${esc(r.driver||'—')}</td>`}
        <td>${r.status==='skip' ? `<span class="chip bad">ข้าม — ${esc(r.msg)}</span>`
            : r.status==='ask'  ? `<span class="chip warn">รอจับคู่ชื่อ — ${esc(r.msg)}</span>`
            : r.status==='warn' ? `<span class="chip warn">${esc(r.msg)}</span>`
            : `<span class="chip ok">พร้อมนำเข้า${r.msg?' — '+esc(r.msg):''}</span>`}</td></tr>`).join('')}
    </tbody></table></div>
    ${importRows.length > 300 ? `<p class="hint">แสดง 300 บรรทัดแรกจาก ${importRows.length} — นำเข้าครบทุกบรรทัด</p>` : ''}
    <div class="actions" style="margin-top:12px">
      <button type="button" class="pri" id="fApply" ${good.length?'':'disabled'}>${roster
        ? `เพิ่มเข้ารายชื่ออ้างอิง ${good.length} บรรทัด` : `นำเข้า ${good.length} ทะเบียน`}</button>
      <span class="hint" style="margin:0">
        ${importRows.length - good.length - ask.length} แถวถูกข้าม${ask.length?` · ${ask.length} แถวรอจับคู่ชื่อซับ`:''}
        ${roster && openGain ? ` · <b style="color:var(--ok)">ช่วยตอบเคสค้างได้ ${openGain} เคส</b>` : ''}
        ${roster ? ' · โหมดนี้ไม่ตั้งซับหลักและไม่แตะ BU' : ''}</span></div>`;

  /* จับคู่ชื่อซับ */
  document.querySelectorAll('.vfix').forEach(sel => sel.onchange = () => {
    if(sel.value) vendorFix[sel.dataset.k] = sel.value; else delete vendorFix[sel.dataset.k];
    checkImport();
  });
  document.querySelectorAll('[data-newv]').forEach(b => b.onclick = async () => {
    const name = b.dataset.name;
    const code = prompt('ตั้งรหัสสั้น ๆ ให้ซับรายนี้ (ใช้แสดงในตารางและกราฟ)', suggestCode(name));
    if(!code) return;
    if(S.vendors[code]){ toast('รหัสนี้มีอยู่แล้ว'); return; }
    try{
      await API.putVendor(code, {display:name, aliases:[name], carriers:[], active:true, note:'เพิ่มจากไฟล์รายชื่อรถของซับ'});
      await pullState();
      vendorFix[b.dataset.newv] = code;
      checkImport();
      toast(`เพิ่มซับ ${code} แล้ว`);
    }catch(e){ toast(e.message); }
  });

  const ap = document.getElementById('fApply');
  if(!ap) return;
  ap.onclick = roster ? applyRoster : applyPrimary;

  async function applyPrimary(){
    const rows = good.map(r => ({key:r.key, plate:r.plate, bu:r.bu || undefined,
      primary:r.primary || undefined, drivers:r.driver ? [r.driver] : undefined, note:r.note || undefined}));
    const newBUs = [...new Set(good.map(r => r.bu).filter(b => b && !buList().includes(b)))];
    if(newBUs.length) await API.putSettings({bus:[...new Set([...(S.settings.bus||[]), ...newBUs])]});
    const j = await API.importTrucks(rows);
    importRows = null; importOpen = false;
    await pullState(); render();
    toast(`นำเข้าแล้ว — เพิ่มใหม่ ${j.added} · อัปเดต ${j.updated}`);
  }

  /* รวมชื่อซับเข้าไปในรายชื่อเดิมของแต่ละทะเบียน ไม่ทับของเก่า ไม่แตะ primary/bu */
  async function applyRoster(){
    /* จำชื่อที่จับคู่เองไว้เป็นชื่อพ้อง ครั้งหน้าจะได้ไม่ต้องเลือกซ้ำ */
    const learn = {};
    for(const r of good) if(r.byUser) (learn[r.vendor] ||= new Set()).add(r.vendorRaw);
    for(const [code, names] of Object.entries(learn)){
      const v = S.vendors[code];
      if(!v) continue;
      const aliases = [...new Set([...(v.aliases||[]), ...names])];
      if(aliases.length !== (v.aliases||[]).length) await API.putVendor(code, {...v, aliases});
    }

    const byKey = new Map();
    for(const r of good){
      if(!byKey.has(r.key)){
        const t = S.trucks[r.key];
        byKey.set(r.key, {key:r.key, plate:t ? t.plate : r.plate,
                          roster:[...((t && t.roster) || [])], notes:[]});
      }
      const e = byKey.get(r.key);
      if(!e.roster.includes(r.vendor)) e.roster.push(r.vendor);
      if(r.trips) e.notes.push(`${r.vendor} วิ่ง ${r.trips} ครั้ง`);
    }
    const rows = [...byKey.values()].map(e => ({key:e.key, plate:e.plate, roster:e.roster,
      rosterNote:e.notes.join(' · ') || undefined}));
    await API.importTrucks(rows);
    const bad = good.filter(r => r.status === 'warn').length;
    importRows = null; importOpen = false; vendorFix = {};
    await pullState(); render();
    toast(`เก็บรายชื่ออ้างอิงแล้ว ${rows.length} ทะเบียน`
      + (openGain ? ` · ช่วยตอบเคสค้าง ${openGain} เคส` : '')
      + (bad ? ` · ${bad} บรรทัดขัดกับผลจริง กดปุ่ม “รายชื่อซับขัดกับผลจริง” เพื่อดู` : ''));
  }
}

/* ไฟล์นี้ช่วยตอบเคสที่ยังค้างอยู่ได้กี่เคส — ตอบคำถามว่านำเข้าแล้วได้อะไร */
function countOpenGain(good){
  const fleet = new Map(buildFleet().map(t => [t.key, t]));
  const hit = new Set();
  for(const r of good){
    const t = fleet.get(r.key);
    if(!t || t.confirmed || (t.viaDriver && t.viaDriver.vendor)) continue;
    for(const {c, m} of t.cases) if(m.status === 'OPEN') hit.add(c.id);
  }
  return hit.size;
}

/* ตั้งรหัสสั้นให้ซับใหม่จากชื่อเต็ม */
function suggestCode(name){
  const core = String(name || '').normalize('NFC')
    .replace(VNOISE_EN, ' ').replace(VNOISE_TH, ' ')
    .replace(/[.\-_/()]/g, ' ').trim();
  const latin = core.match(/[A-Za-z]{2,}/);
  if(latin) return latin[0].toUpperCase();
  return core.split(/\s+/)[0] || 'ซับใหม่';
}

function truckHint(c, m){
  const ks = splitPlates(c.truck).map(plateKey).filter(Boolean);
  const t  = ks.length ? buildFleet().find(x => ks.includes(x.key)) : null;

  /* หลักฐานสองทาง: จากทะเบียนคันนี้ และจากชื่อ พขร. ในเคสนี้ */
  const byPlate = t && t.confirmed
    ? {v:t.confirmed, txt:`ทะเบียน ${t.display} เคยได้รับการยืนยันจาก <b>${esc(t.confirmed)}</b> (${t.cases.length} เคส)`}
    : null;
  const dv = vendorFromDrivers(splitDrivers(c.driver));
  const byDriver = dv
    ? {v:dv.vendor, txt:`พขร. ${esc(c.driver)} เคยมี ${dv.n} เคสที่ <b>${esc(dv.vendor)}</b> รับเคลม`}
    : null;
  const byRoster = t && t.rosterPick
    ? {v:t.rosterPick, txt:`รายชื่อรถของซับระบุว่าทะเบียนนี้เป็นของ <b>${esc(t.rosterPick)}</b>`} : null;
  const byPrimary = t && t.primary ? {v:t.primary, txt:`ซับสัมปทานหลักที่ตั้งไว้คือ <b>${esc(t.primary)}</b>`} : null;

  /* ไฟล์อ้างอิงขัดกับผลตอบจริง — ต้องรู้ เพราะแปลว่าไฟล์ที่ซับส่งมาอาจไม่ตรง */
  if(t && t.rosterConflict){
    const proven = t.confirmed || (t.viaDriver && t.viaDriver.vendor);
    return `<div class="warnbox"><b>รายชื่อรถของซับไม่ตรงกับผลจริง:</b><br>
      ไฟล์อ้างอิงบอกว่าทะเบียน ${esc(t.display)} เป็นของ ${t.roster.map(v=>`<b>${esc(v)}</b>`).join(' หรือ ')}
      แต่ผลตอบจริงคือ <b>${esc(proven)}</b> — ยึดผลจริงไว้ก่อน แล้วแจ้งให้ซับแก้ไฟล์</div>`;
  }
  /* อยู่ในรายชื่อหลายซับ = ยังชี้ไม่ได้ แต่บอกได้ว่าให้ไล่ถามใครบ้าง */
  if(t && !t.confirmed && !t.viaDriver && t.roster.length > 1 && !m.vendor)
    return `<div class="warnbox"><b>ทะเบียนนี้อยู่ในรายชื่อของหลายซับ:</b>
      ${t.roster.map(v=>`<b>${esc(v)}</b>`).join(' · ')} — ยังชี้ไม่ได้ว่าเป็นของใคร ต้องไล่ถามทีละราย</div>`;

  /* ทะเบียนกับชื่อ พขร. ชี้คนละราย — เรื่องนี้สำคัญกว่าอย่างอื่น ต้องเตือนก่อน */
  if(byPlate && byDriver && byPlate.v !== byDriver.v)
    return `<div class="warnbox"><b>ทะเบียนกับชื่อ พขร. ชี้คนละซับ:</b><br>
      ${byPlate.txt}<br>${byDriver.txt}<br>
      อาจพิมพ์ทะเบียนผิด หรือวันนั้นเปลี่ยนคนขับ — ตรวจกับหน้างานก่อนส่ง</div>`;

  const ev = byPlate || byDriver || byRoster || byPrimary;
  if(!ev || !m.vendor || ev.v === m.vendor) return '';
  const also = (byPlate && byDriver && byPlate.v === byDriver.v)
    ? '<br>ทั้งทะเบียนและชื่อ พขร. ตรงกันทั้งคู่' : '';
  return `<div class="warnbox"><b>ทะเบียนนี้อาจไม่ใช่ของ ${esc(m.vendor)}:</b><br>${ev.txt}${also}
    ${t && t.bu ? ` · BU ${esc(t.bu)}` : ''} — ตรวจก่อนส่ง จะได้ไม่โดน Reject กลับ</div>`;
}


/* ============================================================
   เดาว่าเคสที่ยังไม่รู้ซับ น่าจะเป็นของใคร
   ใช้หลักฐานชุดเดียวกับหน้าทะเบียนรถ แต่คืน "ผู้ต้องสงสัย" ได้หลายราย
   เพราะเป้าหมายคือ "ไล่ถาม" ไม่ใช่ "ตัดสิน"
   ============================================================ */
function guessOwner(c){
  const out = [];
  const seen = new Set();
  const add = (vendor, why, tier) => {
    if(!vendor || seen.has(vendor)) return;
    seen.add(vendor); out.push({vendor, why, tier});
  };

  const fleet = buildFleet();
  for(const raw of splitPlates(c.truck)){
    const k = plateKey(raw);
    const t = k && fleet.find(x => x.key === k);
    if(!t) continue;
    if(t.confirmed) add(t.confirmed, `เคยรับเคลมทะเบียน ${t.display} มาแล้ว ${t.cases.length} เคส`, 1);
    if(t.viaDriver) add(t.viaDriver.vendor, `พขร. ที่ขับทะเบียน ${t.display} เคยวิ่งให้`, 2);
    for(const v of (t.roster || []))
      add(v, `มีทะเบียน ${t.display} อยู่ในรายชื่อรถที่แจ้งไว้`, 3);
    if(t.primary) add(t.primary, `เป็นซับสัมปทานของทะเบียน ${t.display}`, 4);
  }
  /* ถ้าทะเบียนยังเงียบ ลองถามจากชื่อคนขับ */
  for(const n of splitDrivers(c.driver)){
    const r = driverVendor(n);
    if(r && r.vendor) add(r.vendor, `พขร. ${r.driver.display} เคยวิ่งให้ ${r.n} เคส`, 2);
  }
  return out.sort((a, b) => a.tier - b.tier);
}

/* เคสค้างที่ยังไม่รู้ซับทั้งหมด พร้อมผู้ต้องสงสัยของแต่ละเคส */
function unknownCases(){
  return CACHE
    .filter(({m}) => m.status === 'OPEN' && !m.vendor)
    .filter(({c, bu}) => (F.carrier === 'all' || c.carrier === F.carrier)
                      && (F.bu === 'all' || bu === F.bu))
    .map(x => ({...x, guess: guessOwner(x.c)}))
    .sort((a, b) => b.m.el - a.m.el);
}

/* จัดกลุ่มตามผู้ต้องสงสัย — เคสหนึ่งอยู่ได้หลายกลุ่ม เพราะต้องถามหลายราย */
function unknownByVendor(list){
  const g = new Map();
  for(const x of list)
    for(const gs of x.guess){
      if(!g.has(gs.vendor)) g.set(gs.vendor, []);
      g.get(gs.vendor).push({...x, why: gs.why, tier: gs.tier});
    }
  return [...g.entries()]
    .map(([v, items]) => ({v, items, best: Math.min(...items.map(i => i.tier))}))
    .sort((a, b) => a.best - b.best || b.items.length - a.items.length);
}


/* ============================================================
   กดแถวในตารางทะเบียนรถ แล้วเปิดหน้ารายละเอียดคันนั้น
   ตรงนี้คือที่ที่ "ตรวจสอบ" และ "แก้ไขเพื่อทำงานต่อ" ทั้งหมด
   ============================================================ */
function openTruck(key){
  const t = buildFleet().find(x => x.key === key);
  if(!t){ toast('ไม่พบทะเบียนนี้'); return; }

  document.getElementById('tTitle').textContent = t.display;
  document.getElementById('tSub').textContent =
    `${t.bu ? 'BU ' + t.bu + ' · ' : ''}พขร. ${[...t.drivers].join(', ') || '—'} · `
    + `${t.cases.length} เคส${t.openCount ? ` (ค้าง ${t.openCount})` : ''} · ${TSTATE[t.state].th}`;

  const vOpts = [...new Set([...vendorNames(true), t.primary, t.confirmed, ...(t.roster || [])].filter(Boolean))];
  const hist = t.cases.slice().sort((a, b) => (b.m.t0 || '') > (a.m.t0 || '') ? 1 : -1);
  const openAmt = t.cases.filter(x => x.m.status === 'OPEN').reduce((s2, x) => s2 + (x.c.amount || 0), 0);
  const allAmt  = t.cases.reduce((s2, x) => s2 + (x.c.amount || 0), 0);

  document.getElementById('tBody').innerHTML = `
    ${t.mismatch ? `<div class="warnbox"><b>ไม่ตรงกัน:</b> ตั้งซับหลักไว้เป็น ${esc(t.primary)}
      แต่ผลตอบจริงคือ ${esc(t.confirmed)} รับเคลม — ตรวจว่าวันนั้นเป็นรถของใครวิ่ง ก่อนแก้ซับหลัก</div>` : ''}
    ${t.rosterConflict ? `<div class="warnbox"><b>รายชื่อรถของซับไม่ตรงกับผลจริง:</b>
      ไฟล์อ้างอิงบอกว่าเป็นของ ${t.roster.map(v => esc(v)).join(' หรือ ')}
      แต่ผลตอบจริงคือ ${esc(t.confirmed || (t.viaDriver && t.viaDriver.vendor))} — ยึดผลจริงไว้ก่อน</div>` : ''}
    ${t.state === 'SPLIT' ? `<div class="warnbox"><b>มีมากกว่าหนึ่งซับรับ:</b>
      ${Object.entries(t.accept).map(([v, n]) => esc(v) + ' ' + n + ' ครั้ง').join(' · ')}
      — ปกติของทะเบียนที่เปลี่ยนมือระหว่างช่วง</div>` : ''}
    ${t.spellings.size > 1 ? `<div class="warnbox"><b>ทะเบียนเขียนไม่เหมือนกัน:</b>
      ${[...t.spellings].map(esc).join(' , ')} — ระบบรวมให้เป็นคันเดียวแล้ว</div>` : ''}
    ${t.dupNames.length ? `<div class="warnbox"><b>ชื่อ พขร. คล้ายกันมาก:</b>
      ${t.dupNames.map(x => x.map(esc).join(' / ')).join(' · ')} — น่าจะเป็นคนเดียวพิมพ์สองแบบ</div>` : ''}

    <div class="grid2">
      <div class="kv"><div class="k">ยอดเคลมของทะเบียนนี้</div>
        <div class="v">${baht0(allAmt)} บาท${openAmt ? ` · <span style="color:var(--bad)">ค้าง ${baht0(openAmt)} บาท</span>` : ''}</div></div>
      <div class="kv"><div class="k">ส่งให้ซับมาแล้ว</div>
        <div class="v">${Object.entries(t.sent).map(([v, n]) => `${esc(v)} ${n}`).join(' · ') || '—'}</div></div>
      <div class="kv"><div class="k">ตอบรับเคลม</div>
        <div class="v">${Object.entries(t.accept).map(([v, n]) => `${esc(v)} ${n}`).join(' · ') || '—'}</div></div>
      <div class="kv"><div class="k">ปฏิเสธ</div>
        <div class="v">${Object.entries(t.reject).map(([v, n]) => `${esc(v)} ${n}`).join(' · ') || '—'}</div></div>
      <div class="kv"><div class="k">รายชื่อรถของซับ (ไฟล์อ้างอิง)</div>
        <div class="v">${(t.roster || []).map(v => `<span class="chip a">${esc(v)}</span>`).join(' ') || '—'}
          ${t.rosterNote ? `<span class="sub">${esc(t.rosterNote)}</span>` : ''}</div></div>
      <div class="kv"><div class="k">ระบบเชื่อว่าเป็นของ</div>
        <div class="v">${t.best ? `<b>${esc(t.best)}</b> <span class="sub">${
          {plate:'จากผลตอบของทะเบียนคันนี้', driver:'เดาจากชื่อ พขร.',
           roster:'จากรายชื่อรถของซับ', primary:'จากซับสัมปทานที่ตั้งไว้'}[t.bestBy] || ''}</span>`
          : '<span style="color:var(--bad)">ยังไม่มีเบาะแส</span>'}</div></div>
    </div>

    <fieldset><legend>ตั้งค่าทะเบียนนี้</legend>
      <form id="tForm" novalidate><div class="frow">
        <div class="fld"><label for="tPri">ซับสัมปทานหลัก</label>
          <select id="tPri"><option value="">— ยังไม่ตั้ง —</option>
            ${vOpts.map(v => `<option ${v === t.primary ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="fld" style="max-width:150px"><label for="tBU">BU</label>
          <select id="tBU"><option value="">— ยังไม่ระบุ —</option>
            ${buList().map(b => `<option ${b === t.bu ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
        <div class="fld" style="flex:2"><label for="tNote">หมายเหตุ</label>
          <input type="text" id="tNote" value="${esc(t.note)}"
            placeholder="เช่น เปลี่ยนสัมปทานจาก Doitung เป็น SC ตั้งแต่ ส.ค. 69"></div>
      </div>
      <div class="actions"><button type="submit" class="pri">บันทึก</button>
        ${t.confirmed && t.primary !== t.confirmed
          ? `<button type="button" id="tUse">ใช้ ${esc(t.confirmed)} ตามผลที่ยืนยัน</button>` : ''}
        ${!t.confirmed && t.rosterPick && t.primary !== t.rosterPick
          ? `<button type="button" id="tUseR">ใช้ ${esc(t.rosterPick)} ตามรายชื่อรถของซับ</button>` : ''}
        <span class="hint" style="margin:0">ค่านี้ใช้แนะนำซับตอนคีย์เคสใหม่ และเตือนเมื่อส่งไม่ตรงราย</span></div></form>
    </fieldset>

    <div class="slabel">ประวัติการวิ่งและผลเคลม — กดเลขเคลมเพื่อเปิดแก้ไข</div>
    <div class="hist">
      ${hist.length ? hist.map(({c, m}) => `<div class="hrow">
        <span class="mono" style="font-size:12px;min-width:96px">${m.t0 ? fmt(m.t0, true) : '—'}</span>
        <a class="vlink mono" style="font-size:12.5px;min-width:158px" data-go="${esc(c.id)}">${esc(c.id)}</a>
        <span style="font-size:13px;color:var(--muted);flex:1;min-width:140px">
          ${m.legs.map(l => `${esc(l.vendor || '?')} → ${
            l.result === 'ACCEPT' ? '<span style="color:var(--ok)">รับเคลม</span>'
            : l.result ? '<span style="color:var(--warn)">ปฏิเสธ</span>'
            : '<span style="color:var(--bad)">ยังไม่ตอบ</span>'}`).join(' · ') || '—'}
        </span>
        <span class="mono" style="font-size:12px">${c.amount ? c.amount.toLocaleString('th-TH', {maximumFractionDigits:0}) + ' บาท' : '—'}</span>
        ${statusChip(m)}</div>`).join('')
        : '<div class="empty">ทะเบียนนี้ยังไม่เคยมีเคส</div>'}
    </div>

    <div class="actions" style="margin-top:14px">
      <button type="button" id="tBoard">ดูเคสของทะเบียนนี้ในกระดาน</button>
      ${t.openCount ? '<button type="button" id="tQueue">ไปคิวต้องส่งวันนี้</button>' : ''}
    </div>`;

  const dlg = document.getElementById('tdlg');
  if(!dlg.open) dlg.showModal();
  dlg.querySelector('.db').scrollTop = 0;

  const save = async (patch, msg) => {
    try{
      await API.putTruck(t.key, {plate:t.display, bu:t.bu, drivers:[...t.drivers],
                                 primary:t.primary, note:t.note, ...patch});
      await pullState(); render(); openTruck(key); toast(msg || 'บันทึกแล้ว');
    }catch(e){ toast(e.message); }
  };
  document.getElementById('tForm').onsubmit = ev => {
    ev.preventDefault();
    save({primary: document.getElementById('tPri').value || null,
          bu:      document.getElementById('tBU').value || null,
          note:    document.getElementById('tNote').value.trim()});
  };
  const u = document.getElementById('tUse');
  if(u) u.onclick = () => save({primary: t.confirmed}, `ตั้งซับหลักเป็น ${t.confirmed} แล้ว`);
  const ur = document.getElementById('tUseR');
  if(ur) ur.onclick = () => save({primary: t.rosterPick}, `ตั้งซับหลักเป็น ${t.rosterPick} แล้ว`);

  dlg.querySelectorAll('[data-go]').forEach(a => a.onclick = () => { dlg.close(); openCase(a.dataset.go); });
  document.getElementById('tBoard').onclick = () => {
    dlg.close(); F.q = t.display; F.vendor = 'all'; F.status = 'all'; setView('board');
    const q = document.getElementById('q'); if(q) q.value = t.display;
  };
  const qb = document.getElementById('tQueue');
  if(qb) qb.onclick = () => { dlg.close(); setView('queue'); };
}
