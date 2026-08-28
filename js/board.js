/* ============================================================
   board.js — กระดานเคส · คิวต้องส่งวันนี้ · หน้ารายละเอียดเคส · ร่างเมล
   ============================================================ */

/* ---------- แถบเตือนบนสุด ---------- */
function renderAlert(){
  const open   = CACHE.filter(x => x.m.status === 'OPEN');
  const breach = open.filter(x => x.m.sla === 'BREACH');
  const risk   = open.filter(x => x.m.sla === 'AT_RISK');
  const need   = open.filter(x => x.m.needsAction);
  const todo   = open.filter(x => (x.m.sla === 'BREACH' || x.m.sla === 'AT_RISK' || x.m.needsAction) && !x.m.sentToday);
  const el = document.getElementById('alert');
  if(!breach.length && !risk.length){
    el.innerHTML = `<div class="alert calm"><strong>ไม่มีเคสค้างเกินกำหนด</strong>
      <span>เปิดอยู่ ${open.length} เคส ทุกเคสยังอยู่ในกรอบ 48 ชั่วโมง</span></div>`;
    return;
  }
  el.innerHTML = `<div class="alert">
    <strong>ต้องส่งเมลวันนี้ ${todo.length} เคส</strong>
    <span>เกิน 48 ชม. แล้ว ${breach.length} · ใกล้ครบกำหนด ${risk.length}${need.length ? ` · ซับปฏิเสธถาวรรอทำต่อ ${need.length}` : ''}</span>
    <span class="sp"><button type="button" id="aGo">เปิดคิวต้องส่งวันนี้</button>
    <button type="button" id="aMail">ร่างเมลทวง</button></span></div>`;
  document.getElementById('aGo').onclick  = () => setView('queue');
  document.getElementById('aMail').onclick = () => openMail();
}

/* ---------- การ์ดรายซับ ---------- */
function renderVendorStrip(){
  /* ตัวเลขในการ์ดต้องตรงกับตัวกรอง ขนส่ง / BU / สถานะ / คำค้น ที่เลือกอยู่บนแถบด้านบน
     จึงคำนวณจาก scopedCache() แทนที่จะเป็น CACHE ทั้งก้อน — ไม่กรองด้วยซับ (F.vendor)
     เพราะการ์ดต้องขึ้นครบทุกซับให้กดเลือกได้เสมอ */
  const list = scopedCache();
  const m = new Map();
  for(const {m:x} of list){
    const v = vendorOf(x);
    const s = m.get(v) || {v, open:0, breach:0, closed:0, sum:0, n:0};
    if(x.status === 'OPEN'){ s.open++; if(x.sla === 'BREACH') s.breach++; }
    if(x.status === 'CLOSED'){ s.closed++; s.sum += x.el; s.n++; }
    m.set(v, s);
  }
  const st = [...m.values()].sort((a,b) => (b.open+b.closed) - (a.open+a.closed));
  const total = list.length;
  const tOpen = list.filter(x => x.m.status === 'OPEN').length;
  const tBr   = list.filter(x => x.m.status === 'OPEN' && x.m.sla === 'BREACH').length;
  const card = (key, name, all, open, br, avg) => {
    const okw = all ? Math.max(0, (all-open)/all*100) : 0;
    const brw = all ? br/all*100 : 0;
    const rest = Math.max(0, 100-okw-brw);
    return `<button class="vcard" data-v="${esc(key)}" aria-pressed="${F.vendor===key}">
      <span class="vn">${esc(name)}<em>${all}</em></span>
      <span class="vbar"><i style="width:${okw}%;background:var(--ok)"></i><i style="width:${rest}%;background:var(--warn)"></i><i style="width:${brw}%;background:var(--bad)"></i></span>
      <span class="vm">เปิด ${open}${br?` · <b>เกิน ${br}</b>`:''}${avg!=null?` · เฉลี่ย ${avg.toFixed(0)} ชม.`:''}</span></button>`;
  };
  let h = card('all', 'ทุกซับ', total, tOpen, tBr, null);
  for(const s of st) h += card(s.v, s.v, s.open+s.closed, s.open, s.breach, s.n ? s.sum/s.n : null);
  const el = document.getElementById('vstrip');
  el.innerHTML = h;
  el.querySelectorAll('.vcard').forEach(b => b.onclick = () => { F.vendor = b.dataset.v; render(); });
}

