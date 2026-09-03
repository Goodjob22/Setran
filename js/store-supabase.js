/* ============================================================
   store-supabase.js — คุยกับ Supabase ทั้งหมดผ่านไฟล์นี้ไฟล์เดียว
   ใช้แทน api.js ของรุ่นเซิร์ฟเวอร์ หน้าตาคำสั่ง (API.*) เหมือนเดิมทุกอย่าง
   ไฟล์อื่นจึงไม่ต้องแก้เลย
   ============================================================ */
let S = { cases:{}, events:{}, vendors:{}, trucks:{}, evidence:{}, settings:{} };

/* ยังไม่ได้ใส่คีย์ก็ไม่ต้องสร้างตัวเชื่อม จะได้ไม่มี error รก ๆ ขึ้นมา */
const CONFIGURED = !!(CONFIG && /^https?:\/\/\S+$/.test(String(CONFIG.url || ''))
                      && String(CONFIG.anonKey || '').length > 20);
const SB = CONFIGURED ? supabase.createClient(CONFIG.url, CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
}) : null;

function setConn(state, text){
  const el = document.getElementById('conn');
  if(!el) return;
  el.className = 'conn' + (state === 'off' ? ' off' : state === 'busy' ? ' busy' : '');
  document.getElementById('connText').textContent = text;
}

/* แปล error ของ Supabase เป็นภาษาคน */
function sbErr(e, what){
  const m = String(e?.message || e || '');
  if(/row-level security|violates row-level/i.test(m))
    return 'ไม่มีสิทธิ์แก้ข้อมูลนี้ — เคสนี้อาจอยู่คนละ BU กับบัญชีของคุณ';
  /* PGRST116 = สั่งแก้แล้วไม่มีแถวไหนโดนเลย เกือบทุกครั้งแปลว่าโดน RLS กัน */
  if(/PGRST116|multiple \(or no\) rows|JSON object requested/i.test(m) || e?.code === 'PGRST116')
    return 'ทำรายการไม่ได้ — ข้อมูลนี้อยู่นอก BU ที่บัญชีของคุณดูแล หรือถูกลบไปแล้ว';
  if(/duplicate key|already exists/i.test(m))  return 'มีข้อมูลนี้อยู่แล้ว';
  if(/JWT|token|session/i.test(m))             return 'เซสชันหมดอายุ — ต้องเข้าสู่ระบบใหม่';
  if(/Failed to fetch|NetworkError/i.test(m))  return 'ต่อเน็ตไม่ได้ — ตรวจสัญญาณอินเทอร์เน็ต';
  return (what ? what + ' — ' : '') + m;
}

async function run(label, fn){
  setConn('busy', 'กำลังบันทึก…');
  try{
    const { data, error } = await fn();
    if(error) throw error;
    setConn('on', 'เชื่อมต่อแล้ว');
    return data;
  }catch(e){
    const msg = sbErr(e, label);
    setConn('off', msg);
    const err = new Error(msg); err.raw = e; throw err;
  }
}

/* ---------- แปลงชื่อคอลัมน์ฐานข้อมูล <-> ชื่อที่โค้ดหน้าเว็บใช้ ---------- */
const outTruck = t => ({ key:t.key, plate:t.plate, bu:t.bu, drivers:t.drivers||[],
                         primary:t.primary_vendor, note:t.note||'',
                         roster:t.roster||[], rosterNote:t.roster_note||'' });
/* เขียนเฉพาะช่องที่ส่งมาจริง ๆ จะได้ไม่ล้างค่าเดิมทิ้งตอนนำเข้าคนละโหมด */
const inTruck  = t => {
  const o = { key:t.key, plate:t.plate };
  if('bu'         in t) o.bu             = t.bu || null;
  if('drivers'    in t) o.drivers        = t.drivers || [];
  if('primary'    in t) o.primary_vendor = t.primary || null;
  if('note'       in t) o.note           = t.note || '';
  if('roster'     in t) o.roster         = t.roster || [];
  if('rosterNote' in t) o.roster_note    = t.rosterNote || '';
  return o;
};

