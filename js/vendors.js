/* ============================================================
   vendors.js — ทะเบียนซับ (Master Vendor) และกฎห้ามชื่อซ้ำ
   ============================================================ */
/* ตัดคำที่ไม่ใช่ชื่อจริงของบริษัทออก เหลือแต่แก่นชื่อ จะได้เทียบกันได้
   ครอบคลุมทั้งคำอังกฤษและคำทับศัพท์ไทย เพราะไฟล์จากซับเขียนได้หลายแบบ */
const VNOISE_EN = /\b(transport|transports|trans|logistic|logistics|express|group|service|services|co|ltd|limited|company|inc|part)\b/g;
const VNOISE_TH = /(บริษัท|บจก|บจ|หจก|หสน|จำกัด|มหาชน|ขนส่ง|ซัพ|ซับ|ทรานสปอร์ต|ทรานส์ปอร์ต|ทรานสปอร์ท|ทรานส์|โลจิสติกส์|โลจิสติกส|ลอจิสติกส์|ลอจิสติกส|โลจิสติก|ลอจิสติก|เอ็กซ์เพรส|เอกซ์เพรส|กรุ๊ป|กรุป|เซอร์วิส|การขนส่ง|กลุ่ม)/g;

function vkey(s){
  let x = String(s||'').normalize('NFC').toLowerCase().trim();
  x = x.replace(/[.\-_/()]/g, ' ');
  x = x.replace(VNOISE_EN, ' ');
  x = x.replace(VNOISE_TH, ' ');
  return x.replace(/\s+/g, '');
}
/* แก่นชื่อแบบตัดเลขท้ายออกด้วย เช่น "สุดใจ55" -> "สุดใจ" ใช้ตอนเทียบแบบหลวม */
const vstem = s => vkey(s).replace(/[0-9]+$/, '');

const vendorList  = a => Object.values(S.vendors).filter(v => !a || v.active).sort((x,y)=>x.code.localeCompare(y.code,'th'));
const vendorNames = a => vendorList(a).map(v => v.code);

/* ทุกชื่อที่ใช้เรียกซับรายหนึ่ง (รหัส + ชื่อแสดง + ชื่อพ้อง) */
const vendorAllNames = v => [v.code, v.display, ...(v.aliases||[])].filter(Boolean);

/* ตรงเป๊ะหรือไม่ — ใช้ตอนกันสร้างซ้ำ */
function vendorClash(name, exceptCode){
  const k = vkey(name);
  if(!k) return null;
  for(const v of Object.values(S.vendors)){
    if(v.code === exceptCode) continue;
    if(vkey(v.code) === k) return {v, why:`ตรงกับรหัสซับ ${v.code}`};
    for(const a of (v.aliases||[])) if(vkey(a) === k) return {v, why:`ตรงกับชื่อพ้อง “${a}” ของ ${v.code}`};
    if(v.display && vkey(v.display) === k) return {v, why:`ตรงกับชื่อที่ใช้แสดงของ ${v.code}`};
  }
  return null;
}

/* เทียบแบบหลวม — ใช้ตอนนำเข้าไฟล์จากซับ ซึ่งเขียนชื่อยาวกว่าที่เราเก็บไว้มาก
   คืนค่า {v, why, score} โดย score 100 = เป๊ะ  ยิ่งน้อยยิ่งมั่นใจน้อย */