/* ---------- ตารางเคส ---------- */
function gauge(m){
  if(m.el == null) return '<span class="mono" style="color:var(--faint)">ไม่มีข้อมูลเวลา</span>';
  const pct = Math.min(100, m.el/SLA_H*100);
  const col = (m.sla === 'BREACH' || m.sla === 'OVERDUE') ? 'var(--bad)'
            : m.sla === 'AT_RISK' ? 'var(--warn)' : 'var(--ok)';
  const lbl = m.status === 'CLOSED' ? `ใช้ ${hrs(m.el)}`
            : m.remain >= 0 ? `เหลือ ${hrs(m.remain)}` : `เกิน ${hrs(-m.remain)}`;
  return `<span class="gauge"><i style="width:${pct}%;background:${col}"></i></span><span class="mono" style="font-size:12px">${lbl}</span>`;
}
function statusChip(m){
  if(m.status === 'NO_DATA') return '<span class="chip n">ไม่มีข้อมูล</span>';
  if(m.status === 'CLOSED')  return m.sla === 'ON_TIME'
      ? '<span class="chip ok">ปิด · ทันกำหนด</span>' : '<span class="chip bad">ปิด · เกินกำหนด</span>';
  if(m.needsAction) return '<span class="chip bad">ปฏิเสธถาวร · ต้องทำต่อ</span>';
  return m.sla === 'BREACH'  ? '<span class="chip bad">เกิน 48 ชม.</span>'
       : m.sla === 'AT_RISK' ? '<span class="chip warn">ใกล้ครบกำหนด</span>'
       : '<span class="chip ok">อยู่ในกรอบ</span>';
}
function renderTable(){
  const list = visible().sort((a,b) => {
    const rank = x => x.m.status === 'CLOSED' ? 2 : x.m.status === 'NO_DATA' ? 1 : 0;
    return rank(a) !== rank(b) ? rank(a) - rank(b) : (b.m.el||0) - (a.m.el||0);
  });
  document.getElementById('count').textContent = `แสดง ${list.length} จาก ${CACHE.length} เคส`;
  const tb = document.getElementById('rows');
  if(!list.length){ tb.innerHTML = '<tr><td colspan="7" class="empty">ไม่พบเคสตามเงื่อนไขที่เลือก</td></tr>'; return; }
  tb.innerHTML = list.map(({c,m,bu}) => `<tr data-id="${esc(c.id)}">
    <td class="id">${esc(c.id)}<span class="sub">${c.carrier} · ${esc(bu)}</span></td>
    <td>${m.vendor ? esc(m.vendor) : '<span style="color:var(--faint)">—</span>'}${m.flags.length?'<span class="flagdot" title="ข้อมูลน่าสงสัย"></span>':''}</td>
    <td>${esc(c.store_name || c.store || '—')}<span class="sub">${esc(c.truck||'')} ${esc(c.driver||'')}</span></td>
    <td class="r">${c.amount ? c.amount.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
    <td class="mono" style="font-size:12px;white-space:nowrap">${fmt(m.t0)}${m.fixed?' *':''}</td>
    <td>${gauge(m)}</td>
    <td>${statusChip(m)}</td></tr>`).join('');
  tb.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => openCase(tr.dataset.id));
}

/* ---------- คิวต้องส่งวันนี้ ---------- */
function renderQueue(){
  const el = document.getElementById('queue');
  const todo = CACHE.filter(({m}) => m.status === 'OPEN' && (m.sla === 'BREACH' || m.sla === 'AT_RISK' || m.needsAction))
    .filter(({c,m,bu}) => vendorPass(m)
                       && (F.carrier === 'all' || c.carrier === F.carrier)
                       && (F.bu === 'all' || bu === F.bu));
  const unknownPanel = renderUnknownPanel();
  if(!todo.length){
    el.innerHTML = unknownPanel
      || '<div class="qgroup"><div class="empty">ไม่มีเคสที่ต้องตามวันนี้</div></div>';
    bindUnknown(el);
    return;
  }
  const g = new Map();
  for(const x of todo){ const v = vendorOf(x.m); (g.get(v) || g.set(v,[]).get(v)).push(x); }
  el.innerHTML = unknownPanel + [...g.entries()].sort((a,b) => b[1].length - a[1].length).map(([v, items]) => {
    const left = items.filter(x => !x.m.sentToday).length;
    return `<div class="qgroup">
      <div class="qhead"><h3>${esc(v)}</h3>
        <span class="chip ${left?'bad':'ok'}">${left ? `ยังไม่ได้ส่งวันนี้ ${left} เคส` : 'ส่งครบแล้ววันนี้'}</span>
        <span class="sp"><button type="button" class="sm pri" data-mail="${esc(v)}">ร่างเมลถึง ${esc(v)}</button></span></div>
      ${items.sort((a,b) => b.m.el - a.m.el).map(({c,m}) => `<div class="qrow">
        <span class="qid">${esc(c.id)}</span>
        <span class="qi">${esc(c.store_name||c.store||'')} · ${esc(c.truck||'')} ${esc(c.driver||'')} · ${c.amount?c.amount.toLocaleString('th-TH'):'—'} บาท</span>
        <span class="qh">${m.remain<0 ? 'เกิน '+hrs(-m.remain) : 'เหลือ '+hrs(m.remain)}</span>
        <label class="sentmark"><input type="checkbox" data-sent="${esc(c.id)}" ${m.sentToday?'checked':''}> ส่งแล้ววันนี้</label>
        <button type="button" class="sm" data-open="${esc(c.id)}">เปิด</button></div>`).join('')}
    </div>`;
  }).join('');
  bindUnknown(el);
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openCase(b.dataset.open));
  el.querySelectorAll('[data-mail]').forEach(b => b.onclick = () => openMail(b.dataset.mail));
  el.querySelectorAll('[data-sent]').forEach(cb => cb.onchange = async () => {
    const id = cb.dataset.sent;
    if(cb.checked){
      await addEvent(id, {at:isoLocal(NOW()), type:'FOLLOWUP', vendor:compute(byId(id)).vendor,
                          text:'ทวงงานทางเมล (ทำเครื่องหมายจากคิว)'});
    } else {
      const list = S.events[id] || [];
      const e = [...list].reverse().find(e => e.type === 'FOLLOWUP' && todayKey(D(e.at)) === todayKey());
      if(e){ await API.delEvent(id, e.id); S.events[id] = list.filter(x => x.id !== e.id); render(); }
    }
  });
}

