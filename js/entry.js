/* ============================================================
   entry.js — ฟอร์มคีย์งานเข้า (โหมดคู่ขนานกับไฟล์ Excel เดิม)
   ============================================================ */
let E = {carrier:'DHL', vendor:'', at:'', items:[{}]};
const REASONS = ['สินค้าส่งขาด','สินค้าชำรุดจากการขนส่ง','สินค้าส่งเกิน','สินค้าไม่ได้คุณภาพ'];
const DEPTS   = ['Frozen & Dairy','Fruit & Vegetable','Seafood','Butchery','Grocery'];
const ID_PAT  = {DHL: /^MKM-\d{4}-\d{2}-\d{5}$/i, CJ: /^CLM-\d{6}-F\d{4}$/i};

function storeOptions(){
  const m = new Map();
  for(const c of allCases()) if(c.store) m.set(String(c.store), c.store_name || '');
  return [...m.entries()].sort((a,b) => (+a[0]||0) - (+b[0]||0));
}
const storeKey = s => String(s||'').trim().toLowerCase();
const findStore = input => storeOptions().find(([id]) => storeKey(id) === storeKey(input)) || null;
const caseIdExists = id => !!S.cases[String(id).trim()] ||
  allCases().some(c => c.id.toUpperCase() === String(id).trim().toUpperCase());

function nearDuplicate(truck, store_, at){
  if(!truck || !at) return null;
  const day = at.slice(0,10);
  return CACHE.find(({c,m}) => c.truck && plateKey(c.truck) === plateKey(truck)
    && String(c.store) === String(store_) && m.t0 && m.t0.slice(0,10) === day) || null;
}
const countToday = () => allCases().filter(c => c.createdAt && c.createdAt.slice(0,10) === new Date().toISOString().slice(0,10) && c.source !== 'seed').length;
const myCases = () => allCases().filter(c => c.source && c.source !== 'seed').sort((a,b) => (a.createdAt||'') < (b.createdAt||'') ? 1 : -1);

