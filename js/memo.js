/* ============================================================
   memo.js — สรุป / Memo และการส่งออกเป็นไฟล์
   นับต่อเนื่องจากเวลารับเมลของแต่ละเคส ไม่มีเวลาตัดยอด
   ============================================================ */
let M = {from:'', to:'', scope:'all'};

function inRange(m){
  if(!m.t0) return !M.from && !M.to;
  const d = m.t0.slice(0,10);
  if(M.from && d < M.from) return false;
  if(M.to   && d > M.to)   return false;
  return true;
}
function memoSet(){
  const q = F.q.trim().toLowerCase();
  return CACHE.filter(({c,m,bu}) => {
    if(!inRange(m)) return false;
    if(F.carrier !== 'all' && c.carrier !== F.carrier) return false;
    if(F.bu !== 'all' && bu !== F.bu) return false;
    if(!vendorPass(m)) return false;
    if(M.scope === 'open'   && m.status !== 'OPEN')   return false;
    if(M.scope === 'closed' && m.status !== 'CLOSED') return false;
    if(q && ![c.id, c.store, c.store_name, c.truck, c.driver, m.vendor, c.reason].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}
function agg(list){
  const o = {n:list.length, amt:0, open:0, openAmt:0, closed:0, closedAmt:0, onTime:0, overdue:0,
             breach:0, needAct:0, elSum:0, elN:0, legSum:0, intSum:0, els:[], memoed:0, memoedAmt:0};
  for(const {c,m} of list){
    const a = c.amount || 0;
    o.amt += a;
    if(m.status === 'CLOSED'){
      o.closed++; o.closedAmt += a;
      m.sla === 'ON_TIME' ? o.onTime++ : o.overdue++;
      o.elSum += m.el; o.elN++; o.els.push(m.el);
      o.legSum += m.legs.reduce((s,l) => s+l.h, 0); o.intSum += m.internal || 0;
      if(m.memoNo){ o.memoed++; o.memoedAmt += a; }
    } else if(m.status === 'OPEN'){
      o.open++; o.openAmt += a;
      if(m.sla === 'BREACH') o.breach++;
      if(m.needsAction) o.needAct++;
    }
  }
  o.avg = o.elN ? o.elSum/o.elN : null;
  o.els.sort((a,b) => a-b);
  o.med = o.els.length ? o.els[Math.floor(o.els.length/2)] : null;
  o.avgLeg = o.elN ? o.legSum/o.elN : null;
  o.avgInt = o.elN ? o.intSum/o.elN : null;
  o.pct = o.closed ? Math.round(o.onTime/o.closed*100) : null;
  return o;
}
function byVendor(list){
  const g = new Map();
  for(const x of list){ const v = vendorOf(x.m); (g.get(v) || g.set(v,[]).get(v)).push(x); }
  return [...g.entries()].map(([v, items]) => ({v, ...agg(items), items}))
                         .sort((a,b) => b.openAmt - a.openAmt || b.n - a.n);
}
/* แยกตามประเภทการเคลม (c.reason) — เคสคีย์มือมีแค่ 4 ประเภทมาตรฐาน (REASONS) แต่เคสนำเข้าจากไฟล์สรุป
   Period ใช้สาเหตุตามคำจริงในไฟล์ขนส่ง (Reason20) ซึ่งพิมพ์ไม่ซ้ำกันได้หลายแบบ — ถ้ามีมากกว่า cap
   ประเภท จะรวมส่วนที่เหลือเป็น "อื่น ๆ" กันตารางยาวเกินจนดูไม่ออกว่าอะไรเป็นสัดส่วนใหญ่จริง ๆ */
function byReason(list, cap = 8){
  const g = new Map();
  for(const {c} of list){
    const r = String(c.reason || '').trim() || 'ไม่ระบุสาเหตุ';
    const s = g.get(r) || {reason:r, n:0, amt:0};
    s.n++; s.amt += (c.amount || 0);
    g.set(r, s);
  }
  const all = [...g.values()].sort((a,b) => b.n - a.n);
  if(all.length <= cap) return all;
  const top = all.slice(0, cap - 1), rest = all.slice(cap - 1);
  return [...top, {reason:`อื่น ๆ (${rest.length} ประเภท)`,
    n: rest.reduce((s,x) => s+x.n, 0), amt: rest.reduce((s,x) => s+x.amt, 0)}];
}
function rangeLabel(){
  const f = M.from ? M.from.split('-').reverse().join('/') : 'เริ่มต้น';
  const t = M.to   ? M.to.split('-').reverse().join('/')   : 'ปัจจุบัน';
  return `${f} – ${t}`;
}

function renderMemo(){
  const list = memoSet(), T = agg(list), V = byVendor(list), RS = byReason(list);
  document.getElementById('count').textContent = `${list.length} เคสในรายงาน`;
  /* เคสที่ปิดแล้วแต่ยังไม่ได้ออกเลข Memo — "รอเปิด Memo" */
  const pendingMemo = T.closed - T.memoed, pendingMemoAmt = T.closedAmt - T.memoedAmt;
  const memoedPct = T.closed ? Math.round(T.memoed / T.closed * 100) : null;
  const pendingMemoPct = T.closed ? 100 - memoedPct : null;
  const scopeName = {all:'ทุกสถานะ', open:'เฉพาะเคสค้าง', closed:'เฉพาะเคสสำเร็จ'}[M.scope];
  const now = NOW(), H24 = 864e5;
  const openAll = CACHE.filter(x => x.m.status === 'OPEN');
  const dueNext24 = openAll.filter(x => x.m.deadline && x.m.deadline > now && x.m.deadline - now <= H24);
  const justBreached = openAll.filter(x => x.m.deadline && now - x.m.deadline > 0 && now - x.m.deadline <= H24);
  const in24 = CACHE.filter(x => x.m.t0 && now - D(x.m.t0) <= H24 && now - D(x.m.t0) >= 0);
  const closed24 = CACHE.filter(x => x.m.tEnd && now - D(x.m.tEnd) <= H24 && now - D(x.m.tEnd) >= 0);
  const chased24 = CACHE.filter(x => x.m.ev.some(e => e.type === 'FOLLOWUP' && e.at && now - D(e.at) <= H24));
  const chasedV = new Set(chased24.map(x => x.m.vendor).filter(Boolean));

  document.getElementById('memo').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>สถานะ ณ ตอนนี้ — นับต่อเนื่องจากเวลารับเมลของแต่ละเคส</h3>
        <span class="sp mono" style="font-size:12px;color:var(--muted)">${fmt(isoLocal(now), true)}</span></div>
      <div class="pbody" style="padding:0"><div class="totrow" style="margin:0;border:0">
        <div class="tot"><div class="tk">ครบกำหนดใน 24 ชม.</div><div class="tv ${dueNext24.length?'bad':''}">${dueNext24.length}</div>
          <div class="tn">${dueNext24.length?'ต้องได้คำตอบก่อนหมดเวลา':'ไม่มีเคสใกล้ครบกำหนด'}</div></div>
        <div class="tot"><div class="tk">เพิ่งหลุด SLA</div><div class="tv ${justBreached.length?'bad':''}">${justBreached.length}</div>
          <div class="tn">ภายใน 24 ชม. ที่ผ่านมา</div></div>
        <div class="tot"><div class="tk">รับเข้าใหม่</div><div class="tv">${in24.length}</div>
          <div class="tn">24 ชม. ล่าสุด · ${baht0(in24.reduce((s,x)=>s+(x.c.amount||0),0))} บาท</div></div>
        <div class="tot"><div class="tk">ปิดได้</div><div class="tv ok">${closed24.length}</div>
          <div class="tn">24 ชม. ล่าสุด · ทัน ${closed24.filter(x=>x.m.sla==='ON_TIME').length}</div></div>
        <div class="tot"><div class="tk">ทวงงานแล้ว</div><div class="tv">${chasedV.size}</div>
          <div class="tn">ซับ · ${chased24.length} เคส</div></div>
        <div class="tot"><div class="tk">ค้างสะสมตอนนี้</div><div class="tv bad">${openAll.length}</div>
          <div class="tn">${baht0(openAll.reduce((s,x)=>s+(x.c.amount||0),0))} บาท</div></div>
      </div></div>
    </div>

    <div class="panel"><div class="pbody">
      <div class="fx">
        <div class="fld"><label for="mFrom">ตั้งแต่วันที่รับเมล</label><input type="date" id="mFrom" value="${M.from}"></div>
        <div class="fld"><label for="mTo">ถึงวันที่</label><input type="date" id="mTo" value="${M.to}"></div>
        <div class="fld"><label>ขอบเขต</label><div class="seg" id="scopeSeg">
          <button data-s="all" aria-pressed="${M.scope==='all'}">ทั้งหมด</button>
          <button data-s="open" aria-pressed="${M.scope==='open'}">เคสค้าง</button>
          <button data-s="closed" aria-pressed="${M.scope==='closed'}">เคสสำเร็จ</button></div></div>
        <div class="fld"><label>ทางลัด</label><div class="seg" id="quickSeg">
          <button data-q="7">7 วัน</button><button data-q="30">30 วัน</button>
          <button data-q="month">เดือนนี้</button><button data-q="all">ทั้งหมด</button></div></div>
      </div>
      <p class="hint" style="margin:12px 0 0">ตัวกรองซับ ขนส่ง BU และคำค้น ใช้ร่วมกับแถบด้านบน (ปุ่มสถานะด้านบนซ่อนไว้ที่หน้านี้
        เพราะมี "ขอบเขต" ของตัวเองด้านบนแล้ว) — ตอนนี้กรอง
        <b>${F.vendor==='all'?'ทุกซับ':esc(F.vendor)}</b> · <b>${F.carrier==='all'?'ทุกขนส่ง':F.carrier}</b> ·
        <b>${F.bu==='all'?'ทุก BU':esc(F.bu)}</b> · ${scopeName} · ${rangeLabel()}${F.q.trim()?` · ค้นหา "${esc(F.q.trim())}"`:''}</p>
    </div></div>

    <div class="totrow">
      <div class="tot"><div class="tk">เคสทั้งหมด</div><div class="tv">${T.n}</div><div class="tn">${baht0(T.amt)} บาท</div></div>
      <div class="tot"><div class="tk">ปิดเคสแล้ว</div><div class="tv ok">${T.closed}</div><div class="tn">${baht0(T.closedAmt)} บาท</div></div>
      <div class="tot"><div class="tk">รอเปิด Memo</div><div class="tv ${pendingMemo?'warn':''}">${pendingMemo}</div>
        <div class="tn">${baht0(pendingMemoAmt)} บาท${pendingMemoPct!=null?` · ${pendingMemoPct}% ของเคสที่ปิดแล้ว`:''}</div></div>
      <div class="tot"><div class="tk">เปิด Memo แล้ว (Performance)</div><div class="tv okdark">${T.memoed}</div>
        <div class="tn">${baht0(T.memoedAmt)} บาท${memoedPct!=null?` · ${memoedPct}% ของเคสที่ปิดแล้ว`:''}</div></div>
      <div class="tot"><div class="tk">เคสค้าง</div><div class="tv bad">${T.open}</div><div class="tn">${baht0(T.openAmt)} บาท</div></div>
      <div class="tot"><div class="tk">ทันกำหนด</div><div class="tv">${T.pct!=null?T.pct+'%':'—'}</div>
        <div class="tn">ทัน ${T.onTime} · เกิน ${T.overdue}</div></div>
      <div class="tot"><div class="tk">เกิน 48 ชม. อยู่</div><div class="tv bad">${T.breach}</div>
        <div class="tn">${T.needAct?`ปฏิเสธถาวร ${T.needAct}`:'เคสที่ยังปิดไม่ได้'}</div></div>
      <div class="tot"><div class="tk">เวลาที่ใช้ปิดเคส</div><div class="tv">${T.med!=null?T.med.toFixed(1):'—'}</div>
        <div class="tn">ชม. (ค่ากลาง) · เฉลี่ย ${T.avg!=null?T.avg.toFixed(1):'—'}</div></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกรายซับ</h3>
        <span class="sp">
          <button type="button" class="sm" id="xSum">ส่งออกสรุป + รายซับ</button>
          <button type="button" class="sm" id="xDetail">ส่งออกรายเคส (ละเอียด)</button>
          <button type="button" class="sm pri" id="xMemo">สร้าง Memo</button></span></div>
      <div class="tw" style="border:0"><table style="min-width:1060px"><thead><tr>
        <th>ซับ</th><th style="text-align:right">เคสรวม</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">สำเร็จ</th><th style="text-align:right">ยอดสำเร็จ</th>
        <th style="text-align:right">ค้าง</th><th style="text-align:right">ยอดค้าง</th>
        <th style="text-align:right">เกิน 48</th><th style="text-align:right">ทันกำหนด</th>
        <th style="text-align:right">ค่ากลาง (ชม.)</th><th style="text-align:right">เฉลี่ย (ชม.)</th>
        <th style="text-align:right">ซับถือ</th><th style="text-align:right">ค้างฝั่งเรา</th>
      </tr></thead><tbody>
      ${V.length ? V.map(r => `<tr data-v="${esc(r.v)}">
        <td><b>${esc(r.v)}</b></td>
        <td class="r">${r.n}</td><td class="r">${baht0(r.amt)}</td>
        <td class="r" style="color:var(--ok)">${r.closed}</td><td class="r">${baht0(r.closedAmt)}</td>
        <td class="r" style="color:var(--bad)">${r.open}</td><td class="r">${baht0(r.openAmt)}</td>
        <td class="r">${r.breach||'—'}</td><td class="r">${r.pct!=null?r.pct+'%':'—'}</td>
        <td class="r">${r.med!=null?r.med.toFixed(1):'—'}</td><td class="r">${r.avg!=null?r.avg.toFixed(1):'—'}</td>
        <td class="r">${r.avgLeg!=null?r.avgLeg.toFixed(1):'—'}</td><td class="r">${r.avgInt!=null?r.avgInt.toFixed(1):'—'}</td>
      </tr>`).join('') : '<tr><td colspan="13" class="empty">ไม่มีเคสในเงื่อนไขที่เลือก</td></tr>'}
      </tbody>
      ${V.length ? `<tfoot><tr style="background:var(--sunk);font-weight:600">
        <td>รวมทุกซับ</td><td class="r">${T.n}</td><td class="r">${baht0(T.amt)}</td>
        <td class="r">${T.closed}</td><td class="r">${baht0(T.closedAmt)}</td>
        <td class="r">${T.open}</td><td class="r">${baht0(T.openAmt)}</td>
        <td class="r">${T.breach}</td><td class="r">${T.pct!=null?T.pct+'%':'—'}</td>
        <td class="r">${T.med!=null?T.med.toFixed(1):'—'}</td><td class="r">${T.avg!=null?T.avg.toFixed(1):'—'}</td>
        <td class="r">${T.avgLeg!=null?T.avgLeg.toFixed(1):'—'}</td><td class="r">${T.avgInt!=null?T.avgInt.toFixed(1):'—'}</td>
      </tr></tfoot>` : ''}
      </table></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกตามประเภทการเคลม</h3>
        <span class="sp hint" style="margin:0">${T.n} เคส · ${baht0(T.amt)} บาท</span></div>
      <div class="tw" style="border:0"><table style="min-width:640px"><thead><tr>
        <th>ประเภทการเคลม</th><th style="text-align:right">จำนวนเคส</th><th style="text-align:right">% ของเคส</th>
        <th style="text-align:right">ยอดเงิน</th><th style="text-align:right">% ของยอด</th>
      </tr></thead><tbody>
      ${RS.length ? RS.map(r => {
          const pctN = T.n ? Math.round(r.n / T.n * 100) : 0;
          const pctAmt = T.amt ? Math.round(r.amt / T.amt * 100) : 0;
          return `<tr style="cursor:default">
        <td>${esc(r.reason)}<span class="vbar"><i style="width:${pctN}%;background:var(--accent)"></i></span></td>
        <td class="r">${r.n}</td><td class="r">${pctN}%</td>
        <td class="r">${baht0(r.amt)}</td><td class="r">${pctAmt}%</td>
      </tr>`;
        }).join('') : '<tr><td colspan="5" class="empty">ไม่มีเคสในเงื่อนไขที่เลือก</td></tr>'}
      </tbody></table></div>
    </div>`;

  document.getElementById('mFrom').onchange = e => { M.from = e.target.value; render(); };
  document.getElementById('mTo').onchange   = e => { M.to   = e.target.value; render(); };
  document.querySelectorAll('#scopeSeg button').forEach(b => b.onclick = () => { M.scope = b.dataset.s; render(); });
  document.querySelectorAll('#quickSeg button').forEach(b => b.onclick = () => {
    const q = b.dataset.q, d = NOW();
    if(q === 'all') M.from = M.to = '';
    else if(q === 'month'){ M.from = `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`; M.to = isoLocal(d).slice(0,10); }
    else { M.from = isoLocal(new Date(d.getTime() - (+q)*864e5)).slice(0,10); M.to = isoLocal(d).slice(0,10); }
    render();
  });
  document.querySelectorAll('#memo tr[data-v]').forEach(tr => tr.onclick = () => {
    F.vendor = tr.dataset.v; render();
  });
  document.getElementById('xSum').onclick    = () => exportSummary(list, T, V);
  document.getElementById('xDetail').onclick = () => exportDetail(list);
  document.getElementById('xMemo').onclick   = () => openMemoText(T, V);
}

function exportSummary(list, T, V){
  const RS = byReason(list, Infinity);   /* ไม่ตัด "อื่น ๆ" ในไฟล์ส่งออก — เอาให้ครบทุกประเภทจริง ๆ */
  const rows = [
    ['สรุปงานเคลม DHL / CJ'], ['ช่วงวันที่รับเมล', rangeLabel()],
    ['ขอบเขต', {all:'ทุกสถานะ',open:'เฉพาะเคสค้าง',closed:'เฉพาะเคสสำเร็จ'}[M.scope]],
    ['ตัวกรอง', `ซับ: ${F.vendor==='all'?'ทุกซับ':F.vendor} | ขนส่ง: ${F.carrier==='all'?'ทุกขนส่ง':F.carrier} | BU: ${F.bu==='all'?'ทุก BU':F.bu}`],
    ['วันที่ออกรายงาน', fmt(isoLocal(NOW()), true)], [],
    ['ภาพรวม'], ['รายการ','จำนวนเคส','ยอดเงิน (บาท)'],
    ['เคสทั้งหมด', T.n, T.amt.toFixed(2)],
    ['เคสสำเร็จ (ซับรับเคลม)', T.closed, T.closedAmt.toFixed(2)],
    ['เคสค้าง', T.open, T.openAmt.toFixed(2)],
    ['ในนั้นเกิน 48 ชม.', T.breach, ''], ['ในนั้นซับปฏิเสธถาวร', T.needAct, ''],
    ['ปิดทันกำหนด', T.onTime, ''], ['ปิดเกินกำหนด', T.overdue, ''],
    ['อัตราทันกำหนด (%)', T.pct ?? '', ''],
    ['เวลาที่ใช้ปิดเคส — ค่ากลาง (ชม.)', T.med!=null?T.med.toFixed(2):'', ''],
    ['เวลาที่ใช้ปิดเคส — เฉลี่ย (ชม.)', T.avg!=null?T.avg.toFixed(2):'', ''],
    ['— ในนั้นเป็นเวลาที่ซับถือเคส', T.avgLeg!=null?T.avgLeg.toFixed(2):'', ''],
    ['— ในนั้นเป็นเวลาค้างฝั่งเรา', T.avgInt!=null?T.avgInt.toFixed(2):'', ''], [],
    ['แยกรายซับ'],
    ['ซับ','เคสรวม','ยอดรวม','เคสสำเร็จ','ยอดสำเร็จ','เคสค้าง','ยอดค้าง','เกิน 48 ชม.',
     'ทันกำหนด (%)','ค่ากลาง (ชม.)','เวลาเฉลี่ย (ชม.)','ซับถือเคส (ชม.)','ค้างฝั่งเรา (ชม.)'],
  ];
  const line = r => [r.v ?? 'รวมทุกซับ', r.n, r.amt.toFixed(2), r.closed, r.closedAmt.toFixed(2),
    r.open, r.openAmt.toFixed(2), r.breach, r.pct ?? '',
    r.med!=null?r.med.toFixed(2):'', r.avg!=null?r.avg.toFixed(2):'',
    r.avgLeg!=null?r.avgLeg.toFixed(2):'', r.avgInt!=null?r.avgInt.toFixed(2):''];
  for(const r of V) rows.push(line(r));
  rows.push(line(T));
  rows.push([], ['แยกตามประเภทการเคลม'], ['ประเภทการเคลม','จำนวนเคส','% ของเคส','ยอดเงิน (บาท)','% ของยอด']);
  for(const r of RS) rows.push([r.reason, r.n, T.n ? Math.round(r.n/T.n*100) : 0,
    r.amt.toFixed(2), T.amt ? Math.round(r.amt/T.amt*100) : 0]);
  download(`claim-summary-${stamp()}.csv`, csv(rows));
}

function exportDetail(list){
  const rows = [['ซับ','BU','เลขเคลม','ขนส่ง','สาขา','ชื่อสาขา','ทะเบียน','พขร.','สาเหตุ','ยอด (บาท)',
    'รับเมล','ครบกำหนด','ปิดเมื่อ','ใช้เวลา (ชม.)','ซับถือเคส (ชม.)','ค้างฝั่งเรา (ชม.)',
    'สถานะ','ผล SLA','จำนวนรอบที่ส่ง','ซับที่เคยส่งถึง','จำนวนหลักฐาน','ธงตรวจสอบ']];
  const sorted = list.slice().sort((a,b) =>
    String(a.m.vendor).localeCompare(String(b.m.vendor)) || (b.m.el||0) - (a.m.el||0));
  for(const {c,m,bu} of sorted) rows.push([m.vendor, bu, c.id, c.carrier, c.store, c.store_name, c.truck, c.driver,
    c.reason, (c.amount||0).toFixed(2), m.t0?fmt(m.t0,true):'',
    m.deadline?fmt(isoLocal(m.deadline),true):'', m.tEnd?fmt(m.tEnd,true):'',
    m.el!=null?m.el.toFixed(2):'', m.legs.reduce((s,l)=>s+l.h,0).toFixed(2),
    m.internal!=null?m.internal.toFixed(2):'',
    m.status==='CLOSED'?'สำเร็จ':m.status==='OPEN'?(m.needsAction?'ค้าง (ปฏิเสธถาวร)':'ค้าง'):'ไม่มีข้อมูลเวลา',
    m.sla||'', m.legs.length, m.legs.map(l=>l.vendor).filter(Boolean).join(' → '),
    caseEvidence(c.id).length, m.flags.map(f=>f.k).join(' ')]);
  download(`claim-detail-${stamp()}.csv`, csv(rows));
}

function openMemoText(T, V){
  const d = NOW();
  const dt = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543}`;
  const top = V.slice().sort((a,b) => b.openAmt - a.openAmt).slice(0,5);
  document.getElementById('mTitle').textContent = 'Memo สรุปงานเคลม';
  document.getElementById('mVendor').closest('.frow').style.display = 'none';
  document.getElementById('mMark').style.display = 'none';
  document.getElementById('mSubj').value =
    `สรุปงานเคลม DHL/CJ ช่วง ${rangeLabel()} — ค้าง ${T.open} เคส ${baht0(T.openAmt)} บาท`;
  document.getElementById('mBody').value =
`บันทึกข้อความ — สรุปสถานะงานเคลมขนส่ง${S.settings.orgName ? '\n' + S.settings.orgName : ''}
วันที่ ${dt}
ช่วงข้อมูล: ${rangeLabel()} (นับตามวันที่รับเมลเคลม)
ขอบเขต: ${{all:'ทุกสถานะ',open:'เฉพาะเคสค้าง',closed:'เฉพาะเคสสำเร็จ'}[M.scope]}${F.vendor!=='all'?` · เฉพาะซับ ${F.vendor}`:''}${F.carrier!=='all'?` · เฉพาะ ${F.carrier}`:''}${F.bu!=='all'?` · เฉพาะ BU ${F.bu}`:''}

1. ภาพรวม
   เคสทั้งหมด ${T.n} เคส มูลค่ารวม ${baht(T.amt)} บาท
   - ปิดได้แล้ว ${T.closed} เคส มูลค่า ${baht(T.closedAmt)} บาท
   - ยังค้าง ${T.open} เคส มูลค่า ${baht(T.openAmt)} บาท
   อัตราปิดได้ทันกรอบ 48 ชั่วโมง ${T.pct!=null?T.pct+'%':'—'} (ทัน ${T.onTime} เคส เกินกำหนด ${T.overdue} เคส)
   เคสที่เกิน 48 ชั่วโมงและยังปิดไม่ได้ ${T.breach} เคส${T.needAct?` ในจำนวนนี้ซับปฏิเสธถาวรแล้ว ${T.needAct} เคส`:''}

2. เวลาที่ใช้ในเคสที่ปิดได้
   ค่ากลาง ${T.med!=null?T.med.toFixed(1):'—'} ชั่วโมงต่อเคส (ค่าเฉลี่ย ${T.avg!=null?T.avg.toFixed(1):'—'} ชั่วโมง ซึ่งสูงกว่าเพราะมีเคสค้างนานผิดปกติไม่กี่เคสดึงขึ้น)
   - เป็นเวลาที่อยู่ระหว่างรอซับตอบ ${T.avgLeg!=null?T.avgLeg.toFixed(1):'—'} ชั่วโมง
   - เป็นเวลาที่ค้างอยู่ฝั่งเรา ${T.avgInt!=null?T.avgInt.toFixed(1):'—'} ชั่วโมง

3. แยกรายซับ
${V.map(r => `   ${r.v}
      รวม ${r.n} เคส ${baht(r.amt)} บาท | สำเร็จ ${r.closed} เคส ${baht(r.closedAmt)} บาท | ค้าง ${r.open} เคส ${baht(r.openAmt)} บาท${r.breach?` | เกิน 48 ชม. ${r.breach} เคส`:''}${r.pct!=null?` | ทันกำหนด ${r.pct}%`:''}`).join('\n')}

4. ประเด็นที่ต้องติดตาม
${top.filter(r => r.open > 0).map((r,i) => `   ${i+1}. ${r.v} ค้าง ${r.open} เคส คิดเป็น ${baht(r.openAmt)} บาท${r.breach?` (เกินกรอบเวลาแล้ว ${r.breach} เคส)`:''}`).join('\n') || '   ไม่มีเคสค้างในช่วงนี้'}

จึงเรียนมาเพื่อโปรดทราบ`;
  document.getElementById('mNote').textContent = `${T.n} เคส · ${baht0(T.amt)} บาท`;
  /* Memo ส่งถึงหัวหน้า ไม่ใช่ซับ จึงล้างช่องผู้รับให้พิมพ์เอง */
  const to = document.getElementById('mEmail'), hint = document.getElementById('mEmailHint');
  if(to){
    to.value = S.settings.memoTo || '';
    hint.innerHTML = to.value ? '' :
      '<span style="color:var(--muted)">Memo ส่งถึงหัวหน้า พิมพ์อีเมลเองได้เลย</span>';
  }
  document.getElementById('mdlg').showModal();
}