/* ---------- หน้ารายละเอียดเคส ---------- */
let openId = null;
async function addEvent(id, e){
  const j = await API.addEvent(id, e);
  (S.events[id] ||= []).push(j.event);
  render();
  if(document.getElementById('dlg').open && openId === id) openCase(id);
}

function openCase(id){
  openId = id;
  const c = byId(id); if(!c) return;
  const m = compute(c);
  document.getElementById('dTitle').textContent = c.id;
  document.getElementById('dSub').textContent =
    `${c.carrier} · สาขา ${c.store_name||c.store||'—'} · ${c.truck||''} ${c.driver||''}`;
  const vOpts = [...new Set(vendorNames(true).concat(m.vendor ? [m.vendor] : []))];

  document.getElementById('dBody').innerHTML = `
    ${truckHint(c, m)}
    ${m.flags.map(f => `<div class="warnbox"><b>ตรวจสอบ:</b> ${esc(f.t)}</div>`).join('')}
    <div class="grid2">
      <div class="kv"><div class="k">ซับที่ถือเคสอยู่</div><div class="v">${esc(m.vendor||'—')}</div></div>
      <div class="kv"><div class="k">ยอดเคลม</div><div class="v">${c.amount?baht(c.amount):'—'} บาท</div></div>
      <div class="kv"><div class="k">สาเหตุ</div><div class="v">${esc(c.reason||'—')}</div></div>
      <div class="kv"><div class="k">สถานะ</div><div class="v">${statusChip(m)}</div></div>
    </div>

    <div class="slaband">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <b style="font-family:'Bai Jamjuree',sans-serif">นาฬิกา 48 ชั่วโมง</b>
        <span class="mono" style="font-size:12px">รับเมล ${fmt(m.t0,true)} → ครบกำหนด ${m.deadline?fmt(isoLocal(m.deadline),true):'—'}</span>
      </div>
      ${m.el==null ? '<p class="hint" style="margin:9px 0 0">ยังไม่มีเวลารับเมล — กรอกด้านล่างเพื่อเริ่มนับ</p>' : `
      <div class="sbar">${legBars(m)}<span class="sdl" style="left:${Math.min(100, SLA_H/Math.max(m.el,SLA_H)*100)}%" title="ครบกำหนด 48 ชม."></span></div>
      <div class="sfoot">
        <span>รวม ${hrs(m.el)}</span>
        <span>ซับถือเคส ${hrs(m.legs.reduce((s,l)=>s+l.h,0))}</span>
        <span>ค้างฝั่งเรา ${hrs(m.internal)}</span>
        ${m.status!=='CLOSED' ? `<span style="color:${m.remain<0?'var(--bad)':'inherit'}">${m.remain<0?'เกินกำหนด '+hrs(-m.remain):'เหลือ '+hrs(m.remain)}</span>` : ''}
      </div>`}
    </div>

    ${m.legs.length ? `<div class="slabel">เวลาแยกรายซับ</div>
    <div class="tw" style="margin-bottom:20px"><table style="min-width:420px"><thead><tr>
      <th>ซับ</th><th>ส่งเมื่อ</th><th>ตอบเมื่อ</th><th style="text-align:right">ใช้เวลา</th><th>ผล</th></tr></thead><tbody>
      ${m.legs.map(l => `<tr style="cursor:default"><td>${esc(l.vendor||'—')}</td>
        <td class="mono" style="font-size:12px">${fmt(l.start)}</td>
        <td class="mono" style="font-size:12px">${l.end?fmt(l.end):'<span style="color:var(--bad)">ยังไม่ตอบ</span>'}</td>
        <td class="r" style="${l.h>SLA_H?'color:var(--bad)':''}">${hrs(l.h)}</td>
        <td>${l.result?`<span class="chip ${TYPES[l.result].cls}">${TYPES[l.result].th}</span>`:'—'}</td></tr>`).join('')}
    </tbody></table></div>` : ''}

    <div class="slabel">บันทึกเหตุการณ์ (Log)</div>
    <div class="tline">${m.ev.map((e,i) => evHtml(e,i,m)).join('') || '<p class="hint">ยังไม่มีบันทึก</p>'}</div>

    <fieldset><legend>เพิ่มบันทึกใหม่</legend>
      <form id="fAdd" novalidate>
        <div class="frow">
          <div class="fld"><label for="fAt">วันเวลา</label>
            <input type="datetime-local" id="fAt" required value="${isoLocal(NOW())}">
            <span class="err">ต้องระบุวันเวลา</span></div>
          <div class="fld"><label for="fType">เกิดอะไรขึ้น</label>
            <select id="fType">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.th}</option>`).join('')}</select></div>
          <div class="fld"><label for="fVendor">ซับที่เกี่ยวข้อง</label>
            <select id="fVendor"><option value="">— ไม่ระบุ —</option>${vOpts.map(v=>`<option ${v===m.vendor?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
        </div>
        <div class="frow"><div class="fld"><label for="fNote">หมายเหตุ (พิมพ์อิสระ)</label>
          <textarea id="fNote" placeholder="เช่น โทรตามแล้ว ซับขอตรวจกับหน้างานก่อน / แนบใบนำออกแล้ว"></textarea></div></div>
        <div class="actions"><button type="submit" class="pri">บันทึก</button>
          <span class="hint" style="margin:0">เวลาที่กรอกคือเวลาที่เกิดเหตุการณ์จริง ระบบเก็บเวลาที่กดบันทึกแยกไว้ให้เอง</span></div>
      </form>
    </fieldset>

    <fieldset><legend>แก้เวลารับเมล (จุดเริ่มนาฬิกา)</legend>
      <p class="hint">ใช้เมื่อวันเวลาที่นำเข้ามาผิด${c.ref_date?` · ไฟล์ต้นทางระบุวันรับของไว้ที่ <b>${esc(c.ref_date)}</b>`:''}</p>
      <form id="fFix" novalidate><div class="frow">
        <div class="fld"><label for="xAt">เวลารับเมลที่ถูกต้อง</label>
          <input type="datetime-local" id="xAt" required value="${m.t0?m.t0.slice(0,16):(c.ref_date?c.ref_date+'T08:00':isoLocal(NOW()))}"></div>
        <div class="fld"><label for="xWhy">เหตุผล</label>
          <input type="text" id="xWhy" placeholder="เช่น ในเมลพิมพ์เดือนผิด" value="${esc(c.t0why||'')}"></div>
      </div>
      <div class="actions"><button type="submit">บันทึกเวลาใหม่</button>
        ${m.fixed?'<button type="button" id="xUndo" class="gh">ย้อนกลับเป็นค่าจากไฟล์</button>':''}</div></form>
    </fieldset>

    <fieldset><legend>หลักฐานประกอบเคส</legend>
      <p class="hint">แนบภาพเมล ใบนำออก ภาพ GPS หรือเอกสารยอดเงิน แล้วผูกกับเหตุการณ์ที่เกี่ยวข้องได้</p>
      <div id="evWrap"></div>
    </fieldset>

    <div class="actions" style="margin-top:4px">
      <button type="button" id="dMail">ร่างเมลทวงเคสนี้</button>
      ${c.source !== 'seed' ? '<button type="button" class="gh" id="dDel" style="color:var(--bad)">ลบเคสนี้</button>' : ''}
    </div>`;

  const dlg = document.getElementById('dlg');
  if(!dlg.open) dlg.showModal();
  dlg.querySelector('.db').scrollTop = 0;
  renderEvidence(c.id);

  document.getElementById('fAdd').onsubmit = async ev => {
    ev.preventDefault();
    const at = document.getElementById('fAt').value;
    if(!at){ document.getElementById('fAt').reportValidity(); return; }
    await addEvent(c.id, {at, type:document.getElementById('fType').value,
      vendor:document.getElementById('fVendor').value || null,
      text:document.getElementById('fNote').value.trim()});
    toast('บันทึกแล้ว');
  };
  document.getElementById('fFix').onsubmit = async ev => {
    ev.preventDefault();
    const at = document.getElementById('xAt').value;
    if(!at){ document.getElementById('xAt').reportValidity(); return; }
    await API.patchCase(c.id, {t0fix:at, t0why:document.getElementById('xWhy').value.trim()});
    c.t0fix = at; c.t0why = document.getElementById('xWhy').value.trim();
    render(); openCase(c.id); toast('แก้เวลารับเมลแล้ว นาฬิกาคำนวณใหม่');
  };
  const un = document.getElementById('xUndo');
  if(un) un.onclick = async () => { await API.patchCase(c.id, {t0fix:null, t0why:''}); c.t0fix = null; render(); openCase(c.id); };
  document.getElementById('dMail').onclick = () => { dlg.close(); openMail(m.vendor, [c.id]); };
  const dd = document.getElementById('dDel');
  if(dd) dd.onclick = async () => {
    if(!confirm(`ลบเคส ${c.id} และบันทึกทั้งหมด?`)) return;
    await API.delCase(c.id); delete S.cases[c.id]; delete S.events[c.id];
    dlg.close(); render(); toast('ลบเคสแล้ว');
  };
  dlg.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    await API.delEvent(c.id, b.dataset.del);
    S.events[c.id] = (S.events[c.id]||[]).filter(e => e.id !== b.dataset.del);
    render(); openCase(c.id);
  });
}