const outEvent = e => ({ id:e.id, type:e.type, at:e.at ? String(e.at).slice(0,16) : null,
                         vendor:e.vendor, text:e.text||'', flag:e.flag, src:e.src||'entry' });
const inEvent  = e => ({ type:e.type, at:e.at || null, vendor:e.vendor || null,
                         text:e.text || '', flag:e.flag || null, src:e.src || 'entry' });

const outCase = c => ({ id:c.id, carrier:c.carrier, store:c.store, store_name:c.store_name,
  dept:c.dept, driver:c.driver, truck:c.truck, ref_date:c.ref_date,
  t0:c.t0 ? String(c.t0).slice(0,16) : null, amount:Number(c.amount||0),
  ex_vat:Number(c.ex_vat||0), vat:Number(c.vat||0),
  reason:c.reason, items:c.items||[], bu:c.bu, source:c.source, createdAt:c.created_at,
  t0fix:c.t0fix ? String(c.t0fix).slice(0,16) : null, t0why:c.t0why || '' });
const inCase = c => {
  const o = {};
  const map = { id:'id', carrier:'carrier', store:'store', store_name:'store_name',
    dept:'dept', driver:'driver', truck:'truck', ref_date:'ref_date', t0:'t0',
    amount:'amount', ex_vat:'ex_vat', vat:'vat', reason:'reason', items:'items', source:'source',
    t0fix:'t0fix', t0why:'t0why' };
  for(const [js, col] of Object.entries(map)) if(js in c) o[col] = c[js];
  if('ref_date' in o && !o.ref_date) o.ref_date = null;
  if('t0' in o && !o.t0) o.t0 = null;
  if('t0fix' in o && !o.t0fix) o.t0fix = null;
  return o;
};

const outEv = r => ({ id:r.id, caseId:r.case_id, path:r.path, url:r.url || '',
  type:r.type, w:r.w, h:r.h, size:r.size, eventKey:r.event_key||'',
  mailAt:r.mail_at||'', amount:r.amount||'', desc:r.descr||'',
  by:r.by_name||'', addedAt:r.added_at });
const inEv = p => {
  const o = {};
  const map = { type:'type', eventKey:'event_key', mailAt:'mail_at',
                amount:'amount', desc:'descr', by:'by_name' };
  for(const [js, col] of Object.entries(map)) if(js in p) o[col] = p[js];
  return o;
};

/* ---------- รูปหลักฐาน ---------- */
const dataUrlToBlob = u => fetch(u).then(r => r.blob());
const SIGN_SEC = 60 * 60 * 2;   // ลิงก์รูปอายุ 2 ชั่วโมง แล้วดึงใหม่ตอนรีเฟรช

async function signAll(rows){
  const paths = rows.map(r => r.path).filter(Boolean);
  if(!paths.length) return rows;
  const { data } = await SB.storage.from('evidence').createSignedUrls(paths, SIGN_SEC);
  const byPath = {};
  for(const d of (data || [])) if(d.path && d.signedUrl) byPath[d.path] = d.signedUrl;
  for(const r of rows) r.url = byPath[r.path] || '';
  return rows;
}

