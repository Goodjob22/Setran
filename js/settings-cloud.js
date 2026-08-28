/* ============================================================
   settings.js — ตั้งค่า · สำรองข้อมูล · เชื่อม Google Sheet
   ============================================================ */
function renderSettings(){
  const st = S.settings || {};
  const isAdmin = ME && ME.role === 'admin';
  if(!isAdmin){
    document.getElementById('settings').innerHTML = `
      <div class="setgrid">
        <div class="panel"><div class="phead"><h3>บัญชีของฉัน</h3></div>
          <div class="pbody">
            <div class="grid2">
              <div class="kv"><div class="k">ชื่อผู้ใช้</div><div class="v">${esc(ME.username||"—")}</div></div>
              <div class="kv"><div class="k">ชื่อที่ใช้แสดง</div><div class="v">${esc(ME.display||'—')}</div></div>
              <div class="kv"><div class="k">สิทธิ์</div><div class="v"><span class="rolechip">ผู้ใช้ทั่วไป</span></div></div>
              <div class="kv"><div class="k">BU ที่ดูแล</div><div class="v">${ME.bu ? esc(ME.bu) : 'ทุก BU'}</div></div>
            </div>
            <div class="actions" style="margin-top:14px">
              <button type="button" class="pri" id="uPw">เปลี่ยนรหัสผ่าน</button></div>
          </div></div>
        <div class="panel"><div class="phead"><h3>การตั้งค่าอื่น</h3></div>
          <div class="pbody"><p class="hint">การตั้งค่าระบบ การสำรองข้อมูล และการเชื่อม Google Sheet
            ทำได้เฉพาะผู้ดูแลระบบ ติดต่อแอดมินของทีมได้เลย</p></div></div>
      </div>`;
    document.getElementById('uPw').onclick = () => openPassword();
    return;
  }
  document.getElementById('settings').innerHTML = `
    <div class="setgrid">
      <div class="panel">
        <div class="phead"><h3>ข้อมูลทั่วไป</h3></div>
        <div class="pbody"><form id="sGen" novalidate>
          <div class="fld" style="margin-bottom:11px"><label for="sOrg">ชื่อหน่วยงาน (ใช้ในหัว Memo)</label>
            <input type="text" id="sOrg" value="${esc(st.orgName||'')}" placeholder="เช่น ฝ่ายเคลมขนส่ง"></div>
          <div class="fld" style="margin-bottom:11px"><label for="sUser">ชื่อผู้ใช้เครื่องนี้ (กำกับหลักฐานที่แนบ)</label>
            <input type="text" id="sUser" value="${esc(st.userName||'')}" placeholder="เช่น pla"></div>
          <div class="fld" style="margin-bottom:11px"><label for="sBUs">รายชื่อ BU (คั่นด้วยจุลภาค)</label>
            <input type="text" id="sBUs" value="${esc((st.bus||[]).join(', '))}" placeholder="MKM, CDC"></div>
          <div class="actions"><button type="submit" class="pri">บันทึก</button></div>
        </form></div>
      </div>

      <div class="panel">
        <div class="phead"><h3>สำรองและกู้คืนข้อมูล</h3></div>
        <div class="pbody">
          <p class="hint">ข้อมูลทั้งหมดอยู่บน Supabase แล้ว ซึ่งมีสำเนาของตัวเองอยู่
            แต่แผนฟรีไม่มีการสำรองย้อนหลังให้ จึงควรกดดาวน์โหลดไฟล์สำรองเก็บไว้เองสัปดาห์ละครั้ง
            ไฟล์ที่ได้ใช้ข้ามไปมากับรุ่นไฟล์เดียวและรุ่นเซิร์ฟเวอร์ได้</p>
          <div class="actions" style="margin-top:12px">
            <button type="button" class="pri" id="sBackup">ดาวน์โหลดไฟล์สำรอง</button>
            <label><input type="file" id="sRestore" accept=".json,application/json" hidden>
              <button type="button" id="sRestoreBtn" class="gh">กู้คืนจากไฟล์สำรอง</button></label>
          </div>
          <p class="hint" style="margin-top:10px">ไฟล์สำรองไม่รวมรูปหลักฐาน (รูปอยู่ใน Storage ของ Supabase)
            · การกู้คืนจะเพิ่มและทับเฉพาะรายการที่มีในไฟล์ ไม่ลบของเดิมที่ไม่อยู่ในไฟล์</p>
        </div>
      </div>

      <div class="panel" style="grid-column:1/-1" id="userPanel"></div>

      <div class="panel" style="grid-column:1/-1">
        <div class="phead"><h3>เชื่อมกับ Google Sheet</h3>
          ${st.lastSync ? `<span class="sp mono" style="font-size:12px;color:var(--muted)">ส่งครั้งล่าสุด ${fmt(st.lastSync, true)}</span>` : ''}</div>
        <div class="pbody">
          <p class="hint">วิธีตั้งค่าอยู่ในไฟล์ <code class="path">apps-script/README-google-sheet.md</code> — สรุปสั้น ๆ คือสร้าง Google Sheet ใหม่ วางสคริปต์ที่ให้ไว้ใน Extensions › Apps Script แล้ว Deploy เป็น Web app จากนั้นเอา URL ที่ได้มาวางในช่องข้างล่าง</p>
          <form id="sSheet" novalidate>
            <div class="frow">
              <div class="fld" style="flex:2"><label for="sUrl">URL ของ Google Apps Script Web app</label>
                <input type="text" id="sUrl" value="${esc(st.sheetUrl||'')}" placeholder="https://script.google.com/macros/s/AKfy.../exec"></div>
              <div class="fld"><label for="sSecret">รหัสลับ (ตั้งให้ตรงกับในสคริปต์)</label>
                <input type="text" id="sSecret" value="${esc(st.sheetSecret||'')}" placeholder="เช่น claim48"></div>
            </div>
            <div class="actions">
              <button type="submit">บันทึกการตั้งค่า</button>
              <button type="button" class="pri" id="sPush" ${st.sheetUrl?'':'disabled'}>ส่งข้อมูลขึ้น Sheet ตอนนี้</button>
              <span class="hint" style="margin:0">ส่งขึ้นไป 3 ชีต: เคส · บันทึกเหตุการณ์ · ทะเบียนรถ</span>
            </div>
          </form>
          <div id="sSyncOut"></div>
        </div>
      </div>
    </div>`;

  renderUsers();

  document.getElementById('sGen').onsubmit = async ev => {
    ev.preventDefault();
    const bus = document.getElementById('sBUs').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    await API.putSettings({orgName:document.getElementById('sOrg').value.trim(),
      userName:document.getElementById('sUser').value.trim(), bus});
    await pullState(); render(); toast('บันทึกการตั้งค่าแล้ว');
  };
  document.getElementById('sSheet').onsubmit = async ev => {
    ev.preventDefault();
    await API.putSettings({sheetUrl:document.getElementById('sUrl').value.trim(),
      sheetSecret:document.getElementById('sSecret').value.trim()});
    await pullState(); render(); toast('บันทึกการตั้งค่า Google Sheet แล้ว');
  };
  document.getElementById('sBackup').onclick = () => {
    const data = { savedAt:new Date().toISOString(), from:'supabase',
      settings:S.settings, vendors:Object.values(S.vendors),
      trucks:Object.values(S.trucks).map(t => ({...t})),
      cases:Object.values(S.cases).map(c => ({...c, events:S.events[c.id] || []})) };
    download(`claim48-backup-${stamp()}.json`, JSON.stringify(data, null, 1));
    toast('ดาวน์โหลดไฟล์สำรองแล้ว — เก็บไว้ใน OneDrive หรือ Google Drive ด้วย');
  };
  document.getElementById('sRestoreBtn').onclick = () => document.getElementById('sRestore').click();
  document.getElementById('sRestore').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    if(!confirm('กู้คืนจะเขียนทับรายการที่มีเลขเดียวกัน ยืนยันหรือไม่?')) return;
    const r = new FileReader();
    r.onload = async () => {
      try{
        const d = JSON.parse(String(r.result));
        let nv = 0, nt = 0, nc = 0;
        for(const v of (d.vendors || [])){ await API.putVendor(v.code, v); nv++; }
        if((d.trucks || []).length){ await API.importTrucks(d.trucks); nt = d.trucks.length; }
        for(const c of (d.cases || [])){
          const ev = c.events || [];
          if(S.cases[c.id]) await API.patchCase(c.id, c);
          else { await API.addCase({...c, events:ev}); nc++; continue; }
          for(const x of ev) if(!(S.events[c.id]||[]).some(y => y.at === x.at && y.type === x.type))
            await API.addEvent(c.id, x);
        }
        if(d.settings) await API.putSettings({...S.settings, ...d.settings});
        await pullState(); render();
        toast(`กู้คืนแล้ว — ซับ ${nv} · ทะเบียน ${nt} · เคสใหม่ ${nc}`);
      }catch(err){ toast('กู้คืนไม่สำเร็จ: ' + err.message); }
    };
    r.readAsText(f, 'utf-8');
  };
  const push = document.getElementById('sPush');
  if(push) push.onclick = async () => {
    const out = document.getElementById('sSyncOut');
    out.innerHTML = '<p class="hint" style="margin-top:12px">กำลังส่ง…</p>';
    try{
      const r = await fetch(S.settings.sheetUrl, { method:'POST', redirect:'follow',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({ secret:S.settings.sheetSecret || '', payload:buildSheetPayload() }) });
      const j = { result: await r.json() };
      await API.putSettings({...S.settings, lastSync:new Date().toISOString()});
      out.innerHTML = `<div class="note" style="border:1px solid var(--ok);background:var(--ok-bg);color:var(--ok);padding:11px 15px;margin-top:12px">
        ส่งขึ้น Google Sheet สำเร็จ — ${esc(JSON.stringify(j.result).slice(0,200))}</div>`;
      await pullState(); toast('ส่งขึ้น Google Sheet แล้ว');
    }catch(e){
      out.innerHTML = `<div class="warnbox" style="margin-top:12px"><b>ส่งไม่สำเร็จ:</b> ${esc(e.message)}<br>
        ตรวจว่า Deploy เป็น Web app แบบ “Anyone” และรหัสลับตรงกับในสคริปต์</div>`;
    }
  };
}