function legBars(m){
  const span = Math.max(m.el, SLA_H);
  const colors = ['var(--accent)','#7C68C4','#8E7FD0','#6A55B4'];
  let h = '', prevEnd = D(m.t0);
  m.legs.forEach((l, i) => {
    const s = (D(l.start) - D(m.t0)) / 36e5, w = l.h;
    const gs = (prevEnd - D(m.t0)) / 36e5;
    if(s > gs + .01)
      h += `<span class="sseg" style="left:${gs/span*100}%;width:${(s-gs)/span*100}%;background:var(--faint)" title="ค้างฝั่งเรา"></span>`;
    const over = (s + w) > SLA_H;
    h += `<span class="sseg" style="left:${s/span*100}%;width:${w/span*100}%;background:${over?'var(--bad)':colors[i%4]}" title="${esc(l.vendor||'')} ${hrs(w)}">${w/span > .16 ? esc(l.vendor||'') : ''}</span>`;
    prevEnd = new Date(D(l.start).getTime() + w*36e5);
  });
  return h;
}

function evHtml(e, i, m){
  const t = TYPES[e.type] || TYPES.NOTE;
  const own = e.src !== 'import' && e.src !== 'seed';
  const del = own ? `<button type="button" class="sm gh" data-del="${esc(e.id)}" style="padding:0 6px;font-size:11px">ลบ</button>` : '';
  let gapNote = '';
  if(i > 0 && e.at && m.ev[i-1].at){
    const g = (D(e.at) - D(m.ev[i-1].at)) / 36e5;
    if(g >= 6) gapNote = `<div class="gapn">ห่างจากรายการก่อนหน้า ${hrs(g)}</div>`;
  }
  return `${gapNote}<div class="tev ${e.type}">
    <div class="th"><span class="chip ${t.cls}">${t.th}</span>
      <span class="tt">${e.at ? fmt(e.at,true) : 'ไม่ระบุเวลา'}</span>
      ${e.vendor?`<span class="tt">· ${esc(e.vendor)}</span>`:''}
      ${own?'<span class="chip n">บันทึกเอง</span>':''}${del}</div>
    ${e.text?`<div class="tx ${own?'own':''}">${esc(e.text)}</div>`:''}</div>`;
}