/* ---------- คำสั่งทั้งหมด ---------- */
const API = {
  /* ดึงข้อมูลทั้งก้อนใหม่ — ไฟล์อื่นเรียกใช้หลังบันทึกเพื่อให้ข้อมูลตรงกัน */
  state: async () => { await pullState(); return S; },

  /* เคส */
  addCase: async c => {
    const ev = c.events || [];
    const body = inCase(c);
    const { data: { user } } = await SB.auth.getUser();
    body.created_by = user?.id || null;
    body.source = c.source || 'entry';
    const row = await run('เพิ่มเคส', () =>
      SB.from('cases').insert(body).select().single());
    if(ev.length){
      await run('บันทึกไทม์ไลน์', () => SB.from('events')
        .insert(ev.map(e => ({ ...inEvent(e), case_id: row.id, created_by: user?.id || null }))));
    }
    return { case: outCase(row) };
  },
  patchCase: async (id, p) => {
    const row = await run('แก้ไขเคส', () =>
      SB.from('cases').update(inCase(p)).eq('id', id).select().single());
    return { case: outCase(row) };
  },
  delCase: id => run('ลบเคส', () => SB.from('cases').delete().eq('id', id)),

  /* ไทม์ไลน์ */
  addEvent: async (id, e) => {
    const { data: { user } } = await SB.auth.getUser();
    const row = await run('เพิ่มเหตุการณ์', () => SB.from('events')
      .insert({ ...inEvent(e), case_id: id, created_by: user?.id || null }).select().single());
    return { event: outEvent(row) };
  },
  delEvent: (id, eid) => run('ลบเหตุการณ์', () => SB.from('events').delete().eq('id', eid)),

  /* ทะเบียนซับ */
  putVendor: async (code, v) => {
    const row = await run('บันทึกซับ', () => SB.from('vendors').upsert({
      code, display:v.display || code, aliases:v.aliases || [],
      email:v.email || '', contact:v.contact || '', carriers:v.carriers || [],
      active:v.active !== false, note:v.note || '', updated_at:new Date().toISOString(),
    }, { onConflict:'code' }).select().single());
    return { vendor: row };
  },
  delVendor: code => run('ลบซับ', () => SB.from('vendors').delete().eq('code', code)),
  mergeVendor: async (from, to) => {
    await run('ย้ายเหตุการณ์', () => SB.from('events').update({ vendor: to }).eq('vendor', from));
    await run('ย้ายทะเบียนรถ', () => SB.from('trucks').update({ primary_vendor: to }).eq('primary_vendor', from));
    const keep = S.vendors[to], gone = S.vendors[from];
    if(keep && gone){
      const aliases = [...new Set([...(keep.aliases||[]), from, ...(gone.aliases||[]),
                                   gone.display].filter(Boolean))];
      await API.putVendor(to, { ...keep, aliases });
    }
    await run('ลบซับเดิม', () => SB.from('vendors').delete().eq('code', from));
    return { ok: true };
  },

  /* ทะเบียนรถ */
  putTruck: async (key, t) => {
    const row = await run('บันทึกทะเบียนรถ', () => SB.from('trucks')
      .upsert({ ...inTruck({ ...t, key }), updated_at:new Date().toISOString() },
              { onConflict:'key' })
      .select().single());
    return { truck: outTruck(row) };
  },
  importTrucks: async rows => {
    /* PostgREST ต้องการให้ทุกแถวในชุดเดียวมีคอลัมน์เท่ากัน
       ช่องที่แถวไหนไม่ได้ส่งมา ให้เติมด้วยค่าเดิมของทะเบียนนั้น จะได้ไม่ถูกล้างทิ้ง */
    const mapped = rows.map(inTruck);
    const cols = [...new Set(mapped.flatMap(Object.keys))];
    const body = mapped.map((m, i) => {
      const cur = inTruck({ ...(S.trucks[rows[i].key] || {}), key:rows[i].key, plate:m.plate });
      const row = { updated_at:new Date().toISOString() };
      for(const c of cols) row[c] = (c in m) ? m[c] : (c in cur ? cur[c] : null);
      return row;
    });
    const data = await run('นำเข้าทะเบียนรถ', () =>
      SB.from('trucks').upsert(body, { onConflict:'key' }).select());
    return { added: data.length, trucks: data.map(outTruck) };
  },
  delTruck: key => run('ลบทะเบียนรถ', () => SB.from('trucks').delete().eq('key', key)),

  /* หลักฐาน */
  addEvidence: async rec => {
    const blob = await dataUrlToBlob(rec.dataUrl);
    const path = `${rec.caseId}/${crypto.randomUUID()}.jpg`;
    const up = await SB.storage.from('evidence')
      .upload(path, blob, { contentType:'image/jpeg', upsert:false });
    if(up.error) throw new Error(sbErr(up.error, 'อัปโหลดรูป'));
    try{
      const row = await run('บันทึกหลักฐาน', () => SB.from('evidence').insert({
        case_id:rec.caseId, path, type:rec.type || '', w:rec.w, h:rec.h, size:blob.size,
        event_key:rec.eventKey || '', mail_at:rec.mailAt || '', amount:rec.amount || '',
        descr:rec.desc || '', by_name:rec.by || '',
      }).select().single());
      const one = outEv(row);
      await signAll([one]);
      return { evidence: one };
    }catch(e){
      await SB.storage.from('evidence').remove([path]);   // ใส่ตารางไม่ได้ก็ลบไฟล์ทิ้ง ไม่ให้มีไฟล์ลอย
      throw e;
    }
  },
  patchEvidence: (id, p) => run('แก้ไขหลักฐาน', () =>
    SB.from('evidence').update(inEv(p)).eq('id', id)),
  delEvidence: async id => {
    const rec = S.evidence[id];
    await run('ลบหลักฐาน', () => SB.from('evidence').delete().eq('id', id));
    if(rec?.path) await SB.storage.from('evidence').remove([rec.path]);
    return { ok: true };
  },

  /* ตั้งค่า */
  putSettings: async s => {
    const row = await run('บันทึกการตั้งค่า', () => SB.from('settings')
      .update({ data:s, updated_at:new Date().toISOString() }).eq('id', 1).select().single());
    return { settings: row.data };
  },

  /* ผู้ใช้ (เฉพาะแอดมิน) */
  users: async () => {
    const rows = await run('อ่านรายชื่อผู้ใช้', () =>
      SB.from('profiles').select('*').order('created_at'));
    return { users: rows.map(u => ({ username:u.email, display:u.display, role:u.role,
                                     bu:u.bu, active:u.active, id:u.id })) };
  },
  patchUser: (id, p) => run('แก้ไขผู้ใช้', () => SB.from('profiles').update({
    ...( 'display' in p ? { display:p.display } : {} ),
    ...( 'role'    in p ? { role:p.role }       : {} ),
    ...( 'bu'      in p ? { bu:p.bu || null }   : {} ),
    ...( 'active'  in p ? { active:p.active }   : {} ),
  }).eq('id', id)),
  delUser: id => run('ลบผู้ใช้', () => SB.from('profiles').delete().eq('id', id)),
};