/* จัดข้อมูลเป็น 3 ตารางสำหรับส่งขึ้น Google Sheet */
function buildSheetPayload(){
  const cases = [['เลขเคลม','ขนส่ง','BU','สาขา','ชื่อสาขา','ทะเบียน','พขร.','ซับ','สาเหตุ','ยอด',
    'รับเมล','ครบกำหนด','ปิดเมื่อ','ใช้เวลา(ชม.)','ซับถือ(ชม.)','ค้างฝั่งเรา(ชม.)','สถานะ','SLA','หลักฐาน(รูป)']];
  const events = [['เลขเคลม','วันเวลา','ประเภท','ซับ','หมายเหตุ','ที่มา','เวลาที่บันทึก']];
  const trucks = [['ทะเบียน','BU','ซับหลัก','ซับที่ยืนยัน','พขร.','เคส','สถานะ','หมายเหตุ']];
  for(const {c,m,bu} of CACHE){
    cases.push([c.id, c.carrier, bu, c.store, c.store_name, c.truck, c.driver, m.vendor, c.reason,
      c.amount||0, m.t0?fmt(m.t0,true):'', m.deadline?fmt(isoLocal(m.deadline),true):'',
      m.tEnd?fmt(m.tEnd,true):'', m.el!=null?+m.el.toFixed(2):'',
      +m.legs.reduce((s,l)=>s+l.h,0).toFixed(2), m.internal!=null?+m.internal.toFixed(2):'',
      m.status==='CLOSED'?'สำเร็จ':m.status==='OPEN'?(m.needsAction?'ค้าง (ปฏิเสธถาวร)':'ค้าง'):'ไม่มีข้อมูลเวลา',
      m.sla||'', caseEvidence(c.id).length]);
    for(const e of m.ev) events.push([c.id, e.at?fmt(e.at,true):'', (TYPES[e.type]||{}).th||e.type,
      e.vendor||'', e.text||'', e.src==='seed'||e.src==='import'?'นำเข้าจากไฟล์':'บันทึกเอง', e.loggedAt||'']);
  }
  for(const t of buildFleet()) trucks.push([t.display, t.bu, t.primary||'', t.confirmed||'',
    [...t.drivers].join(', '), t.cases.length, TSTATE[t.state].th, t.note||'']);
  return {sheets: {'เคส': cases, 'บันทึกเหตุการณ์': events, 'ทะเบียนรถ': trucks},
          meta: {sentAt: new Date().toISOString(), cases: CACHE.length}};
}


