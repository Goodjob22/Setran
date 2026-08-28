/* ============================================================
   drivers.js — อ่านค่า "ชื่อพนักงานขับรถ" เป็นกุญแจดอกที่สอง
   ------------------------------------------------------------
   ทำไมต้องมี: ทะเบียนรถอาจพิมพ์ผิด หรือเป็นคันใหม่ที่ไม่เคยมีเคส
   แต่ชื่อ พขร. คนเดิมมักอยู่กับซับเดิม จึงใช้ช่วยยืนยันกันได้

   ลำดับความน่าเชื่อถือ (ห้ามสลับ)
     1. confirmed  ซับที่ตอบรับเคลม "ของทะเบียนคันนี้เอง"   ← แน่นที่สุด
     2. viaDriver  ซับที่ตอบรับเคลม "ของ พขร. คนนี้ในเคสอื่น" ← ใช้เมื่อข้อ 1 ไม่มี
     3. primary    ซับสัมปทานหลักตามสัญญา (ผู้ใช้ตั้งเอง)     ← ไม่ใช่หลักฐาน

   ระบบไม่เขียนทับ primary ด้วยค่าที่เดามาเด็ดขาด แค่บอกให้คนตัดสินใจ
   ============================================================ */

const TITLES = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|คุณ|mr\.?|mrs\.?|ms\.?)\s*/i;

/* ชื่อเดียวกันที่พิมพ์ต่างกันเล็กน้อย ให้ได้กุญแจเดียวกัน */
function dkey(s){
  let x = String(s || '').normalize('NFC').trim().toLowerCase();
  x = x.replace(/[​ ]/g, '');
  x = x.replace(TITLES, '');
  return x.replace(/[\s.\-_]/g, '');
}

/* แยกชื่อหลายคนในช่องเดียว เช่น "สมชาย/สมหญิง" หรือ "สมชาย, สมหญิง" */
const splitDrivers = s => String(s || '').split(/[\/,;+&]|\sและ\s/).map(x => x.trim()).filter(Boolean);

/* ระยะห่างของคำ ใช้จับชื่อที่น่าจะพิมพ์ผิด */
function dist(a, b){
  if(a === b) return 0;
  if(Math.abs(a.length - b.length) > 2) return 9;
  const prev = Array.from({length: b.length + 1}, (_, i) => i);
  for(let i = 1; i <= a.length; i++){
    let up = prev[0]; prev[0] = i;
    for(let j = 1; j <= b.length; j++){
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j-1] + 1, up + (a[i-1] === b[j-1] ? 0 : 1));
      up = tmp;
    }
  }
  return prev[b.length];
}
/* ใกล้กันพอจะสงสัยว่าพิมพ์ผิดไหม — ชื่อสั้นต้องเหมือนกว่าชื่อยาว */
function nearName(a, b){
  if(a === b || a.length < 3 || b.length < 3) return false;
  const d = dist(a, b);
  return d > 0 && d <= (Math.min(a.length, b.length) >= 7 ? 2 : 1);
}