/* ---------- ร่างเมลทวงงาน ---------- */
function openMail(vendor, only){
  document.getElementById('mdlg').dataset.ask = '';
  askQueue = [];
  document.getElementById('mTitle').textContent = 'ร่างเมลทวงงาน';
  document.getElementById('mVendor').closest('.frow').style.display = '';
  document.getElementById('mMark').style.display = '';
  const vendors = [...new Set(CACHE.filter(x => x.m.status === 'OPEN' && x.m.vendor).map(x => x.m.vendor))].sort();
  const sel = document.getElementById('mVendor');
  sel.innerHTML = vendors.length ? vendors.map(v => `<option ${v===vendor?'selected':''}>${esc(v)}</option>`).join('') : '<option>—</option>';
  const build = () => {
    const v = sel.value;
    let list = CACHE.filter(x => x.m.vendor === v && x.m.status === 'OPEN');
    if(only) list = list.filter(x => only.includes(x.c.id));
    list.sort((a,b) => b.m.el - a.m.el);
    const d = NOW();
    const dt = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
    const vend = S.vendors[v];
    document.getElementById('mSubj').value = `ติดตามรายการเคลมค้างตอบ ${v} — ${list.length} รายการ (ณ ${dt})`;
    document.getElementById('mBody').value =
`เรียน ${vend && vend.display ? vend.display : v}${vend && vend.email ? `\n(อีเมล: ${vend.email})` : ''}

ขอติดตามรายการเคลมที่ส่งไปแล้วและยังไม่ได้รับการยืนยัน ณ วันที่ ${dt} ดังนี้

${list.map((x,i) => {
  const c = x.c, m = x.m;
  const age = m.remain < 0 ? `เกินกำหนด ${hrs(-m.remain)}` : `เหลือเวลา ${hrs(m.remain)}`;
  return `${i+1}. ${c.id}
   สาขา ${c.store_name || c.store || '-'} · ทะเบียน ${c.truck || '-'} · พขร. ${c.driver || '-'}
   ยอด ${c.amount ? baht(c.amount) : '-'} บาท · ${c.reason || '-'}
   ส่งเมลเมื่อ ${fmt(m.t0,true)} · ${age}`;
}).join('\n\n')}

ตามข้อตกลง กรอบเวลาตอบกลับคือ 48 ชั่วโมงนับจากเวลาที่ส่งเมล
รบกวนยืนยันผลการรับเคลมกลับมาด้วยครับ/ค่ะ หากรายการใดไม่ใช่รถในความดูแล รบกวนแจ้งกลับพร้อมเหตุผลเพื่อจะได้ส่งต่อให้ผู้รับผิดชอบต่อไป

ขอบคุณครับ/ค่ะ`;
    document.getElementById('mNote').textContent =
      `${list.length} เคส · รวม ${baht0(list.reduce((s,x)=>s+(x.c.amount||0),0))} บาท`;
    const mk = document.getElementById('mMark');
    mk.dataset.ids = list.map(x => x.c.id).join(',');
    mk.dataset.v = v;

    /* เติมอีเมลซับให้เอง ถ้าเคยบันทึกไว้ในทะเบียนซับ */
    const to = document.getElementById('mEmail'), hint = document.getElementById('mEmailHint');
    if(to){
      to.value = (vend && vend.email) || '';
      hint.innerHTML = to.value
        ? '<span style="color:var(--ok)">ดึงจากทะเบียนซับให้แล้ว</span>'
        : `<span style="color:var(--warn)">ยังไม่ได้บันทึกอีเมลของ ${esc(v)} — ใส่ตรงนี้ครั้งเดียว
           ระบบจะจำไว้ให้ครั้งหน้า</span>`;
    }
  };
  sel.onchange = build; build();
  document.getElementById('mdlg').showModal();
}

