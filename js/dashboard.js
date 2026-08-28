/* ============================================================
   dashboard.js — ภาพรวมทั้งปี แยกรายเดือน (หรือราย Period 15–15) และแยก BU (คลัง)
   นับตามวันที่รับเมล (m.t0) ของแต่ละเคส เหมือนหน้าอื่นในระบบ

   สามสถานะ (ตรงกับที่ใช้ในหน้าสรุป/Memo และชิปสถานะที่กระดานเคส):
     Pending (ค้าง)         — ยังไม่ปิดเคส (m.status === 'OPEN')
     ปิดแล้ว รอออก Memo      — ปิดเคสจริงแล้ว (ยอมรับเคลม) แต่ยังไม่ออกเลข Memo — ถือว่ายังค้างงานฝั่งบัญชี
     เปิด Memo แล้ว          — ปิดเคสและออกเลข Memo แล้ว จบกระบวนการ นับเข้า Performance
   ============================================================ */
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
let DASH = {year: NOW().getFullYear(), mode:'month'};

/* ---------- ช่องเวลา 12 ช่องของปี — โหมดเดือนปฏิทิน หรือโหมด Period 15–15 ---------- */
function monthBuckets(year){
  return Array.from({length:12}, (_, i) => ({
    label: MONTH_TH[i], title: `${MONTH_TH[i]} ${year+543}`,
    start: new Date(year, i, 1), end: new Date(year, i+1, 1)}));
}
function periodBuckets(year){
  return Array.from({length:12}, (_, i) => {
    const start = new Date(year, i, 15), end = new Date(year, i+1, 15);
    return {label:`${pad(start.getDate())}/${pad(start.getMonth()+1)}`,
            title: periodLabel({start, end}), start, end};
  });
}
function fillBuckets(buckets){
  for(const b of buckets) Object.assign(b, {n:0, amt:0, pending:0, pendingAmt:0,
    waitingMemo:0, waitingMemoAmt:0, memoed:0, memoedAmt:0});
  for(const {c, m} of CACHE){
    if(!m.t0) continue;
    const d = D(m.t0);
    const b = buckets.find(x => d >= x.start && d < x.end);
    if(!b) continue;
    const a = c.amount || 0;
    b.n++; b.amt += a;
    if(m.status === 'OPEN'){ b.pending++; b.pendingAmt += a; }
    else if(m.status === 'CLOSED'){
      if(m.memoNo){ b.memoed++; b.memoedAmt += a; }
      else { b.waitingMemo++; b.waitingMemoAmt += a; }
    }
  }
  return buckets;
}
function yearByBU(year){
  const g = new Map();
  for(const {c, m, bu} of CACHE){
    if(!m.t0 || D(m.t0).getFullYear() !== year) continue;
    const key = bu || '—';
    const s = g.get(key) || {bu:key, n:0, amt:0, pending:0, pendingAmt:0,
      waitingMemo:0, waitingMemoAmt:0, memoed:0, memoedAmt:0};
    const a = c.amount || 0;
    s.n++; s.amt += a;
    if(m.status === 'OPEN'){ s.pending++; s.pendingAmt += a; }
    else if(m.status === 'CLOSED'){
      if(m.memoNo){ s.memoed++; s.memoedAmt += a; }
      else { s.waitingMemo++; s.waitingMemoAmt += a; }
    }
    g.set(key, s);
  }
  return [...g.values()].sort((a, b) => b.n - a.n);
}

/* แปลงตัวเลขสามสถานะของช่องเวลาหนึ่งช่อง ให้เป็นแท่งซ้อน — เปิด Memo แล้ว (ฐาน) →
   รอออก Memo (กลาง) → Pending (บนสุด) มีช่องว่าง 2px คั่นเฉพาะรอยต่อที่มีข้อมูลจริงทั้งสองฝั่ง
   ส่วนบนสุดที่ไม่ใช่ศูนย์เท่านั้นที่ได้มุมโค้ง */
function stackSegments(b, maxN, CH){
  const parts = [
    {key:'memoed',  n:b.memoed,      cls:'memoed'},
    {key:'waiting', n:b.waitingMemo, cls:'waiting'},
    {key:'pending', n:b.pending,     cls:'pending'},
  ].filter(p => p.n > 0);
  let cursor = 0;
  const segs = parts.map((p, i) => {
    const px = Math.round(p.n / maxN * CH);
    const seg = {...p, px, bottom:cursor};
    cursor += px + (i < parts.length - 1 ? 2 : 0);
    return seg;
  });
  if(segs.length) segs[segs.length - 1].top = true;
  return segs;
}