/* ---------- โหลดข้อมูลทั้งก้อน ----------
   กันเรียกซ้อนกัน (สำคัญมาก): ถ้าดึงข้อมูลรอบใหม่เริ่มไปแล้วระหว่างที่กำลังพิมพ์/บันทึกอะไรบางอย่าง
   อยู่ในเครื่อง (เช่น กด "ทำเครื่องหมายรับเคลม" ทีละหลายเคส) รอบที่ดึงไปตั้งแต่ก่อนหน้านั้นอาจได้ข้อมูล
   เก่ากว่ากลับมา แต่ทำงานเสร็จ (resolve) ทีหลัง — ถ้าปล่อยให้ทั้งสองรอบเขียนทับ S.events กันเองแบบ
   ไม่มีลำดับ รอบเก่าที่จบทีหลังจะเขียนทับข้อมูลที่เพิ่งบันทึกไปทิ้ง ทำให้เคสที่เพิ่งปิดไปแล้ว "เด้งกลับ"
   เป็นเปิดอยู่เหมือนเดิม (บั๊กที่เจอจริงตอนกดรับเคลมทีละหลายสิบเคสพร้อมกัน) จึงต้องให้ดึงได้ทีละรอบ
   เท่านั้น ถ้ามีคนเรียกซ้อนเข้ามาระหว่างที่กำลังดึงอยู่ ให้รอรอบที่กำลังทำอยู่ให้เสร็จ แล้วค่อยดึงซ้ำอีกทีเดียว */