/* ---------- ทะเบียนพนักงานขับรถ สร้างจากเคสทั้งหมด ---------- */
function buildDrivers(){
  const D = new Map();
  const get = (name) => {
    const k = dkey(name);
    if(!k) return null;
    if(!D.has(k)) D.set(k, {key:k, display:name.trim(), names:new Set(), plates:new Set(),
                            plateText:new Set(), cases:[], accept:{}, reject:{}, sent:{}, last:null});
    const d = D.get(k);
    d.names.add(name.trim());
    if(name.trim().length > d.display.length) d.display = name.trim();
    return d;
  };

  /* ชื่อที่บันทึกไว้ในทะเบียนรถ แม้ยังไม่มีเคส */
  for(const t of Object.values(S.trucks))
    for(const n of (t.drivers || [])){
      const d = get(n);
      if(d){ d.plates.add(t.key); d.plateText.add(t.plate || t.key); }
    }

  for(const {c, m} of CACHE){
    const plates = splitPlates(c.truck).map(plateKey).filter(Boolean);
    for(const n of splitDrivers(c.driver)){
      const d = get(n);
      if(!d) continue;
      plates.forEach(p => d.plates.add(p));
      splitPlates(c.truck).forEach(x => x.trim() && d.plateText.add(x.trim()));
      d.cases.push({c, m});
      if(m.t0 && (!d.last || m.t0 > d.last)) d.last = m.t0;
      for(const lg of m.legs){
        if(!lg.vendor) continue;
        d.sent[lg.vendor] = (d.sent[lg.vendor] || 0) + 1;
        if(lg.result === 'ACCEPT') d.accept[lg.vendor] = (d.accept[lg.vendor] || 0) + 1;
        else if(lg.result === 'REJECT' || lg.result === 'REJECT_FINAL')
          d.reject[lg.vendor] = (d.reject[lg.vendor] || 0) + 1;
      }
    }
  }

  for(const d of D.values()){
    const acc = Object.entries(d.accept).sort((a, b) => b[1] - a[1]);
    /* ยืนยันได้ต่อเมื่อมีซับเดียวที่เคยรับเคลมของ พขร. คนนี้ ถ้าหลายซับถือว่าเดาไม่ได้ */
    d.confirmed = acc.length === 1 ? acc[0][0] : null;
    d.split     = acc.length > 1 ? acc.map(x => x[0]) : null;
    d.rejectedBy = Object.keys(d.reject);
    d.openCount = d.cases.filter(x => x.m.status === 'OPEN').length;
  }
  return D;
}

/* แคชไว้รอบหนึ่งของการวาดหน้าจอ กันคำนวณซ้ำหลายรอบ */
let _dcache = null, _dstamp = -1;
function driverMap(){
  if(_dcache && _dstamp === CACHE.length) return _dcache;
  _dcache = buildDrivers(); _dstamp = CACHE.length;
  return _dcache;
}
function bustDrivers(){ _dcache = null; _dstamp = -1; }

/* ---------- ตอบคำถาม "ชื่อนี้น่าจะเป็นซับไหน" ---------- */
function driverVendor(name){
  const k = dkey(name);
  if(!k) return null;
  const d = driverMap().get(k);
  if(!d) return null;
  if(d.confirmed)
    return {vendor:d.confirmed, n:d.accept[d.confirmed], driver:d,
            why:`${d.display} เคยมี ${d.accept[d.confirmed]} เคสที่ ${d.confirmed} รับเคลม`};
  if(d.split)
    return {vendor:null, driver:d, split:d.split,
            why:`${d.display} เคยวิ่งให้หลายซับ (${d.split.join(' · ')}) — ต้องเลือกเอง`};
  return {vendor:null, driver:d, why:`${d.display} ยังไม่มีเคสที่ปิดจบ เลยยังยืนยันซับไม่ได้`};
}

/* ชื่อที่คล้ายกันจนน่าสงสัยว่าพิมพ์ผิด */
function driverNear(name){
  const k = dkey(name);
  if(!k) return [];
  const out = [];
  for(const d of driverMap().values())
    if(d.key !== k && nearName(k, d.key)) out.push(d);
  return out.sort((a, b) => b.cases.length - a.cases.length).slice(0, 3);
}

/* ซับที่เดาได้จากรายชื่อ พขร. ของทะเบียนคันหนึ่ง — ต้องเป็นเสียงเดียวกันทั้งหมด */
function vendorFromDrivers(driverNames){
  const votes = new Map();
  for(const n of driverNames){
    const r = driverVendor(n);
    if(r && r.vendor) votes.set(r.vendor, (votes.get(r.vendor) || 0) + r.n);
  }
  if(votes.size !== 1) return null;
  const [vendor, n] = [...votes.entries()][0];
  return {vendor, n};
}

/* ชื่อ พขร. ในทะเบียนคันเดียวกันที่คล้ายกันจนน่าจะเป็นคนเดียวพิมพ์สองแบบ */
function dupDriverNames(names){
  const list = [...names].filter(Boolean);
  const out = [];
  for(let i = 0; i < list.length; i++)
    for(let j = i + 1; j < list.length; j++)
      if(nearName(dkey(list[i]), dkey(list[j]))) out.push([list[i], list[j]]);
  return out;
}