function vendorMatch(name){
  const k = vkey(name), st = vstem(name);
  if(!k) return null;
  const exact = vendorClash(name);
  if(exact) return {v:exact.v, why:exact.why, score:100};

  let best = null;
  for(const v of Object.values(S.vendors)){
    for(const raw of vendorAllNames(v)){
      const kk = vkey(raw), ss = vstem(raw);
      if(kk.length < 2) continue;
      let sc = 0, why = '';
      if(st && ss && st === ss){ sc = 95; why = `ชื่อหลักตรงกับ “${raw}”`; }
      else if(k.startsWith(kk) || kk.startsWith(k)){
        sc = 88 - Math.abs(k.length - kk.length);
        why = `ขึ้นต้นเหมือน “${raw}”`;
      } else if(kk.length >= 4 && k.includes(kk)){
        sc = 80; why = `มีคำว่า “${raw}” อยู่ในชื่อ`;
      } else if(k.length >= 4 && kk.includes(k)){
        sc = 78; why = `เป็นส่วนหนึ่งของ “${raw}”`;
      } else if(shareToken(name, raw)){
        sc = 74; why = `มีคำเหมือนกับ “${raw}”`;
      } else {
        const d = vdist(k, kk);
        if(d > 0 && d <= (Math.min(k.length, kk.length) >= 6 ? 2 : 1)){
          sc = 70 - d * 5; why = `สะกดต่างจาก “${raw}” ${d} ตัว`;
        }
      }
      if(sc && (!best || sc > best.score)) best = {v, why, score:sc};
    }
  }
  return best && best.score >= 65 ? best : null;
}

/* มีคำไทยยาว ๆ เหมือนกันไหม เช่น "ซีเอส อ่างทอง" กับ "CS อ่างทอง" ตรงกันที่คำว่า อ่างทอง */
function shareToken(a, b){
  const cut = x => String(x||'').normalize('NFC').toLowerCase()
    .replace(VNOISE_EN, ' ').replace(VNOISE_TH, ' ')
    .split(/[\s.\-_/()]+/).filter(t => t.length >= 3);
  const A = new Set(cut(a));
  return cut(b).some(t => A.has(t));
}

/* ระยะห่างของคำ ใช้ซ้ำจาก drivers.js ถ้ามี ไม่มีก็คำนวณเอง */
function vdist(a, b){
  if(typeof dist === 'function') return dist(a, b);
  if(a === b) return 0;
  if(Math.abs(a.length - b.length) > 3) return 9;
  const prev = Array.from({length:b.length+1}, (_, i) => i);
  for(let i = 1; i <= a.length; i++){
    let up = prev[0]; prev[0] = i;
    for(let j = 1; j <= b.length; j++){
      const tmp = prev[j];
      prev[j] = Math.min(prev[j]+1, prev[j-1]+1, up + (a[i-1] === b[j-1] ? 0 : 1));
      up = tmp;
    }
  }
  return prev[b.length];
}

function vendorNear(name, exceptCode){
  const k = vkey(name);
  if(k.length < 3) return null;
  for(const v of Object.values(S.vendors)){
    if(v.code === exceptCode) continue;
    const kk = vkey(v.code);
    if(kk.length >= 3 && (k.startsWith(kk) || kk.startsWith(k))) return v;
  }
  return null;
}
const vendorResolve = name => { const c = name && vendorClash(name); return c ? c.v.code : (name || null); };

let vendorEdit = null;

