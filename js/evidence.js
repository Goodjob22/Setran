/* ============================================================
   evidence.js — คลังหลักฐาน (รูปเมล / ใบนำออก / GPS / เอกสารยอดเงิน)
   รูปเก็บเป็นไฟล์จริงในโฟลเดอร์ data/uploads บนเครื่องที่รันเซิร์ฟเวอร์
   ============================================================ */
const EV_TYPES = [
  'เมลต้นทาง (DHL / CJ)',
  'เมลซับตอบรับเคลม',
  'เมล Reject / ปฏิเสธ',
  'ใบนำออก',
  'ภาพอุณหภูมิตู้',
  'ภาพ GPS / เส้นทางรถ',
  'เอกสารยอดเงิน / สรุปยอดเคลม',
  'รูปสินค้าเสียหาย',
  'ใบเช็ค 100 / เอกสารหน้างาน',
  'อื่น ๆ',
];
const EV_MONEY = 'เอกสารยอดเงิน / สรุปยอดเคลม';
const MAX_W = 1600, MAX_H = 2600, JPEG_Q = 0.72;

/* ย่อรูปในเบราว์เซอร์ก่อนส่งขึ้นเซิร์ฟเวอร์ */
function shrink(file){
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, MAX_W/img.naturalWidth, MAX_H/img.naturalHeight);
      const w = Math.round(img.naturalWidth*sc), h = Math.round(img.naturalHeight*sc);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { res({dataUrl: cv.toDataURL('image/jpeg', JPEG_Q), w, h}); }
      catch(e){ res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

const caseEvidence = id => Object.values(S.evidence).filter(e => e.caseId === id)
  .sort((a,b) => (a.addedAt||'') < (b.addedAt||'') ? -1 : 1);

async function addEvidence(caseId, files){
  let ok = 0, fail = 0;
  for(const f of files){
    if(!f.type || !f.type.startsWith('image/')){ fail++; continue; }
    const r = await shrink(f);
    if(!r){ fail++; continue; }
    try{
      const j = await API.addEvidence({caseId, dataUrl:r.dataUrl, w:r.w, h:r.h,
        type:EV_TYPES[0], eventKey:'', mailAt:'', amount:'', desc:'', by:S.settings.userName || ''});
      S.evidence[j.evidence.id] = j.evidence;
      ok++;
    }catch(e){ fail++; }
  }
  return {ok, fail};
}

function renderEvidence(caseId){
  const host = document.getElementById('evWrap');
  if(!host) return;
  const list = caseEvidence(caseId);
  const m = compute(byId(caseId));
  const evOpts = m.ev.filter(e => e.at).map(e => ({
    k: e.id,
    label: `${(TYPES[e.type]||{}).th || e.type} · ${fmt(e.at,true)}${e.vendor ? ' · ' + e.vendor : ''}`}));
  const totalBytes = list.reduce((s,r) => s + (r.size||0), 0);

  host.innerHTML = `
    <div class="drop" id="evDrop" tabindex="0" role="button"
         aria-label="เลือกรูปหลักฐาน หรือลากไฟล์มาวาง">
      <b>คลิกที่นี่เพื่อเลือกรูป</b>
      <span class="dropalt">ลากไฟล์มาวางก็ได้ · หรือก๊อปรูปมาแล้วกด Ctrl+V ตรงนี้</span>
      <input type="file" id="evFile" accept="image/*" multiple hidden>
      <span class="hint" style="display:block;margin-top:6px">ย่ออัตโนมัติกว้างสุด ${MAX_W}px ก่อนเก็บ · เก็บบน Supabase</span>
    </div>
    ${list.length ? `<div class="thumbs" id="evThumbs">
      ${list.map(r => `<figure class="evc">
        <a class="evimg" href="${esc(r.url)}" target="_blank" rel="noopener"
           style="background-image:url('${esc(r.url)}')" title="เปิดดูรูปเต็ม"></a>
        <figcaption>
          <select class="evt" data-e="${esc(r.id)}">${EV_TYPES.map(t=>`<option ${t===r.type?'selected':''}>${esc(t)}</option>`).join('')}</select>
          <select class="evl" data-e="${esc(r.id)}"><option value="">— ไม่ผูกกับเหตุการณ์ —</option>
            ${evOpts.map(o=>`<option value="${esc(o.k)}" ${o.k===r.eventKey?'selected':''}>${esc(o.label)}</option>`).join('')}</select>
          <input type="datetime-local" class="evm" data-e="${esc(r.id)}" value="${esc(r.mailAt||'')}" title="วันเวลาที่ปรากฏในเมล">
          ${r.type === EV_MONEY ? `<input type="text" class="eva" data-e="${esc(r.id)}" value="${esc(r.amount||'')}" placeholder="ยอดเงิน (บาท)" inputmode="decimal">` : ''}
          <input type="text" class="evd" data-e="${esc(r.id)}" value="${esc(r.desc||'')}" placeholder="คำอธิบาย">
          <span class="evmeta mono">${r.w||'?'}×${r.h||'?'} · ${kb(r.size||0)} · ${fmt(r.addedAt,true)}
            <button type="button" class="sm gh" data-rm="${esc(r.id)}" style="padding:0 5px;font-size:11px">ลบ</button></span>
        </figcaption></figure>`).join('')}
    </div>` : '<p class="hint" style="margin:12px 0 0">ยังไม่มีหลักฐานในเคสนี้</p>'}
    <div class="evbar"><span class="mono">เคสนี้ ${list.length} รูป ${kb(totalBytes)} · ทั้งระบบ ${Object.keys(S.evidence).length} รูป</span>
      ${list.length ? '<button type="button" class="sm" id="evExp">ส่งออกรายการหลักฐาน</button>' : ''}</div>`;

  const drop = document.getElementById('evDrop');
  drop.setAttribute('tabindex','0');
  const take = async files => {
    if(!files || !files.length) return;
    toast('กำลังย่อและอัปโหลดรูป…');
    const {ok, fail} = await addEvidence(caseId, files);
    renderEvidence(caseId);
    toast(ok ? `เก็บหลักฐาน ${ok} รูปแล้ว${fail?` · ${fail} ไฟล์ใช้ไม่ได้`:''}` : 'บันทึกรูปไม่สำเร็จ — ต้องเป็นไฟล์รูปภาพ');
  };
  drop.ondragover  = e => { e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave = () => drop.classList.remove('on');
  drop.ondrop      = e => { e.preventDefault(); drop.classList.remove('on'); take(e.dataTransfer.files); };
  /* คลิกตรงไหนของกล่องก็เปิดหน้าต่างเลือกไฟล์ได้ ไม่ใช่แค่ตรงตัวหนังสือ */
  const pick = () => document.getElementById('evFile').click();
  drop.onclick   = e => { if(e.target.id !== 'evFile') pick(); };
  drop.onkeydown = e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); pick(); } };
  document.getElementById('evFile').onchange = e => take(e.target.files);
  document.getElementById('dlg').onpaste = e => {
    const items = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/'));
    if(items.length){ e.preventDefault(); take(items.map(i => i.getAsFile()).filter(Boolean)); }
  };

  const upd = async (id, patch) => {
    await API.patchEvidence(id, patch);
    Object.assign(S.evidence[id], patch);
  };
  host.querySelectorAll('.evt').forEach(s => s.onchange = async () => { await upd(s.dataset.e, {type:s.value}); renderEvidence(caseId); });
  host.querySelectorAll('.evl').forEach(s => s.onchange = () => upd(s.dataset.e, {eventKey:s.value}));
  host.querySelectorAll('.evm').forEach(i => i.onchange = () => upd(i.dataset.e, {mailAt:i.value}));
  host.querySelectorAll('.eva').forEach(i => i.onchange = () => upd(i.dataset.e, {amount:i.value.trim()}));
  host.querySelectorAll('.evd').forEach(i => i.onchange = () => upd(i.dataset.e, {desc:i.value.trim()}));
  host.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    if(!confirm('ลบหลักฐานรูปนี้?')) return;
    await API.delEvidence(b.dataset.rm);
    delete S.evidence[b.dataset.rm];
    renderEvidence(caseId); toast('ลบแล้ว');
  });
  const exp = document.getElementById('evExp');
  if(exp) exp.onclick = () => {
    const rows = [['เลขเคลม','ประเภทหลักฐาน','ผูกกับเหตุการณ์','วันเวลาในเมล','ยอดเงิน','คำอธิบาย','ขนาดภาพ','ไฟล์','ลิงก์','เวลาที่แนบ']];
    for(const r of list) rows.push([caseId, r.type, (evOpts.find(o => o.k === r.eventKey)||{}).label || '',
      r.mailAt ? fmt(r.mailAt,true) : '', r.amount || '', r.desc || '', `${r.w}x${r.h}`, kb(r.size||0),
      location.origin + r.url, fmt(r.addedAt,true)]);
    download(`claim-evidence-${caseId}-${stamp()}.csv`, csv(rows));
  };
}