/* ---------- เปิดหน้าเขียนเมลของ Outlook พร้อมเนื้อหาที่ร่างไว้ ---------- */
const mailFields = () => ({
  to:   (document.getElementById('mEmail') || {}).value || '',
  cc:   (document.getElementById('mCc')    || {}).value || '',
  subj: document.getElementById('mSubj').value,
  body: document.getElementById('mBody').value,
});

/* จำอีเมลที่พิมพ์ใหม่ไว้ในทะเบียนซับ ครั้งหน้าจะได้ไม่ต้องพิมพ์ซ้ำ */
async function rememberVendorEmail(){
  /* โหมดถามหาเจ้าของก็ซ่อนช่องเลือกซับเหมือนกัน แต่รู้ว่าถามใครอยู่จาก dataset
     ส่วนโหมด Memo ผู้รับคือหัวหน้า ไม่ใช่ซับ จึงไม่ต้องจำ */
  const ask = document.getElementById('mdlg').dataset.ask || '';
  const row = document.getElementById('mVendor').closest('.frow');
  if(row && row.style.display === 'none' && !ask) return;
  const v = ask || document.getElementById('mVendor').value;
  const email = (document.getElementById('mEmail').value || '').trim();
  const vend = S.vendors[v];
  if(!v || !email || !vend || vend.email === email) return;
  try{
    await API.putVendor(v, {...vend, email});
    await pullState();
    toast(`บันทึกอีเมลของ ${v} ไว้แล้ว`);
  }catch(e){ /* บันทึกไม่ได้ก็ไม่เป็นไร เมลยังเปิดได้ */ }
}

function openOutlook(){
  const f = mailFields();
  if(!f.to && !confirm('ยังไม่ได้ใส่อีเมลผู้รับ — เปิด Outlook แบบเว้นช่องถึงไว้ก่อนไหม')) return;
  rememberVendorEmail();
  const q = new URLSearchParams();
  if(f.cc) q.set('cc', f.cc);
  q.set('subject', f.subj);
  q.set('body', f.body);
  /* คง @ และ ; ไว้เป็นตัวอักษรจริง เพราะ Outlook รุ่นเก่าบางตัวอ่าน %40 ไม่ออก */
  const addr = encodeURIComponent(f.to).replace(/%40/g, '@').replace(/%3B/gi, ';');
  const url = `mailto:${addr}?${q.toString().replace(/\+/g, '%20')}`;
  /* mailto ยาวเกินไปบางเครื่องจะตัดเนื้อหาทิ้ง จึงเตือนและให้คัดลอกแทน */
  if(url.length > 1900){
    if(!confirm('เนื้อเมลยาวมาก บาง Outlook อาจตัดข้อความท้ายทิ้ง\n\n'
      + 'กด ตกลง เพื่อเปิดต่อ หรือ ยกเลิก แล้วใช้ปุ่มคัดลอกทั้งฉบับแทน (ปลอดภัยกว่า)')) return;
  }
  location.href = url;
  toast('เปิดหน้าเขียนเมลใน Outlook แล้ว — ตรวจอีกรอบก่อนกดส่ง');
}