/* ---------- จัดการผู้ใช้ (แอดมิน) ----------
   บน Supabase แอดมินสร้างรหัสผ่านให้คนอื่นไม่ได้ (เป็นเรื่องดีด้านความปลอดภัย)
   ขั้นตอนคือ ให้เพื่อนร่วมงานกดสมัครเอง แล้วแอดมินมากดอนุมัติและเลือก BU ที่หน้านี้
   -------------------------------------------------- */
let USERS = null;

async function renderUsers(){
  const host = document.getElementById('userPanel');
  if(!host) return;
  if(!USERS){
    try{ USERS = (await API.users()).users; }
    catch(e){ host.innerHTML = `<div class="pbody"><p class="hint">โหลดรายชื่อผู้ใช้ไม่ได้: ${esc(e.message)}</p></div>`; return; }
  }
  const bus = S.settings.bus || [];
  const wait = USERS.filter(u => !u.active).length;

  host.innerHTML = `
    <div class="phead"><h3>ผู้ใช้ระบบ</h3>
      <span class="sp"><span class="hint" style="margin:0">${USERS.length} คน · แอดมิน ${USERS.filter(u=>u.role==='admin').length}${wait?` · <b style="color:var(--warn)">รออนุมัติ ${wait}</b>`:''}</span></span></div>
    <div class="pbody">
      <p class="hint" style="margin-top:0">วิธีเพิ่มคนใหม่: ให้เพื่อนร่วมงานเปิดลิงก์เว็บนี้แล้วกด
        <b>สมัครใช้งาน</b> ด้วยอีเมลบริษัทของตัวเอง ชื่อจะมาโผล่ในตารางข้างล่างแบบ “ปิดใช้”
        จากนั้นแอดมินเลือก BU ให้แล้วกด <b>เปิดใช้</b> — ทำแบบนี้แอดมินไม่ต้องรู้รหัสผ่านของใครเลย</p>
    </div>
    <div class="tw" style="border:0;border-top:1px solid var(--rule)">
      <table style="min-width:720px"><thead><tr>
        <th>อีเมล</th><th>ชื่อที่ใช้แสดง</th><th>สิทธิ์</th><th>เห็นเฉพาะ BU</th>
        <th>สถานะ</th><th></th></tr></thead><tbody>
      ${USERS.map(u => `<tr>
        <td class="id">${esc(u.username || '—')}${u.id===ME.id?' <span class="chip a">คุณ</span>':''}</td>
        <td>${esc(u.display||'—')}</td>
        <td><select class="urole" data-u="${esc(u.id)}" ${u.id===ME.id?'disabled':''}>
              <option value="user"  ${u.role!=='admin'?'selected':''}>ผู้ใช้ทั่วไป</option>
              <option value="admin" ${u.role==='admin'?'selected':''}>ผู้ดูแลระบบ</option></select></td>
        <td><select class="ubu" data-u="${esc(u.id)}">
              <option value="" ${!u.bu?'selected':''}>ทุก BU</option>
              ${bus.map(b=>`<option ${u.bu===b?'selected':''}>${esc(b)}</option>`).join('')}</select></td>
        <td>${u.active?'<span class="chip ok">ใช้งาน</span>':'<span class="chip n">ปิดใช้</span>'}</td>
        <td style="white-space:nowrap">
          ${u.id!==ME.id?`<button type="button" class="sm ${u.active?'gh':'pri'}" data-ut="${esc(u.id)}">${u.active?'ปิดใช้':'เปิดใช้'}</button>
          <button type="button" class="sm gh" data-ud="${esc(u.id)}" style="color:var(--bad)">ลบ</button>`
          :'<span class="hint" style="margin:0">แก้บัญชีตัวเองไม่ได้</span>'}
        </td></tr>`).join('')}
      </tbody></table>
    </div>
    <div class="pbody"><p class="hint" style="margin:0">การกด “ลบ” ลบเฉพาะสิทธิ์เข้าใช้งานระบบนี้
      ตัวบัญชีล็อกอินยังอยู่ใน Supabase — ถ้าจะลบให้หมดจริง ๆ ต้องลบที่เมนู Authentication ในหน้า Supabase</p></div>`;

  const save = async (id, patch, msg) => {
    try{ await API.patchUser(id, patch); USERS = null; await renderUsers(); toast(msg); }
    catch(e){ toast(e.message); }
  };
  host.querySelectorAll('.urole').forEach(sel => sel.onchange = () =>
    save(sel.dataset.u, {role:sel.value}, 'เปลี่ยนสิทธิ์แล้ว'));
  host.querySelectorAll('.ubu').forEach(sel => sel.onchange = () =>
    save(sel.dataset.u, {bu:sel.value}, sel.value ? `จำกัดให้เห็นเฉพาะ ${sel.value} แล้ว` : 'ให้เห็นทุก BU แล้ว'));
  host.querySelectorAll('[data-ut]').forEach(b => b.onclick = () => {
    const u = USERS.find(x => x.id === b.dataset.ut);
    save(u.id, {active:!u.active}, u.active ? 'ปิดใช้บัญชีแล้ว' : 'เปิดใช้บัญชีแล้ว');
  });
  host.querySelectorAll('[data-ud]').forEach(b => b.onclick = () => {
    const u = USERS.find(x => x.id === b.dataset.ud);
    if(!confirm(`ตัดสิทธิ์เข้าใช้งานของ ${u.username}?`)) return;
    (async () => { try{ await API.delUser(u.id); USERS = null; await renderUsers(); toast('ตัดสิทธิ์แล้ว'); }
                   catch(e){ toast(e.message); } })();
  });
}