function renderDashboard(){
  const periodMode = DASH.mode === 'period';
  const buckets = fillBuckets(periodMode ? periodBuckets(DASH.year) : monthBuckets(DASH.year));
  const bus = yearByBU(DASH.year);
  const total = buckets.reduce((s, b) => s + b.n, 0);
  const totalAmt = buckets.reduce((s, b) => s + b.amt, 0);
  const pending = buckets.reduce((s, b) => s + b.pending, 0);
  const pendingAmt = buckets.reduce((s, b) => s + b.pendingAmt, 0);
  const waitingMemo = buckets.reduce((s, b) => s + b.waitingMemo, 0);
  const waitingMemoAmt = buckets.reduce((s, b) => s + b.waitingMemoAmt, 0);
  const memoed = buckets.reduce((s, b) => s + b.memoed, 0);
  const memoedAmt = buckets.reduce((s, b) => s + b.memoedAmt, 0);
  const pendingPct = total ? Math.round(pending / total * 100) : null;
  const CH = 200;   // ความสูงกราฟ (px)
  const maxN = Math.max(1, ...buckets.map(b => b.n));
  const colLabel = periodMode ? 'Period' : 'เดือน';

  document.getElementById('dashboard').innerHTML = `
    <div class="panel">
      <div class="phead"><h3>ภาพรวมรายปี</h3>
        <span class="sp">
          <button type="button" class="sm" id="dashPrev">‹ ปีก่อนหน้า</button>
          <span class="mono" style="font-size:12.5px">${DASH.year + 543}</span>
          <button type="button" class="sm" id="dashNext">ปีถัดไป ›</button>
          <button type="button" class="sm" id="dashNow">ปีนี้</button></span></div>
      <div class="pbody" style="padding:0"><div class="totrow" style="margin:0;border:0">
        <div class="tot"><div class="tk">เคสทั้งปี</div><div class="tv">${total}</div><div class="tn">${baht0(totalAmt)} บาท</div></div>
        <div class="tot"><div class="tk">Pending (ค้าง)</div><div class="tv bad">${pending}</div><div class="tn">${baht0(pendingAmt)} บาท</div></div>
        <div class="tot"><div class="tk">ปิดแล้ว รอออก Memo</div><div class="tv warn">${waitingMemo}</div><div class="tn">${baht0(waitingMemoAmt)} บาท</div></div>
        <div class="tot"><div class="tk">เปิด Memo แล้ว (Performance)</div><div class="tv okdark">${memoed}</div><div class="tn">${baht0(memoedAmt)} บาท</div></div>
        <div class="tot"><div class="tk">สัดส่วน Pending</div>
          <div class="tv ${pendingPct != null && pendingPct > 30 ? 'bad' : ''}">${pendingPct != null ? pendingPct+'%' : '—'}</div>
          <div class="tn">ของเคสทั้งปี</div></div>
      </div></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกราย${periodMode ? ' Period (15–15)' : 'เดือน'}</h3>
        <span class="sp">
          <div class="seg" id="dashModeSeg">
            <button data-mode="month" aria-pressed="${!periodMode}">เดือนปฏิทิน</button>
            <button data-mode="period" aria-pressed="${periodMode}">Period (15–15)</button>
          </div>
          <button type="button" class="sm" id="dashExportMonth">ส่งออก CSV</button></span></div>
      <div class="pbody">
        <div class="ylegend">
          <span class="lg"><i class="sw" style="background:var(--bad)"></i>Pending (ค้าง)</span>
          <span class="lg"><i class="sw" style="background:var(--warn)"></i>ปิดแล้ว รอออก Memo</span>
          <span class="lg"><i class="sw" style="background:var(--ok)"></i>เปิด Memo แล้ว</span>
        </div>
        <div class="ychart">
          ${buckets.map(b => {
            const segs = stackSegments(b, maxN, CH);
            return `<div class="ycol">
              <div class="ytotal">${b.n || ''}</div>
              <div class="ybar" style="height:${CH}px" title="${esc(b.title)} — Pending ${b.pending} เคส (${baht0(b.pendingAmt)} บาท) · ปิดแล้วรอออก Memo ${b.waitingMemo} เคส (${baht0(b.waitingMemoAmt)} บาท) · เปิด Memo แล้ว ${b.memoed} เคส (${baht0(b.memoedAmt)} บาท)">
                ${segs.map(s => `<div class="yseg ${s.cls}" style="position:absolute;left:0;right:0;bottom:${s.bottom}px;height:${s.px}px;border-radius:${s.top?'4px 4px':'0 0'} 0 0"></div>`).join('')}
              </div>
              <div class="ymonth">${esc(b.label)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule)"><table style="min-width:1040px"><thead><tr>
        <th>${colLabel}</th><th style="text-align:right">รับเข้า</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">Pending</th><th style="text-align:right">ยอด Pending</th>
        <th style="text-align:right">รอออก Memo</th><th style="text-align:right">ยอดรอออก Memo</th>
        <th style="text-align:right">เปิด Memo แล้ว</th><th style="text-align:right">ยอดเปิด Memo</th>
      </tr></thead><tbody>
      ${buckets.map(b => `<tr style="cursor:default">
        <td>${esc(b.title)}</td>
        <td class="r">${b.n}</td><td class="r">${baht0(b.amt)}</td>
        <td class="r" style="${b.pending?'color:var(--bad)':''}">${b.pending||'—'}</td><td class="r">${b.pendingAmt?baht0(b.pendingAmt):'—'}</td>
        <td class="r" style="${b.waitingMemo?'color:var(--warn)':''}">${b.waitingMemo||'—'}</td><td class="r">${b.waitingMemoAmt?baht0(b.waitingMemoAmt):'—'}</td>
        <td class="r" style="color:var(--ok)">${b.memoed||'—'}</td><td class="r">${b.memoedAmt?baht0(b.memoedAmt):'—'}</td>
      </tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกคลัง (BU)</h3>
        <span class="sp"><button type="button" class="sm" id="dashExportBU">ส่งออก CSV แยกคลัง</button></span></div>
      <div class="tw" style="border:0"><table style="min-width:1040px"><thead><tr>
        <th>คลัง (BU)</th><th style="text-align:right">เคสทั้งปี</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">Pending</th><th style="text-align:right">ยอด Pending</th>
        <th style="text-align:right">รอออก Memo</th><th style="text-align:right">ยอดรอออก Memo</th>
        <th style="text-align:right">เปิด Memo แล้ว</th><th style="text-align:right">ยอดเปิด Memo</th>
      </tr></thead><tbody>
      ${bus.length ? bus.map(b => `<tr style="cursor:default">
        <td><span class="bu">${esc(b.bu)}</span></td>
        <td class="r">${b.n}</td><td class="r">${baht0(b.amt)}</td>
        <td class="r" style="${b.pending?'color:var(--bad)':''}">${b.pending||'—'}</td><td class="r">${b.pendingAmt?baht0(b.pendingAmt):'—'}</td>
        <td class="r" style="${b.waitingMemo?'color:var(--warn)':''}">${b.waitingMemo||'—'}</td><td class="r">${b.waitingMemoAmt?baht0(b.waitingMemoAmt):'—'}</td>
        <td class="r" style="color:var(--ok)">${b.memoed||'—'}</td><td class="r">${b.memoedAmt?baht0(b.memoedAmt):'—'}</td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty">ไม่มีเคสในปีนี้</td></tr>'}
      </tbody></table></div>
    </div>`;

  document.getElementById('dashPrev').onclick = () => { DASH.year--; render(); };
  document.getElementById('dashNext').onclick = () => { DASH.year++; render(); };
  document.getElementById('dashNow').onclick  = () => { DASH.year = NOW().getFullYear(); render(); };
  document.querySelectorAll('#dashModeSeg button').forEach(b => b.onclick = () => { DASH.mode = b.dataset.mode; render(); });
  document.getElementById('dashExportMonth').onclick = () => {
    const rows = [[colLabel,'รับเข้า','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)',
      'รอออก Memo','ยอดรอออก Memo (บาท)','เปิด Memo แล้ว','ยอดเปิด Memo (บาท)']];
    for(const b of buckets) rows.push([b.title, b.n, b.amt.toFixed(2), b.pending, b.pendingAmt.toFixed(2),
      b.waitingMemo, b.waitingMemoAmt.toFixed(2), b.memoed, b.memoedAmt.toFixed(2)]);
    download(`claim-dashboard-${periodMode?'period':'month'}-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
  document.getElementById('dashExportBU').onclick = () => {
    const rows = [['คลัง (BU)','เคสทั้งปี','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)',
      'รอออก Memo','ยอดรอออก Memo (บาท)','เปิด Memo แล้ว','ยอดเปิด Memo (บาท)']];
    for(const b of bus) rows.push([b.bu, b.n, b.amt.toFixed(2), b.pending, b.pendingAmt.toFixed(2),
      b.waitingMemo, b.waitingMemoAmt.toFixed(2), b.memoed, b.memoedAmt.toFixed(2)]);
    download(`claim-dashboard-bu-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
}