function openOutlookWeb(){
  const f = mailFields();
  rememberVendorEmail();
  const q = new URLSearchParams({ to:f.to, subject:f.subj, body:f.body });
  if(f.cc) q.set('cc', f.cc);
  window.open('https://outlook.office.com/mail/deeplink/compose?' + q.toString(), '_blank', 'noopener');
  toast('เปิด Outlook บนเว็บแล้ว — ตรวจอีกรอบก่อนกดส่ง');
}


/* ============================================================
   แผง "ยังไม่รู้ว่าเป็นของซับไหน" ในหน้าคิวต้องส่งวันนี้
   เดิมเคสกลุ่มนี้หายไปเฉย ๆ เพราะไม่มีชื่อซับให้จัดกลุ่ม
   ============================================================ */
function renderUnknownPanel(){
  const list = unknownCases();
  if(!list.length) return '';
  const groups = unknownByVendor(list);
  const none = list.filter(x => !x.guess.length);
  const TIER = {1:'เคยรับเคลมทะเบียนนี้', 2:'จากชื่อ พขร.', 3:'จากรายชื่อรถของซับ', 4:'ซับสัมปทาน'};

  return `<div class="qgroup" id="unkPanel">
    <div class="qhead"><h3>ยังไม่รู้ว่าเป็นของซับไหน</h3>
      <span class="chip ${list.length ? 'warn' : 'ok'}">${list.length} เคสค้าง</span>
      <span class="sp">${groups.length
        ? `<button type="button" class="sm pri" id="unkAskAll">ร่างเมลถามทั้ง ${groups.length} ราย</button>` : ''}</span></div>

    <div class="pbody" style="padding:12px 16px 0">
      <p class="hint" style="margin:0">ระบบไล่หาเจ้าของจากหลักฐานที่มี — ทะเบียนที่เคยรับเคลม
        ชื่อคนขับ และรายชื่อรถที่ซับแจ้งไว้ แล้วเสนอเป็น<b>ผู้ต้องสงสัย</b>
        เคสหนึ่งมีได้หลายราย เพราะเป้าหมายคือไล่ถามให้ครบ ไม่ใช่ตัดสินแทน</p>
    </div>

    <div class="tw" style="border:0;border-top:1px solid var(--rule);margin-top:12px">
      <table style="min-width:900px"><thead><tr>
        <th>เลขเคลม</th><th>ทะเบียน · พขร.</th><th>ค้างมาแล้ว</th>
        <th>ผู้ต้องสงสัย</th><th>รู้มาจากไหน</th></tr></thead><tbody>
      ${list.map(({c, m, guess}) => `<tr data-open="${esc(c.id)}">
        <td class="id">${esc(c.id)}<span class="sub">${c.carrier}</span></td>
        <td>${esc(c.truck || '—')}<span class="sub">${esc(c.driver || 'ไม่มีชื่อ พขร.')}</span></td>
        <td class="mono" style="color:var(--bad)">${m.remain < 0 ? 'เกิน ' + hrs(-m.remain) : hrs(m.remain)}</td>
        <td>${guess.length
            ? guess.map(g => `<span class="chip ${g.tier <= 2 ? 'ok' : 'a'}">${esc(g.vendor)}</span>`).join(' ')
            : '<span class="chip bad">ไม่มีเบาะแส</span>'}</td>
        <td class="sub">${guess.length ? esc(guess[0].why) : 'ไม่มีทั้งประวัติ ชื่อคนขับ และรายชื่อรถ'}</td>
      </tr>`).join('')}
      </tbody></table>
    </div>

    ${groups.length ? `<div class="pbody" style="padding:12px 16px">
      <div class="slabel" style="margin-bottom:8px">ร่างเมลถามทีละราย</div>
      <div class="actions" style="margin:0;flex-wrap:wrap">
        ${groups.map(g => `<button type="button" class="sm" data-ask="${esc(g.v)}">
          ${esc(g.v)} <b>${g.items.length}</b> เคส
          <span style="color:var(--muted)">· ${esc(TIER[g.best])}</span></button>`).join('')}
      </div></div>` : ''}

    ${none.length ? `<div class="pbody" style="padding:0 16px 14px">
      <div class="warnbox"><b>${none.length} เคสยังไม่มีเบาะแสเลย</b>
        ${none.map(x => esc(x.c.id)).join(' · ')}<br>
        ทะเบียนพวกนี้ไม่เคยมีซับไหนรับเคลม ไม่มีชื่อคนขับที่ชี้ได้ และไม่อยู่ในรายชื่อรถของซับรายใด
        — ลองนำเข้ารายชื่อรถของซับเพิ่มที่หน้าทะเบียนรถ
        <button type="button" class="sm" id="unkGoFleet" style="margin-left:6px">ไปหน้าทะเบียนรถ</button></div>
    </div>` : ''}
  </div>`;
}