let pullInFlight = null, pullQueued = false;
function pullState(){
  if(pullInFlight){ pullQueued = true; return pullInFlight; }
  pullInFlight = doPullState().finally(() => {
    pullInFlight = null;
    if(pullQueued){ pullQueued = false; pullState(); }
  });
  return pullInFlight;
}
async function doPullState(){
  setConn('busy', 'กำลังโหลดข้อมูล…');
  const uid = (await SB.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000000';
  const [cases, events, vendors, trucks, evid, setg, prof] = await Promise.all([
    run('อ่านเคส',        () => SB.from('cases').select('*')),
    run('อ่านไทม์ไลน์',    () => SB.from('events').select('*').order('at')),
    run('อ่านทะเบียนซับ',  () => SB.from('vendors').select('*')),
    run('อ่านทะเบียนรถ',   () => SB.from('trucks').select('*')),
    run('อ่านหลักฐาน',     () => SB.from('evidence').select('*').order('added_at')),
    run('อ่านการตั้งค่า',   () => SB.from('settings').select('*').eq('id', 1).maybeSingle()),
    run('อ่านโปรไฟล์',     () => SB.from('profiles').select('*').eq('id', uid).maybeSingle()),
  ]);

  S.cases = {}; S.events = {};
  for(const c of cases){ S.cases[c.id] = outCase(c); S.events[c.id] = []; }
  for(const e of events){ (S.events[e.case_id] ||= []).push(outEvent(e)); }

  S.vendors = {}; for(const v of vendors) S.vendors[v.code] = v;
  S.trucks  = {}; for(const t of trucks)  S.trucks[t.key]   = outTruck(t);

  const evRows = evid.map(outEv);
  await signAll(evRows);
  S.evidence = {}; for(const r of evRows) S.evidence[r.id] = r;

  S.settings = (setg && setg.data) || {};
  S.settings.bus ||= ['MKM','CDC'];
  S.me = prof ? { username:prof.email, display:prof.display, role:prof.role,
                  bu:prof.bu, active:prof.active, id:prof.id } : null;

  setConn('on', S.me?.bu ? `เชื่อมต่อแล้ว · เห็นเฉพาะ ${S.me.bu}` : 'เชื่อมต่อแล้ว');
  return S;
}

/* ---------- อัปเดตสด : คนอื่นแก้ แล้วหน้าเราขยับตาม ----------
   ตอนกำลังบันทึกหลายเคสพร้อมกันเอง (เช่น กด "ทำเครื่องหมายรับเคลม" ทีละหลายสิบเคส) ห้ามให้รอบดึงข้อมูล
   สดตรงนี้แทรกเข้ามากลางคัน — ถ้าแทรก มันจะอ่านฐานข้อมูล ณ ตอนที่ยังบันทึกไม่ครบทุกเคส แล้วเอาผลนั้นมา
   เขียนทับข้อมูลในเครื่องทิ้ง ทำให้เคสที่เพิ่งกดปิดไปแล้วก่อนหน้านั้นในชุดเดียวกัน "เด้งกลับ" เป็นเปิดอยู่
   เหมือนเดิม (บั๊กที่เจอจริง) โค้ดที่บันทึกหลายเคสพร้อมกันจึงต้องเรียก suspendLive() คร่อมช่วงที่กำลังวน
   บันทึก แล้วเรียก resumeLive() ตอนจบ — พอปล่อยแล้วจะดึงรอบล่าสุดให้ทันทีอีกทีให้ชัวร์ */
let liveTimer = null;
let liveSuspendCount = 0;
function suspendLive(){ liveSuspendCount++; clearTimeout(liveTimer); }
function resumeLive(){
  liveSuspendCount = Math.max(0, liveSuspendCount - 1);
  if(liveSuspendCount === 0) bump();
}
function bump(){
  if(liveSuspendCount > 0) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    try{ await pullState(); if(typeof render === 'function') render(); }catch(e){}
  }, 1200);
}
function startLive(){
  SB.channel('claim-live')
    .on('postgres_changes', { event:'*', schema:'public', table:'cases' },  bump)
    .on('postgres_changes', { event:'*', schema:'public', table:'events' }, bump)
    .subscribe();
}