function renderEntry(){
  const stores = storeOptions();
  const vOpts  = vendorNames(true);
  const nowV   = E.at || isoLocal(NOW());
  const dl     = new Date(D(nowV).getTime() + SLA_H*36e5);
  const mine   = myCases();

  document.getElementById('entry').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>คีย์เคสเข้าระบบ</h3>
        <span class="sp">
          <span class="chip a">คีย์วันนี้แล้ว ${countToday()} เคส</span>
          <button type="button" class="sm" id="eExpDHL">ส่งออกรูปแบบไฟล์ DHL</button>
          <button type="button" class="sm" id="eExpCJ">ส่งออกรูปแบบไฟล์ CJ</button></span></div>
      <div class="pbody"><form id="eForm" novalidate>
        <div class="frow">
          <div class="fld" style="max-width:215px"><label for="eAt">วันเวลารับเมล *</label>
            <input type="datetime-local" id="eAt" required value="${nowV}">
            <span class="inline-hint mono">ครบกำหนด ${fmt(isoLocal(dl), true)}</span></div>
          <div class="fld" style="max-width:120px"><label for="eCarrier">ขนส่ง *</label>
            <select id="eCarrier"><option ${E.carrier==='DHL'?'selected':''}>DHL</option>
              <option ${E.carrier==='CJ'?'selected':''}>CJ</option></select></div>
          <div class="fld"><label for="eId">เลขเคลม *</label>
            <input type="text" id="eId" required autocomplete="off" spellcheck="false"
              placeholder="${E.carrier==='DHL'?'MKM-2026-08-00531':'CLM-202608-F2031'}">
            <span class="err" id="eIdErr"></span><span class="inline-hint" id="eIdOk"></span></div>
          <div class="fld"><label for="eVendor">ซับที่ส่งต่อ *</label>
            <select id="eVendor"><option value="">— เลือก —</option>
              ${vOpts.map(v=>`<option ${v===E.vendor?'selected':''}>${esc(v)}</option>`).join('')}</select>
            <span class="inline-hint" id="eVendorHint"></span></div>
        </div>
        <div class="frow">
          <div class="fld"><label for="eStore">รหัสสาขา *</label>
            <input type="text" id="eStore" required autocomplete="off" list="eStoreList" placeholder="พิมพ์รหัสสาขา">
            <datalist id="eStoreList">${stores.map(([id])=>`<option value="${esc(id)}">`).join('')}</datalist>
            <span class="inline-hint" id="eStoreHint"></span></div>
          <div class="fld" style="max-width:200px"><label for="eStoreName">ชื่อสาขา</label>
            <input type="text" id="eStoreName" autocomplete="off" placeholder="ชื่อสาขา"></div>
          <div class="fld" style="max-width:165px"><label for="eTruck">ทะเบียนรถ *</label>
            <input type="text" id="eTruck" required autocomplete="off" placeholder="71-4708">
            <span class="inline-hint" id="eTruckHint"></span></div>
          <div class="fld" style="max-width:210px"><label for="eDriver">ชื่อ พขร.</label>
            <input type="text" id="eDriver" autocomplete="off" list="eDriverList" placeholder="พิมพ์ชื่อ ระบบจะเดาซับให้">
            <datalist id="eDriverList"></datalist>
            <span class="inline-hint" id="eDriverHint"></span></div>
          <div class="fld"><label for="eReason">สาเหตุ *</label>
            <select id="eReason">${REASONS.map(r=>`<option>${esc(r)}</option>`).join('')}</select></div>
          <div class="fld" style="max-width:175px"><label for="eDept">แผนก</label>
            <select id="eDept"><option value="">—</option>${DEPTS.map(d=>`<option>${esc(d)}</option>`).join('')}</select></div>
        </div>

        <div class="slabel" style="margin:18px 0 8px">รายการสินค้า</div>
        <div class="tw" style="margin:0 0 12px"><table style="min-width:640px"><thead><tr>
          <th style="width:110px">รหัส</th><th>ชื่อสินค้า</th>
          <th style="width:80px;text-align:right">ส่ง</th><th style="width:80px;text-align:right">รับ</th>
          <th style="width:70px;text-align:right">ต่าง</th><th style="width:120px;text-align:right">ยอด (บาท)</th><th style="width:40px"></th>
        </tr></thead><tbody id="eItems"></tbody>
        <tfoot><tr><td colspan="5"><button type="button" class="sm gh" id="eAddItem" style="color:var(--accent)">+ เพิ่มรายการ</button></td>
          <td class="r" style="font-weight:600" id="eTotal">0.00</td><td></td></tr></tfoot></table></div>

        <div class="frow"><div class="fld"><label for="eNote">หมายเหตุ</label>
          <textarea id="eNote" placeholder="พิมพ์อิสระ — ไม่ถูกนำไปคำนวณเวลา"></textarea></div></div>
        <div id="eWarn"></div>
        <div class="actions">
          <button type="submit" class="pri">บันทึกแล้วคีย์ต่อ</button>
          <button type="button" id="eSaveOpen">บันทึกแล้วเปิดเคส</button>
          <button type="button" class="gh" id="eClear">ล้างฟอร์ม</button>
          <span class="hint" style="margin:0">ระบบจำ ขนส่ง / ซับ / วันเวลา ไว้ให้ใบถัดไป</span>
        </div>
      </form></div>
    </div>

    ${mine.length ? `<div class="panel">
      <div class="phead"><h3>เคสที่คีย์ในระบบนี้</h3>
        <span class="sp"><span class="hint" style="margin:0">${mine.length} เคส — รวมอยู่ในกระดานและรายงานทุกหน้าแล้ว</span></span></div>
      <div class="tw" style="border:0"><table style="min-width:700px"><thead><tr>
        <th>เลขเคลม</th><th>ขนส่ง</th><th>สาขา</th><th>ทะเบียน</th><th>ซับ</th>
        <th style="text-align:right">ยอด</th><th>รับเมล</th><th></th></tr></thead><tbody>
        ${mine.slice(0,50).map(c => { const m = compute(c); return `<tr>
          <td class="id">${esc(c.id)}</td><td>${c.carrier}</td><td>${esc(c.store)}</td>
          <td class="mono" style="font-size:12px">${esc(c.truck||'')}</td><td>${esc(m.vendor||'')}</td>
          <td class="r">${baht(c.amount)}</td>
          <td class="mono" style="font-size:12px">${fmt(m.t0,true)}</td>
          <td><button type="button" class="sm gh" data-del-case="${esc(c.id)}">ลบ</button></td></tr>`; }).join('')}
      </tbody></table></div></div>` : ''}

    <div class="note" style="border:1px solid var(--rule);border-left:3px solid var(--accent);
      background:var(--surface);padding:14px 18px;margin:0">
      <b style="font-family:'Bai Jamjuree',sans-serif">โหมดคู่ขนาน</b>
      <p style="margin:5px 0 0;font-size:14px;color:var(--muted)">ปุ่ม “ส่งออกรูปแบบไฟล์ DHL / CJ” ให้ไฟล์ที่คอลัมน์เรียงตรงกับไฟล์เดิมที่ใช้ส่งต่อให้ฝ่ายอื่น — คีย์ที่นี่ทีเดียว แล้ววางกลับเข้าไฟล์เดิมได้โดยไม่ต้องคีย์ซ้ำ</p>
    </div>`;

  renderItems();
  const $ = id => document.getElementById(id);
  $('eCarrier').onchange = e => { E.carrier = e.target.value; render(); };
  $('eAt').onchange      = e => { E.at = e.target.value; render(); };
  $('eVendor').onchange  = e => { E.vendor = e.target.value; checkTruck(); };
  $('eId').oninput = () => {
    const v = $('eId').value.trim(), el = $('eId'), err = $('eIdErr'), okEl = $('eIdOk');
    el.classList.remove('bad','good','warn'); err.style.display = 'none'; okEl.textContent = '';
    if(!v) return;
    if(caseIdExists(v)){
      el.classList.add('bad');
      err.innerHTML = 'เลขเคลมนี้มีอยู่แล้ว — <a class="vlink" id="eGo">เปิดเคสเดิมเพื่อเพิ่มบันทึก</a>';
      err.style.display = 'block';
      const g = $('eGo'); if(g) g.onclick = () => openCase(allCases().find(c => c.id.toUpperCase() === v.toUpperCase()).id);
    } else if(!ID_PAT[E.carrier].test(v)){
      el.classList.add('warn');
      okEl.innerHTML = `<span style="color:var(--warn)">รูปแบบไม่ตรงกับที่เคยใช้ (${E.carrier==='DHL'?'MKM-YYYY-MM-#####':'CLM-YYYYMM-F####'}) — บันทึกได้ แต่ตรวจอีกครั้ง</span>`;
    } else { el.classList.add('good'); okEl.innerHTML = '<span style="color:var(--ok)">เลขนี้ยังไม่มีในระบบ</span>'; }
  };
  $('eTruck').oninput = checkTruck;
  $('eStore').oninput = () => { checkStore(); checkNear(); };
  $('eAddItem').onclick = () => { E.items.push({}); renderItems(); };
  $('eClear').onclick = () => { E.items = [{}]; render(); };
  $('eForm').onsubmit = ev => { ev.preventDefault(); saveEntry(true); };
  $('eSaveOpen').onclick = () => saveEntry(false);
  $('eExpDHL').onclick = () => exportSourceFormat('DHL');
  $('eExpCJ').onclick  = () => exportSourceFormat('CJ');
  document.querySelectorAll('#entry [data-del-case]').forEach(b => b.onclick = async () => {
    if(!confirm(`ลบเคส ${b.dataset.delCase}?`)) return;
    await API.delCase(b.dataset.delCase);
    delete S.cases[b.dataset.delCase]; delete S.events[b.dataset.delCase];
    render(); toast('ลบแล้ว');
  });
  /* รายชื่อ พขร. ทั้งหมดให้เลือก เรียงคนที่มีเคสเยอะไว้ก่อน */
  const dlist = $('eDriverList');
  if(dlist) dlist.innerHTML = [...driverMap().values()]
    .sort((a, b) => b.cases.length - a.cases.length)
    .map(d => `<option value="${esc(d.display)}">`).join('');
  $('eDriver').oninput  = checkTruck;
  $('eDriver').onchange = checkTruck;
  checkTruck();

  /* อ่านสองทางพร้อมกัน: ทะเบียนรถ และชื่อพนักงานขับรถ
     ทะเบียนที่เคยมีซับตอบรับ = หลักฐานแน่นที่สุด
     ชื่อ พขร. = กุญแจดอกที่สอง ใช้ตอนทะเบียนใหม่ หรือใช้เช็คว่าพิมพ์ทะเบียนผิดไหม */
  function checkTruck(){
    const raw = $('eTruck').value.trim();
    const hint = $('eTruckHint'), vh = $('eVendorHint');
    hint.textContent = ''; vh.textContent = '';
    const t = raw ? buildFleet().find(x => splitPlates(raw).map(plateKey).includes(x.key)) : null;

    if(raw && !t) hint.innerHTML = '<span style="color:var(--muted)">ทะเบียนใหม่ ยังไม่เคยมีเคส</span>';
    else if(t){
      hint.innerHTML = `<span style="color:var(--muted)">${t.bu?'BU '+esc(t.bu)+' · ':''}เคยมี ${t.cases.length} เคส${t.drivers.size?' · พขร. '+esc([...t.drivers][0]):''}</span>`;
      if(!$('eDriver').value && t.drivers.size) $('eDriver').value = [...t.drivers][0];
    }

    const byDriver = checkDriver();               /* วาดคำใบ้ช่อง พขร. แล้วคืนค่าที่เดาได้ */
    const byPlate  = t && t.confirmed ? {v:t.confirmed, src:'ซับที่เคยรับเคลมทะเบียนนี้'} : null;
    const byPri    = t && t.primary   ? {v:t.primary,   src:'ซับหลักที่ตั้งไว้'} : null;

    /* สองทางชี้คนละราย = สัญญาณอันตราย ต้องขึ้นก่อนเรื่องอื่น */
    if(byPlate && byDriver && byPlate.v !== byDriver.vendor){
      vh.innerHTML = `<span style="color:var(--bad)">ทะเบียนชี้ <b>${esc(byPlate.v)}</b>
        แต่ชื่อ พขร. ชี้ <b>${esc(byDriver.vendor)}</b> — ตรวจว่าพิมพ์ทะเบียนถูกไหม</span>`;
      checkNear(); return;
    }

    /* ทะเบียนอยู่ในรายชื่อของหลายซับ = ยังชี้ไม่ได้ บอกให้ไล่ถามแทน */
    if(t && !byPlate && !byDriver && t.roster.length > 1){
      vh.innerHTML = `<span style="color:var(--warn)">ทะเบียนนี้อยู่ในรายชื่อของ
        <b>${t.roster.map(esc).join('</b> · <b>')}</b> — เลือกเองว่าจะส่งรายไหนก่อน</span>`;
      checkNear(); return;
    }
    const byRos = t && t.rosterPick ? {v:t.rosterPick, src:'รายชื่อรถของซับ'} : null;
    const pick = byPlate
      || (byDriver ? {v:byDriver.vendor, src:`ซับที่ พขร. คนนี้เคยวิ่งให้ (${byDriver.n} เคส)`} : null)
      || byRos || byPri;
    if(pick){
      const sel = $('eVendor');
      if(!sel.value){ sel.value = pick.v; E.vendor = pick.v; }
      const both = byPlate && byDriver && byPlate.v === byDriver.vendor;
      vh.innerHTML = sel.value === pick.v
        ? `<span style="color:var(--ok)">ตรงกับ${esc(pick.src)}${both?' และชื่อ พขร. ก็ตรงกัน':''}</span>`
        : `<span style="color:var(--bad)">${esc(pick.src)}คือ <b>${esc(pick.v)}</b> — ส่งผิดรายจะโดนตีกลับ</span>`;
    }
    checkNear();
  }

  /* อ่านชื่อ พขร. แล้วบอกว่าเดาซับได้ไหม พร้อมเตือนถ้าชื่อคล้ายคนอื่นจนน่าจะพิมพ์ผิด */
  function checkDriver(){
    const box = $('eDriverHint');
    if(!box) return null;
    const name = $('eDriver').value.trim();
    box.textContent = '';
    if(!name) return null;

    const near = driverNear(name);
    if(near.length && !driverMap().get(dkey(name))){
      box.innerHTML = `<span style="color:var(--warn)">ชื่อนี้ยังไม่เคยมีในระบบ · คล้ายกับ
        ${near.map(d => `<b>${esc(d.display)}</b>`).join(' หรือ ')} — พิมพ์ตกหล่นหรือเปล่า</span>`;
      return null;
    }
    const r = driverVendor(name);
    if(!r){ box.innerHTML = '<span style="color:var(--muted)">ชื่อใหม่ ยังไม่เคยมีเคส</span>'; return null; }
    if(r.vendor){
      box.innerHTML = `<span style="color:var(--ok)">เคยวิ่งให้ <b>${esc(r.vendor)}</b> · ${r.n} เคส`
        + (r.driver.plateText.size ? ` · ทะเบียน ${esc([...r.driver.plateText].slice(0,2).join(', '))}` : '') + '</span>';
      return {vendor:r.vendor, n:r.n, driver:r.driver};
    }
    box.innerHTML = `<span style="color:var(--muted)">${esc(r.why)}</span>`;
    return null;
  }
  function checkNear(){
    const dup = nearDuplicate($('eTruck').value.trim(), $('eStore').value, $('eAt').value);
    $('eWarn').innerHTML = dup
      ? `<div class="warnbox"><b>อาจเป็นเคสเดียวกัน:</b> มีเคส <b>${esc(dup.c.id)}</b> ทะเบียนเดียวกัน สาขาเดียวกัน วันเดียวกันอยู่แล้ว — ตรวจก่อนบันทึก</div>` : '';
  }
  /* พิมพ์รหัสสาขาที่เคยมี = เติมชื่อให้อัตโนมัติ / รหัสใหม่ = ให้กรอกชื่อเองได้ */
  function checkStore(){
    const hint = $('eStoreHint'), v = $('eStore').value;
    if(!v.trim()){ hint.textContent = ''; return; }
    const found = findStore(v);
    if(found){
      hint.innerHTML = `<span style="color:var(--ok)">สาขาเดิม${found[1]?' — '+esc(found[1]):''}</span>`;
      if(!$('eStoreName').value.trim()) $('eStoreName').value = found[1] || '';
    } else {
      hint.innerHTML = '<span style="color:var(--muted)">สาขาใหม่ ยังไม่เคยมีเคส — กรอกชื่อสาขาได้</span>';
    }
  }
}

function renderItems(){
  const tb = document.getElementById('eItems');
  if(!tb) return;
  tb.innerHTML = E.items.map((it,i) => {
    const diff = (it.rec !== '' && it.rec != null && it.load !== '' && it.load != null) ? (+it.rec - +it.load) : '';
    return `<tr>
      <td><input type="text" class="cell" data-i="${i}" data-f="code" value="${esc(it.code||'')}" autocomplete="off"></td>
      <td><input type="text" class="cell" data-i="${i}" data-f="name" value="${esc(it.name||'')}" autocomplete="off"></td>
      <td><input type="text" class="cell r" data-i="${i}" data-f="load" value="${esc(it.load??'')}" inputmode="decimal"></td>
      <td><input type="text" class="cell r" data-i="${i}" data-f="rec"  value="${esc(it.rec??'')}"  inputmode="decimal"></td>
      <td class="r" style="${diff<0?'color:var(--bad)':''}">${diff===''?'—':diff}</td>
      <td><input type="text" class="cell r" data-i="${i}" data-f="amt"  value="${esc(it.amt??'')}"  inputmode="decimal"></td>
      <td>${E.items.length>1?`<button type="button" class="sm gh" data-ri="${i}" style="padding:0 6px">ลบ</button>`:''}</td></tr>`;
  }).join('');
  tb.querySelectorAll('.cell').forEach(inp => inp.oninput = () => {
    const it = E.items[+inp.dataset.i];
    it[inp.dataset.f] = inp.value;
    document.getElementById('eTotal').textContent = itemTotal().toLocaleString('th-TH',{minimumFractionDigits:2});
    if(inp.dataset.f === 'load' || inp.dataset.f === 'rec'){
      const cells = tb.rows[+inp.dataset.i].cells;
      const d = (it.rec!==''&&it.rec!=null&&it.load!==''&&it.load!=null) ? (+it.rec - +it.load) : '';
      cells[4].textContent = d===''?'—':d;
      cells[4].style.color = d<0 ? 'var(--bad)' : '';
    }
    const dup = E.items.filter(x => x.code && x.code === it.code).length > 1;
    inp.closest('tr').style.background = dup && inp.dataset.f === 'code' ? 'var(--warn-bg)' : '';
  });
  tb.querySelectorAll('[data-ri]').forEach(b => b.onclick = () => { E.items.splice(+b.dataset.ri,1); renderItems(); });
  document.getElementById('eTotal').textContent = itemTotal().toLocaleString('th-TH',{minimumFractionDigits:2});
}
const itemTotal = () => E.items.reduce((s,it) => s + (parseFloat(it.amt)||0), 0);

async function saveEntry(keepGoing){
  const $ = id => document.getElementById(id);
  const at = $('eAt').value, id = $('eId').value.trim(), vendor = $('eVendor').value;
  const truck = $('eTruck').value.trim(), storeRaw = $('eStore').value.trim();
  if(!at)    { $('eAt').reportValidity(); return; }
  if(!id)    { $('eId').reportValidity(); return; }
  if(caseIdExists(id)){ toast('เลขเคลมซ้ำ — บันทึกไม่ได้'); $('eId').focus(); return; }
  if(!vendor){ toast('ต้องเลือกซับที่ส่งต่อ'); $('eVendor').focus(); return; }
  if(!storeRaw){ toast('ต้องกรอกรหัสสาขา'); $('eStore').focus(); return; }
  if(!truck) { toast('ต้องกรอกทะเบียนรถ'); $('eTruck').focus(); return; }
  /* รหัสสาขาที่เคยมีอยู่แล้ว (ต่างแค่ตัวพิมพ์เล็ก-ใหญ่หรือช่องว่าง) ให้ใช้รหัสเดิมเป๊ะ กันสาขาซ้ำ */
  const foundStore = findStore(storeRaw);
  const store_ = foundStore ? foundStore[0] : storeRaw;
  const storeName = $('eStoreName').value.trim() || (foundStore ? foundStore[1] : '');
  const dup = nearDuplicate(truck, store_, at);
  if(dup && !confirm(`มีเคส ${dup.c.id} ทะเบียน สาขา และวันเดียวกันอยู่แล้ว\n\nยืนยันว่าเป็นคนละเคสและบันทึกต่อ?`)) return;

  const items = E.items.filter(it => it.name || it.code || it.amt).map(it => ({
    code:(it.code||'').trim(), name:(it.name||'').trim(),
    qty_load:it.load??'', qty_rec:it.rec??'',
    qty_diff:(it.rec!==''&&it.rec!=null&&it.load!==''&&it.load!=null)?String(+it.rec - +it.load):'',
    amt: parseFloat(it.amt) || null, reason:$('eReason').value}));
  const rec = {
    id, carrier:E.carrier, store:store_, store_name:storeName,
    dept:$('eDept').value, driver:$('eDriver').value.trim(), truck,
    reason:$('eReason').value, ref_date:at.slice(0,10), amount:Math.round(itemTotal()*100)/100, items,
    events:[{type:'RECEIVE', at, vendor, text:$('eNote').value.trim() || `คีย์เข้าระบบ — ส่งต่อ ${vendor}`, src:'entry'}],
    source:'entry',
  };
  try{
    const j = await API.addCase(rec);
    S.cases[id] = j.case;
    const st = await API.state();
    S.events[id] = st.events[id] || [];
    /* ถ้าเป็นทะเบียนใหม่ ให้เพิ่มเข้าทะเบียนรถด้วย */
    const k = plateKey(splitPlates(truck)[0]);
    if(k && !S.trucks[k]){
      await API.putTruck(k, {plate:truck, bu:E.carrier === 'DHL' ? 'MKM' : 'CDC',
        drivers:$('eDriver').value.trim() ? [$('eDriver').value.trim()] : [], primary:null, note:''});
      const st2 = await API.state(); S.trucks = st2.trucks;
    }
  }catch(e){ toast('บันทึกไม่สำเร็จ: ' + e.message); return; }

  E.at = at; E.vendor = vendor; E.items = [{}];
  render();
  if(keepGoing){
    toast(`บันทึก ${id} แล้ว — คีย์ใบถัดไปได้เลย`);
    setTimeout(() => { const el = document.getElementById('eId'); if(el){ el.value = ''; el.focus(); } }, 60);
  } else openCase(id);
}

/* ---------- ส่งออกในรูปแบบคอลัมน์เดิมของไฟล์ต้นทาง ---------- */
function exportSourceFormat(carrier){
  const list = myCases().filter(c => c.carrier === carrier);
  if(!list.length){ toast(`ยังไม่มีเคส ${carrier} ที่คีย์ในระบบนี้`); return; }
  const d2 = s => s ? s.slice(0,10) : '';
  const noteLine = c => (S.events[c.id]||[]).map(e =>
    `${e.text || (TYPES[e.type]||{}).th || ''} ${e.at ? fmt(e.at,true) : ''}`.trim()).join(' // ');
  let rows;
  if(carrier === 'DHL'){
    rows = [['doccode','receive_date','docdate','customer_id','load_no','product_code(1)','product_name(1)',
      'dapart_nameT','Estimates_amt','load_qty','rec_qty','dif_qty','truck_driver','truck_no','reason_descT','หมายเหตุ']];
    for(const c of list) for(const it of (c.items?.length ? c.items : [{}]))
      rows.push([c.id, d2(compute(c).t0), d2(compute(c).t0), c.store, '', it.code||'', it.name||'', c.dept,
        it.amt != null ? `(${Math.abs(it.amt).toFixed(2)})` : '', it.qty_load ?? '', it.qty_rec ?? '', it.qty_diff ?? '',
        c.driver, c.truck, c.reason, noteLine(c)]);
  } else {
    rows = [['Running Claim No.','Store','Store Name','Transfer Date','WH','Item Desc','Load Qty',
      'Transfer Qty','Transfer Qty','NR-Net Amt','Price per Unit','Reason_Desc.','Reason_Desc.',
      'Truck No','Truck Driver','ขนส่ง','หมายเหตุ']];
    for(const c of list) for(const it of (c.items?.length ? c.items : [{}]))
      rows.push([c.id, c.store, c.store_name, d2(compute(c).t0), '920', it.name||'', it.qty_load ?? '',
        it.qty_rec ?? '', it.qty_diff ?? '', it.amt != null ? it.amt.toFixed(2) : '', '', c.reason, '',
        c.truck, c.driver, compute(c).vendor || '', noteLine(c)]);
  }
  download(`claim-keyin-${carrier}-${stamp()}.csv`, csv(rows));
}