function bindUnknown(el){
  el.querySelectorAll('[data-ask]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    openAskMail(b.dataset.ask);
  });
  const all = el.querySelector('#unkAskAll');
  if(all) all.onclick = () => {
    const g = unknownByVendor(unknownCases());
    askQueue = g.map(x => x.v);
    openAskMail(askQueue[0]);
  };
  const go = el.querySelector('#unkGoFleet');
  if(go) go.onclick = () => setView('fleet');
}

/* คิวรายชื่อซับที่ต้องถามต่อ เวลาผู้ใช้กด "ถามทั้งหมด" */
let askQueue = [];

/* ---------- เมลแบบ "ถามว่าใช่รถของท่านไหม" ----------
   ต่างจากเมลทวงงานตรงที่เรายังไม่รู้ว่าเป็นของเขาจริงไหม
   จึงต้องบอกให้ชัดว่าเรารู้มาจากไหน และขอให้ยืนยันกลับ           */
function openAskMail(vendor){
  const groups = unknownByVendor(unknownCases());
  const g = groups.find(x => x.v === vendor);
  if(!g){ toast('ไม่มีเคสที่ต้องถามรายนี้แล้ว'); return; }

  const d = NOW();
  const dt = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
  const vend = S.vendors[vendor];

  document.getElementById('mTitle').textContent = 'ร่างเมลถามหาเจ้าของรถ';
  document.getElementById('mVendor').closest('.frow').style.display = 'none';
  document.getElementById('mMark').style.display = '';

  document.getElementById('mSubj').value =
    `ขอความอนุเคราะห์ยืนยันเจ้าของรถ — ${g.items.length} รายการ (ณ ${dt})`;
  document.getElementById('mBody').value =
`เรียน ${vend && vend.display ? vend.display : vendor}

มีรายการเคลมค้างอยู่ ${g.items.length} รายการ ที่ทางเรายังระบุไม่ได้ว่าเป็นรถของผู้ประกอบการรายใด
จากข้อมูลที่มีอยู่พบว่าอาจเกี่ยวข้องกับท่าน จึงขอความอนุเคราะห์ตรวจสอบและยืนยันกลับ

${g.items.map((x, i) => {
  const c = x.c, m = x.m;
  const age = m.remain < 0 ? `ค้างมาแล้ว ${hrs(-m.remain + SLA_H)}` : `รับเรื่องเมื่อ ${fmt(m.t0, true)}`;
  return `${i+1}. ${c.id}
   ทะเบียน ${c.truck || '-'} · พขร. ${c.driver || '-'}
   สาขา ${c.store_name || c.store || '-'} · ยอด ${c.amount ? baht(c.amount) : '-'} บาท · ${c.reason || '-'}
   รับเมลเมื่อ ${fmt(m.t0, true)} · ${age}
   เหตุที่ติดต่อท่าน: ${x.why}`;
}).join('\n\n')}

รบกวนแจ้งกลับว่าเป็นรถในความดูแลของท่านหรือไม่
- ถ้าใช่ รบกวนยืนยันรับเคลม โดยกรอบเวลาตอบกลับคือ 48 ชั่วโมงนับจากวันที่ท่านยืนยัน
- ถ้าไม่ใช่ รบกวนแจ้งกลับเพื่อจะได้ตัดออกจากรายชื่อและส่งต่อให้ผู้รับผิดชอบต่อไป

ขอบคุณครับ/ค่ะ`;

  const left = askQueue.length ? askQueue.indexOf(vendor) : -1;
  document.getElementById('mNote').textContent =
    `${g.items.length} เคส · รวม ${baht0(g.items.reduce((s, x) => s + (x.c.amount || 0), 0))} บาท`
    + (left >= 0 ? ` · ร่างที่ ${left + 1} จาก ${askQueue.length} — กดบันทึกว่าส่งแล้ว จะเปิดรายถัดไปให้เอง` : '');

  const mk = document.getElementById('mMark');
  mk.dataset.ids = g.items.map(x => x.c.id).join(',');
  mk.dataset.v = vendor;

  const to = document.getElementById('mEmail'), hint = document.getElementById('mEmailHint');
  if(to){
    to.value = (vend && vend.email) || '';
    hint.innerHTML = to.value
      ? '<span style="color:var(--ok)">ดึงจากทะเบียนซับให้แล้ว</span>'
      : `<span style="color:var(--warn)">ยังไม่ได้บันทึกอีเมลของ ${esc(vendor)}</span>`;
  }
  /* ให้ปุ่มจำอีเมลรู้ว่ากำลังถามซับรายไหนอยู่ ทั้งที่ช่องเลือกซับถูกซ่อน */
  document.getElementById('mdlg').dataset.ask = vendor;
  document.getElementById('mdlg').showModal();
}
