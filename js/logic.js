/* ============================================================
   logic.js — กติกาการนับเวลา 48 ชั่วโมง (หัวใจของระบบ)
   T0    = บันทึก "รับเมลเคลม" ครั้งแรก
   T_end = "ซับรับเคลม" ครั้งสุดท้าย และต้องไม่มีการส่งต่อตามหลัง
   ปฏิเสธถาวร = ยังไม่ปิดงาน นาฬิกาเดินต่อ
   ============================================================ */
const TYPES = {
  RECEIVE:      {th:'รับเมลเคลม',                 cls:'a'},
  FORWARD:      {th:'ส่งเมลให้ซับ',                cls:'a'},
  FOLLOWUP:     {th:'ทวงงาน / ส่งเมลซ้ำ',          cls:'n'},
  REJECT:       {th:'ซับ Reject (ไม่ใช่ทะเบียน)',  cls:'warn'},
  REJECT_FINAL: {th:'ซับปฏิเสธถาวร',               cls:'bad'},
  ACCEPT:       {th:'ซับรับเคลม',                  cls:'ok'},
  ESCALATE:     {th:'ส่งต่อ DHL Operation',        cls:'warn'},
  CLOSE:        {th:'ปิดงานเอง',                   cls:'ok'},
  NOTE:         {th:'บันทึกเพิ่มเติม',              cls:'n'},
};
const OPENS  = ['RECEIVE','FORWARD'];
const ANSWER = ['ACCEPT','REJECT','REJECT_FINAL'];
const CLOSES = ['ACCEPT','CLOSE'];

const plateKey   = p => String(p||'').replace(/[\s\-\.]/g,'').toUpperCase();
const splitPlates= p => String(p||'').split('/').map(x => x.trim()).filter(Boolean);

function compute(c){
  const ev = (S.events[c.id] || []).slice()
    .sort((a,b) => (a.at || '9999') < (b.at || '9999') ? -1 : 1);
  const timed = ev.filter(e => e.at);

  let t0 = c.t0fix || null;
  if(!t0){
    const r = timed.find(e => e.type === 'RECEIVE');
    t0 = r ? r.at : (timed[0] ? timed[0].at : null);
  }

  let tEnd = null, closeBy = null;
  for(const e of timed) if(CLOSES.includes(e.type)){ tEnd = e.at; closeBy = e.type; }
  if(tEnd && timed.some(e => OPENS.includes(e.type) && e.at > tEnd)){ tEnd = null; closeBy = null; }

  const now = NOW();
  let status, el = null;
  if(!t0) status = 'NO_DATA';
  else if(tEnd){ status = 'CLOSED'; el = (D(tEnd) - D(t0)) / 36e5; }
  else { status = 'OPEN'; el = (now - D(t0)) / 36e5; }

  let sla = null;
  if(el != null)
    sla = status === 'CLOSED' ? (el <= SLA_H ? 'ON_TIME' : 'OVERDUE')
        : (el > SLA_H ? 'BREACH' : el > WARN_H ? 'AT_RISK' : 'ON_TRACK');

  /* ช่วงเวลาแยกรายซับ */
  const legs = []; let cur = null;
  for(const e of timed){
    if(OPENS.includes(e.type)){
      if(cur) legs.push(cur);
      cur = {vendor:e.vendor, start:e.at, end:null, result:null};
    } else if(ANSWER.includes(e.type) && cur && !cur.end){
      cur.end = e.at; cur.result = e.type;
    }
  }
  if(cur) legs.push(cur);
  const legEnd = l => l.end ? D(l.end) : (tEnd ? D(tEnd) : now);
  legs.forEach(l => l.h = (legEnd(l) - D(l.start)) / 36e5);
  const internal = el == null ? null : Math.max(0, el - legs.reduce((s,l) => s + l.h, 0));

  const lastAns = [...timed].reverse().find(e => ANSWER.includes(e.type));
  const needsAction = status === 'OPEN' && lastAns && lastAns.type === 'REJECT_FINAL';
  const lastLeg = legs.length ? legs[legs.length-1] : null;
  const vendor = lastLeg ? lastLeg.vendor : null;

  const flags = [];
  if(t0 && c.ref_date && !c.t0fix){
    const gap = Math.abs((D(t0) - D(c.ref_date + 'T00:00')) / 864e5);
    if(gap > 3) flags.push({k:'DATE', t:`วันที่ในบันทึกห่างจากวันรับของ ${Math.round(gap)} วัน (ไฟล์ระบุ ${c.ref_date})`});
  }
  if(ev.some(e => !e.at)) flags.push({k:'TIME', t:'มีบันทึกที่ไม่มีเวลากำกับ — วัดเวลารายซับไม่ครบ'});
  if(!t0) flags.push({k:'NOT0', t:'ไม่พบเวลารับเมล ต้องกรอกย้อนหลัง'});
  if(timed.length <= 1 && status === 'OPEN') flags.push({k:'THIN', t:'มีแต่รายการรับเมล ยังไม่มีบันทึกความคืบหน้า'});

  const deadline = t0 ? new Date(D(t0).getTime() + SLA_H*36e5) : null;
  const remain = deadline && status !== 'CLOSED' ? (deadline - now) / 36e5 : null;
  const lastFollow = [...timed].reverse().find(e => e.type === 'FOLLOWUP' || e.type === 'FORWARD');
  const sentToday = lastFollow ? todayKey(D(lastFollow.at)) === todayKey() : false;

  return {ev, timed, t0, tEnd, closeBy, status, sla, el, legs, internal, needsAction,
          vendor, flags, deadline, remain, sentToday, fixed: !!c.t0fix};
}