function renderVendorsView(){
  const list = vendorList();
  const used = {}, openBy = {};
  for(const {m} of CACHE) if(m.vendor){
    used[m.vendor] = (used[m.vendor]||0) + 1;
    if(m.status === 'OPEN') openBy[m.vendor] = (openBy[m.vendor]||0) + 1;
  }
  const truckCount = {};
  for(const t of Object.values(S.trucks)) if(t.primary) truckCount[t.primary] = (truckCount[t.primary]||0) + 1;
  const ed = vendorEdit ? S.vendors[vendorEdit] : null;

  document.getElementById('vendors').innerHTML = `
    <div class="totrow">
      <div class="tot"><div class="tk">ซับทั้งหมด</div><div class="tv">${list.length}</div>
        <div class="tn">ใช้งาน ${list.filter(v=>v.active).length} · พักใช้ ${list.filter(v=>!v.active).length}</div></div>
      <div class="tot"><div class="tk">ชื่อพ้องที่จับไว้</div><div class="tv">${list.reduce((s,v)=>s+(v.aliases||[]).length,0)}</div>
        <div class="tn">กันการสร้างซ้ำจากการสะกดต่าง</div></div>
      <div class="tot"><div class="tk">มีอีเมลแล้ว</div><div class="tv">${list.filter(v=>v.email).length}</div>
        <div class="tn">ใช้เติมให้อัตโนมัติตอนร่างเมล</div></div>
      <div class="tot"><div class="tk">มีเคสค้าง</div><div class="tv bad">${Object.keys(openBy).length}</div>
        <div class="tn">จาก ${Object.keys(used).length} รายที่มีเคส</div></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>${ed ? 'แก้ไขซับ: ' + esc(ed.code) : 'เพิ่มซับใหม่'}</h3>
        ${ed ? '<span class="sp"><button type="button" class="sm" id="vCancel">ยกเลิกการแก้ไข</button></span>' : ''}</div>
      <div class="pbody"><form id="vForm" novalidate>
        <div class="frow">
          <div class="fld"><label for="vCode">รหัสซับ (ห้ามซ้ำ)</label>
            <input type="text" id="vCode" required autocomplete="off" placeholder="เช่น Doitung" value="${ed?esc(ed.code):''}">
            <span class="err" id="vErr"></span></div>
          <div class="fld"><label for="vDisp">ชื่อที่ใช้แสดง</label>
            <input type="text" id="vDisp" placeholder="เช่น บจ. ดอยตุง" value="${ed?esc(ed.display||''):''}"></div>
          <div class="fld"><label for="vMail">อีเมลสำหรับส่งเคลม</label>
            <input type="text" id="vMail" placeholder="claim@example.com" value="${ed?esc(ed.email||''):''}"></div>
        </div>
        <div class="frow">
          <div class="fld" style="flex:2"><label for="vAlias">ชื่อพ้อง / การสะกดแบบอื่น (คั่นด้วยจุลภาค)</label>
            <input type="text" id="vAlias" placeholder="Doitong, ดอยตุง, บจ.ดอยตุง" value="${ed?esc((ed.aliases||[]).join(', ')):''}"></div>
          <div class="fld"><label for="vContact">ผู้ติดต่อ / เบอร์</label>
            <input type="text" id="vContact" value="${ed?esc(ed.contact||''):''}"></div>
          <div class="fld" style="max-width:150px"><label for="vActive">สถานะ</label>
            <select id="vActive"><option value="1">ใช้งาน</option>
              <option value="0" ${ed && !ed.active ? 'selected':''}>พักใช้งาน</option></select></div>
        </div>
        <div class="actions"><button type="submit" class="pri">${ed?'บันทึกการแก้ไข':'เพิ่มซับ'}</button>
          <span class="hint" style="margin:0">ระบบเทียบทั้งรหัสและชื่อพ้องของทุกรายก่อนบันทึก</span></div>
      </form></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>รายชื่อซับ</h3>
        <span class="sp"><button type="button" class="sm" id="vMerge">รวมซับที่ซ้ำกัน</button>
        <button type="button" class="sm" id="vExport">ส่งออกทะเบียนซับ</button></span></div>
      <div class="tw" style="border:0"><table style="min-width:900px"><thead><tr>
        <th>รหัสซับ</th><th>ชื่อแสดง</th><th>ชื่อพ้อง</th><th>อีเมล</th>
        <th style="text-align:right">ทะเบียนรถ</th><th style="text-align:right">เคส</th>
        <th style="text-align:right">ค้าง</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${list.map(v => `<tr>
        <td class="id"><b>${esc(v.code)}</b></td>
        <td>${esc(v.display||'—')}</td>
        <td>${(v.aliases||[]).length ? v.aliases.map(a=>`<span class="chip n">${esc(a)}</span>`).join(' ') : '<span style="color:var(--faint)">—</span>'}</td>
        <td class="mono" style="font-size:12px">${esc(v.email||'—')}</td>
        <td class="r">${truckCount[v.code]||'—'}</td>
        <td class="r">${used[v.code]||0}</td>
        <td class="r" style="${openBy[v.code]?'color:var(--bad)':''}">${openBy[v.code]||'—'}</td>
        <td>${v.active?'<span class="chip ok">ใช้งาน</span>':'<span class="chip n">พักใช้</span>'}</td>
        <td><button type="button" class="sm gh" data-ve="${esc(v.code)}">แก้ไข</button></td>
      </tr>`).join('')}
      </tbody></table></div>
    </div>`;

  document.getElementById('vForm').onsubmit = async ev => {
    ev.preventDefault();
    const codeEl = document.getElementById('vCode'), errEl = document.getElementById('vErr');
    const code = codeEl.value.trim();
    errEl.style.display = 'none'; codeEl.classList.remove('bad');
    if(!code){ errEl.textContent = 'ต้องกรอกรหัสซับ'; errEl.style.display='block'; codeEl.classList.add('bad'); return; }
    const clash = vendorClash(code, vendorEdit);
    if(clash){
      errEl.innerHTML = `ซ้ำ — ${esc(clash.why)} · ใช้ <b>${esc(clash.v.code)}</b> ที่มีอยู่แทน หรือเพิ่มชื่อนี้เป็นชื่อพ้องของรายนั้น`;
      errEl.style.display = 'block'; codeEl.classList.add('bad'); return;
    }
    const aliases = document.getElementById('vAlias').value.split(',').map(x=>x.trim()).filter(Boolean);
    for(const a of aliases){
      const c2 = vendorClash(a, vendorEdit);
      if(c2){ errEl.innerHTML = `ชื่อพ้อง “${esc(a)}” ${esc(c2.why)} — เอาออกก่อน`; errEl.style.display='block'; return; }
    }
    const rec = {code, display:document.getElementById('vDisp').value.trim(), aliases,
      email:document.getElementById('vMail').value.trim(), contact:document.getElementById('vContact').value.trim(),
      carriers: ed ? ed.carriers : ['DHL','CJ'], active: document.getElementById('vActive').value === '1',
      note: ed ? ed.note : '', renameFrom: vendorEdit || undefined};
    await API.putVendor(code, rec);
    if(vendorEdit && vendorEdit !== code) delete S.vendors[vendorEdit];
    S.vendors[code] = rec;
    vendorEdit = null; render(); toast('บันทึกซับแล้ว');
    const near = vendorNear(code);
    if(near) toast(`บันทึกแล้ว — แต่ชื่อใกล้เคียงกับ ${near.code} ตรวจอีกครั้งว่าไม่ใช่รายเดียวกัน`);
  };
  document.querySelectorAll('#vendors [data-ve]').forEach(b => b.onclick = () => { vendorEdit = b.dataset.ve; render(); });
  const cx = document.getElementById('vCancel');
  if(cx) cx.onclick = () => { vendorEdit = null; render(); };
  document.getElementById('vExport').onclick = () => {
    const rows = [['รหัสซับ','ชื่อแสดง','ชื่อพ้อง','อีเมล','ผู้ติดต่อ','ทะเบียนรถ','เคสทั้งหมด','เคสค้าง','สถานะ']];
    for(const v of list) rows.push([v.code, v.display, (v.aliases||[]).join(' | '), v.email, v.contact,
      truckCount[v.code]||0, used[v.code]||0, openBy[v.code]||0, v.active?'ใช้งาน':'พักใช้งาน']);
    download(`claim-vendors-${stamp()}.csv`, csv(rows));
  };
  document.getElementById('vMerge').onclick = async () => {
    const codes = vendorNames();
    const from = prompt('รวมซับรายไหน (รหัสที่จะถูกยุบ)\n\nรายชื่อ: ' + codes.join(', '));
    if(!from || !S.vendors[from]) return;
    const to = prompt(`ย้าย “${from}” ไปรวมกับรายไหน`);
    if(!to || !S.vendors[to] || to === from) return;
    const j = await API.mergeVendor(from, to);
    await pullState(); render();
    toast(`รวม ${from} เข้ากับ ${to} แล้ว — ย้าย ${j.moved} บันทึก`);
  };
}
