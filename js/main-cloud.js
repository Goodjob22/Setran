/* ============================================================
   main.js — ผูกทุกอย่างเข้าด้วยกันและเริ่มทำงาน
   ============================================================ */
function setView(v){
  F.view = v;
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  render();
  window.scrollTo({top:0, behavior:'smooth'});
}

function render(){
  recompute();
  /* แถบเลือกหลายเคส (ทำเครื่องหมายซับรับเคลม/ใส่เลข Memo) ใช้ร่วมกันได้ทุกแท็บ ไม่ใช่แค่หน้ากระดาน
     เช่น เลือกจากตารางเทียบยอดในหน้า "นำเข้าสรุป Period" ก็ได้ จึงต้องอัปเดตทุกครั้งที่ render ไม่ใช่แค่ตอนอยู่หน้ากระดาน */
  renderMemoBar();
  const isCase = ['board','queue','memo'].includes(F.view);
  document.getElementById('vsec').hidden = !isCase;
  document.getElementById('alert').hidden = !isCase;
  document.getElementById('filterBar').hidden = !isCase && F.view !== 'fleet' && F.view !== 'summary';
  /* สถานะ (ยังไม่ปิด/เกิน 48 ชม./ปิดแล้ว/ข้อมูลน่าสงสัย) มีความหมายเฉพาะหน้ากระดาน/คิว — หน้า Memo มีตัวกรอง
     "ขอบเขต" ของตัวเองอยู่แล้ว (เคสค้าง/เคสสำเร็จ) ส่วนหน้าทะเบียนรถไม่มีสถานะเคสรายทะเบียน จึงซ่อนแถบนี้ไว้
     กันสับสนว่ากดแล้วทำไมไม่มีผล */
  document.getElementById('statusSeg').hidden = (F.view === 'memo' || F.view === 'fleet');
  document.querySelectorAll('#statusSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.st === F.status));
  document.querySelectorAll('#carrierSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.cr === F.carrier));

  const buSeg = document.getElementById('buSeg');
  /* หน้าทะเบียนรถมีตัวกรอง BU ของตัวเองอยู่แล้ว (#fleetBUSeg ผูกกับ fleetBU) ซ่อนอันนี้กันมีสองปุ่ม BU
     ซ้อนกันบนจอเดียว ซึ่งปุ่มนี้จะไม่มีผลอะไรกับรายการทะเบียนที่เห็นเลย */
  buSeg.hidden = (F.view === 'fleet');
  const bus = buList();
  buSeg.innerHTML = `<button data-bu="all" aria-pressed="${F.bu==='all'}">ทุก BU</button>` +
    bus.map(b => `<button data-bu="${esc(b)}" aria-pressed="${F.bu===b}">${esc(b)}</button>`).join('');
  buSeg.querySelectorAll('button').forEach(b => b.onclick = () => { F.bu = b.dataset.bu; render(); });

  if(isCase) { renderAlert(); renderVendorStrip(); }
  for(const v of ['board','queue','entry','reconcile','summary','close','fleet','vendors','memo','dashboard','settings'])
    document.getElementById(v).hidden = F.view !== v;
  ({board:renderTable, queue:renderQueue, entry:renderEntry, reconcile:renderReconcile, summary:renderSummaryView,
    close:renderPeriodClose, fleet:renderFleet, vendors:renderVendorsView, memo:renderMemo,
    dashboard:renderDashboard, settings:renderSettings})[F.view]();

  document.getElementById('orgTag').textContent = S.settings.orgName || 'DHL · CJ';
  const mine = allCases().filter(c => c.source && c.source !== 'seed' && c.source !== 'import' && c.source !== 'reconcile').length;
  document.getElementById('foot').textContent =
    `${CACHE.length} เคส (คีย์เองในระบบ ${mine}) · ${Object.keys(S.trucks).length} ทะเบียนรถ · ` +
    `${Object.keys(S.vendors).length} ซับ · ${Object.keys(S.evidence).length} รูปหลักฐาน · ` +
    `ข้อมูลเก็บบน Supabase ทุกคนที่ล็อกอินเห็นชุดเดียวกัน`;
  syncTop();
}

function tickClock(){
  const d = NOW();
  document.getElementById('clockNow').textContent =
    `ตอนนี้ ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function syncTop(){
  const h = document.querySelector('.top').offsetHeight;
  document.documentElement.style.setProperty('--topH', h + 'px');
}

/* ---------- ผูกปุ่มถาวร ---------- */
document.querySelectorAll('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
document.querySelectorAll('#statusSeg button').forEach(b => b.onclick = () => { F.status = b.dataset.st; render(); });
document.querySelectorAll('#carrierSeg button').forEach(b => b.onclick = () => { F.carrier = b.dataset.cr; render(); });
document.getElementById('q').oninput = e => { F.q = e.target.value; render(); };
document.querySelectorAll('dialog [data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if(e.target === d) d.close(); }));
addEventListener('resize', syncTop);

document.getElementById('btnMailAll').onclick = () => openMail();
document.getElementById('memoBarAccept').onclick = () => bulkAccept();
document.getElementById('memoBarGo').onclick = () => openMemoAssign();
document.getElementById('memoBarClear').onclick = () => { boardSelect.clear(); render(); };
document.getElementById('btnExportCase').onclick = () => {
  const rows = [['เลขเคลม','ขนส่ง','BU','สาขา','ชื่อสาขา','ทะเบียน','พขร.','ซับปัจจุบัน','ยอดก่อน VAT','VAT','ยอด','สาเหตุ',
    'รับเมล','ครบกำหนด','ปิดเมื่อ','ใช้เวลา(ชม.)','ซับถือเคส(ชม.)','ค้างฝั่งเรา(ชม.)','สถานะ','SLA','ธงตรวจสอบ']];
  for(const {c,m,bu} of visible()) rows.push([c.id, c.carrier, bu, c.store, c.store_name, c.truck, c.driver,
    m.vendor, c.ex_vat||'', c.vat||'', c.amount, c.reason, m.t0?fmt(m.t0,true):'', m.deadline?fmt(isoLocal(m.deadline),true):'',
    m.tEnd?fmt(m.tEnd,true):'', m.el?.toFixed(2), m.legs.reduce((s,l)=>s+l.h,0).toFixed(2),
    m.internal?.toFixed(2), m.status, m.sla, m.flags.map(f=>f.k).join(' ')]);
  download(`claim-cases-${stamp()}.csv`, csv(rows));
};
document.getElementById('btnExportLog').onclick = () => {
  const rows = [['เลขเคลม','ขนส่ง','วันเวลาเหตุการณ์','ประเภท','ซับ','หมายเหตุ','ที่มา','เวลาที่กดบันทึก']];
  for(const {c,m} of visible()) for(const e of m.ev)
    rows.push([c.id, c.carrier, e.at?fmt(e.at,true):'', (TYPES[e.type]||{}).th||e.type, e.vendor, e.text,
      (e.src === 'seed' || e.src === 'import') ? 'นำเข้าจากไฟล์' : 'บันทึกเอง', e.loggedAt||'']);
  download(`claim-log-${stamp()}.csv`, csv(rows));
};
document.getElementById('mOutlook').onclick = () => openOutlook();
document.getElementById('mOwa').onclick     = () => openOutlookWeb();
document.getElementById('mCopy').onclick = async () => {
  const txt = document.getElementById('mSubj').value + '\n\n' + document.getElementById('mBody').value;
  try{ await navigator.clipboard.writeText(txt); toast('คัดลอกแล้ว — วางใน Gmail ได้เลย'); }
  catch(e){ document.getElementById('mBody').select(); toast('กด Ctrl+C เพื่อคัดลอก'); }
};
document.getElementById('mMark').onclick = async () => {
  const b = document.getElementById('mMark');
  const ids = (b.dataset.ids || '').split(',').filter(Boolean);
  const at = isoLocal(NOW());
  suspendLive();
  try{
    for(const id of ids)
      await addEvent(id, {at, type:'FOLLOWUP', vendor:b.dataset.v, text:'ส่งเมลติดตามงานแล้ว'});
  } finally { resumeLive(); }
  toast(`บันทึกแล้ว ${ids.length} เคส`);
  const dlg = document.getElementById('mdlg');
  dlg.close();
  /* ถ้ากำลังไล่ถามหลายราย เปิดร่างของรายถัดไปให้ต่อเลย */
  if(dlg.dataset.ask && askQueue.length){
    askQueue = askQueue.filter(v => v !== dlg.dataset.ask);
    if(askQueue.length) setTimeout(() => openAskMail(askQueue[0]), 400);
    else toast('ถามครบทุกรายแล้ว');
  }
};

/* ---------- เริ่มทำงาน ---------- */
document.getElementById('whoBtn').onclick = e => {
  e.stopPropagation();
  const m = document.getElementById('whoMenu');
  m.hidden = !m.hidden;
};
document.addEventListener('click', () => { document.getElementById('whoMenu').hidden = true; });
document.getElementById('miPw').onclick  = () => openPassword();
document.getElementById('miOut').onclick = () => { if(confirm('ออกจากระบบ?')) logout(); };

async function startApp(){
  tickClock();
  try{
    await pullState();
    if(S.me) ME = S.me;
    if(!ME || !ME.active){
      const { data:{ user } } = await SB.auth.getUser();
      return waitScreen(user?.email);
    }
    document.getElementById('whoName').textContent =
      (ME.display || ME.username || '—') + (ME.role === 'admin' ? ' · แอดมิน' : '') +
      (ME.bu ? ' · ' + ME.bu : '');
    document.getElementById('app').hidden = true;
    document.getElementById('main').hidden = false;
    render();
    startLive();
    /* เติมซับให้เคสที่ทะเบียนชี้ไปซับเดียวชัดเจนอยู่แล้ว — รันครั้งเดียวตอนเปิดแอปเสร็จ ไม่ผูกกับ render()
       เพราะ render() ถูกเรียกถี่มาก (ทุกครั้งที่สลับแท็บ/พิมพ์ค้นหา/ทุก 60 วิ) ถ้าผูกไว้แล้วมีเคสค้างเยอะ
       จะยิงคำสั่งบันทึกเป็นชุด ๆ ต่อเนื่องไม่หยุด ทำให้ตัวบอกสถานะ "กำลังบันทึก" ติดค้างและกดดันฐานข้อมูลเกินจำเป็น */
    autoFillKnownVendors();
  }catch(e){
    document.getElementById('app').hidden = false;
    document.getElementById('app').innerHTML =
      `<div class="loading"><b style="color:var(--bad)">โหลดข้อมูลไม่สำเร็จ</b><br><br>
       ตรวจว่าใส่ค่า <code class="path">CONFIG.url</code> และ <code class="path">CONFIG.anonKey</code>
       ในไฟล์ <code class="path">config.js</code> ถูกต้อง<br>
       และรันไฟล์ SQL ทั้งสามไฟล์ใน Supabase ครบแล้ว<br><br>
       <span class="mono" style="font-size:12px">${esc(e.message)}</span></div>`;
  }
  clearInterval(window._tick);
  window._tick = setInterval(() => {
    tickClock();
    if(!document.querySelector('dialog[open]') && F.view !== 'entry' && F.view !== 'settings') render();
  }, 60000);
}

(async function boot(){
  if(!CONFIGURED){
    document.getElementById('authWrap').hidden = false;
    document.getElementById('authWrap').innerHTML =
      `<div class="authbox"><div class="authhead"><div class="authmark">⚙</div>
        <div><h1>ยังไม่ได้ใส่คีย์</h1><p>ต่อกับ Supabase ไม่ได้</p></div></div>
       <div class="authnote">เปิดไฟล์ <b>config.js</b> แล้วใส่ค่าสองบรรทัด<br><br>
         <b>url</b> — จาก Supabase &gt; Project Settings &gt; Data API &gt; Project URL<br>
         <b>anonKey</b> — จากหน้าเดียวกัน ช่อง anon public<br><br>
         บันทึกไฟล์แล้วรีเฟรชหน้านี้</div></div>`;
    return;
  }
  const { data:{ session } } = await SB.auth.getSession();
  if(!session) return authScreen('login');
  document.getElementById('shell').hidden = false;
  await startApp();
})();

/* ถ้าเซสชันหลุดกลางทาง ให้กลับไปหน้าล็อกอินเอง */
if(SB) SB.auth.onAuthStateChange((event) => {
  if(event === 'SIGNED_OUT') location.reload();
});