/* ---------- สถานะรวมของทุกเคส ---------- */
let CACHE = [];
let F = {vendor:'all', status:'all', carrier:'all', bu:'all', q:'', view:'board'};

const byId = id => S.cases[id];
const allCases = () => Object.values(S.cases);

function truckBU(c){
  for(const raw of splitPlates(c.truck)){
    const t = S.trucks[plateKey(raw)];
    if(t && t.bu) return t.bu;
  }
  return c.carrier === 'DHL' ? 'MKM' : 'CDC';
}

function recompute(){
  CACHE = allCases().map(c => ({c, m: compute(c), bu: truckBU(c)}));
  if(typeof bustFleet === 'function') bustFleet();      /* ข้อมูลเปลี่ยน ต้องคำนวณทะเบียนใหม่ */
  if(typeof bustDrivers === 'function') bustDrivers();
}

/* เคสที่ยังไม่รู้ว่าซับไหนถืออยู่ ใช้ชื่อนี้แทนทุกที่ ห้ามพิมพ์สดในไฟล์อื่น
   เพราะถ้าเทียบ m.vendor (null) กับข้อความนี้ตรง ๆ จะไม่มีวันตรงกัน */
const NOVENDOR   = '(ยังไม่ระบุซับ)';
const vendorOf   = m => m.vendor || NOVENDOR;
const vendorPass = m => F.vendor === 'all' || vendorOf(m) === F.vendor;

/* ตัวกรองที่ไม่เจาะจงซับ (ขนส่ง / BU / สถานะ / คำค้น) — ใช้ร่วมกันทั้งตารางเคส
   และการ์ดรายซับ เพื่อให้ตัวเลขสองที่นี้ตรงกันเสมอตามแถบ Slicer ด้านบน */
function scopedCache(){
  const q = F.q.trim().toLowerCase();
  return CACHE.filter(({c, m, bu}) => {
    if(F.carrier !== 'all' && c.carrier !== F.carrier) return false;
    if(F.bu !== 'all' && bu !== F.bu) return false;
    if(F.status === 'open'   && m.status !== 'OPEN') return false;
    if(F.status === 'closed' && m.status !== 'CLOSED') return false;
    if(F.status === 'breach' && !(m.status === 'OPEN' && m.sla === 'BREACH')) return false;
    if(F.status === 'flag'   && !m.flags.length) return false;
    if(q){
      const hay = [c.id, c.store, c.store_name, c.truck, c.driver, m.vendor, c.reason].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function visible(){
  return scopedCache().filter(({m}) => vendorPass(m));
}
