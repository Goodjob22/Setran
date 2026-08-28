/* ============================================================
   dashboard.js — ภาพรวมทั้งปี แยกรายเดือน (หรือราย Period 15–15) และแยก BU (คลัง)
   นับตามวันที่รับเมล (m.t0) ของแต่ละเคส เหมือนหน้าอื่นในระบบ
   ============================================================ */
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
let DASH = {year: NOW().getFullYear(), mode:'month'};

/* ---------- ช่องเวลา 12 ช่องของปี — โหมดเดือนปฏิทิน หรือโหมด Period 15–15 ----------
   ทั้งสองโหมดใช้รูปร่างข้อมูลเดียวกัน (label/title/start/end) เพื่อให้ fillBuckets()
   และส่วนวาดกราฟด้านล่างใช้ร่วมกันได้โดยไม่ต้องแยกเงื่อนไข */
function monthBuckets(year){
  return Array.from({length:12}, (_, i) => ({
    label: MONTH_TH[i], title: `${MONTH_TH[i]} ${year+543}`,
    start: new Date(year, i, 1), end: new Date(year, i+1, 1)}));
}
function periodBuckets(year){
  /* periodLabel()/periodOf() มาจาก reconcile.js — ใช้กติกา 15–15 เดียวกัน */
  return Array.from({length:12}, (_, i) => {
    const start = new Date(year, i, 15), end = new Date(year, i+1, 15);
    return {label:`${pad(start.getDate())}/${pad(start.getMonth()+1)}`,
            title: periodLabel({start, end}), start, end};
  });
}
function fillBuckets(buckets){
  for(const b of buckets) Object.assign(b, {n:0, amt:0, pending:0, pendingAmt:0, closed:0, closedAmt:0});
  for(const {c, m} of CACHE){
    if(!m.t0) continue;
    const d = D(m.t0);
    const b = buckets.find(x => d >= x.start && d < x.end);
    if(!b) continue;
    const a = c.amount || 0;
    b.n++; b.amt += a;
    if(m.status === 'OPEN'){ b.pending++; b.pendingAmt += a; }
    else if(m.status === 'CLOSED'){ b.closed++; b.closedAmt += a; }
  }
  return buckets;
}
function yearByBU(year){
  const g = new Map();
  for(const {c, m, bu} of CACHE){
    if(!m.t0 || D(m.t0).getFullYear() !== year) continue;
    const key = bu || '—';
    const s = g.get(key) || {bu:key, n:0, amt:0, pending:0, pendingAmt:0, closed:0, closedAmt:0};
    const a = c.amount || 0;
    s.n++; s.amt += a;
    if(m.status === 'OPEN'){ s.pending++; s.pendingAmt += a; }
    else if(m.status === 'CLOSED'){ s.closed++; s.closedAmt += a; }
    g.set(key, s);
  }
  return [...g.values()].sort((a, b) => b.n - a.n);
}

function renderDashboard(){
  const periodMode = DASH.mode === 'period';
  const buckets = fillBuckets(periodMode ? periodBuckets(DASH.year) : monthBuckets(DASH.year));
  const bus = yearByBU(DASH.year);
  const total = buckets.reduce((s, b) => s + b.n, 0);
  const totalAmt = buckets.reduce((s, b) => s + b.amt, 0);
  const pending = buckets.reduce((s, b) => s + b.pending, 0);
  const pendingAmt = buckets.reduce((s, b) => s + b.pendingAmt, 0);
  const closed = buckets.reduce((s, b) => s + b.closed, 0);
  const closedAmt = buckets.reduce((s, b) => s + b.closedAmt, 0);
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
        <div class="tot"><div class="tk">ปิดแล้ว</div><div class="tv ok">${closed}</div><div class="tn">${baht0(closedAmt)} บาท</div></div>
        <div class="tot"><div class="tk">สัดส่วน Pending</div>
          <div class="tv ${pendingPct != null && pendingPct > 30 ? 'bad' : ''}">${pendingPct != null ? pendingPct+'%' : '—'}</div>
          <div class="tn">ของเคสทั้งปี</div></div>
      </div></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกราย${periodMode ? ' Period (15–15)' : 'เดือน'} — Pending เทียบกับปิดแล้ว</h3>
        <span class="sp">
          <div class="seg" id="dashModeSeg">
            <button data-mode="month" aria-pressed="${!periodMode}">เดือนปฏิทิน</button>
            <button data-mode="period" aria-pressed="${periodMode}">Period (15–15)</button>
          </div>
          <button type="button" class="sm" id="dashExportMonth">ส่งออก CSV</button></span></div>
      <div class="pbody">
        <div class="ylegend">
          <span class="lg"><i class="sw" style="background:var(--bad)"></i>Pending (ค้าง)</span>
          <span class="lg"><i class="sw" style="background:var(--ok)"></i>ปิดแล้ว</span>
        </div>
        <div class="ychart">
          ${buckets.map(b => {
            const closedPx = b.n ? Math.round(b.closed / maxN * CH) : 0;
            const pendingPx = b.n ? Math.round(b.pending / maxN * CH) : 0;
            const gap = b.closed && b.pending ? 2 : 0;
            const closedTop = b.pending === 0;
            return `<div class="ycol">
              <div class="ytotal">${b.n || ''}</div>
              <div class="ybar" style="height:${CH}px" title="${esc(b.title)} — Pending ${b.pending} เคส (${baht0(b.pendingAmt)} บาท) · ปิดแล้ว ${b.closed} เคส (${baht0(b.closedAmt)} บาท)">
                ${b.pending ? `<div class="yseg pending" style="position:absolute;left:0;right:0;bottom:${closedPx+gap}px;height:${pendingPx}px;border-radius:4px 4px 0 0"></div>` : ''}
                ${b.closed ? `<div class="yseg closed" style="position:absolute;left:0;right:0;bottom:0;height:${closedPx}px;border-radius:${closedTop?'4px 4px':'0 0'} 0 0"></div>` : ''}
              </div>
              <div class="ymonth">${esc(b.label)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule)"><table style="min-width:760px"><thead><tr>
        <th>${colLabel}</th><th style="text-align:right">รับเข้า</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">Pending</th><th style="text-align:right">ยอด Pending</th>
        <th style="text-align:right">ปิดแล้ว</th><th style="text-align:right">ยอดปิดแล้ว</th>
      </tr></thead><tbody>
      ${buckets.map(b => `<tr style="cursor:default">
        <td>${esc(b.title)}</td>
        <td class="r">${b.n}</td><td class="r">${baht0(b.amt)}</td>
        <td class="r" style="${b.pending?'color:var(--bad)':''}">${b.pending||'—'}</td><td class="r">${b.pendingAmt?baht0(b.pendingAmt):'—'}</td>
        <td class="r" style="color:var(--ok)">${b.closed||'—'}</td><td class="r">${b.closedAmt?baht0(b.closedAmt):'—'}</td>
      </tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="panel">
      <div class="phead"><h3>แยกคลัง (BU)</h3>
        <span class="sp"><button type="button" class="sm" id="dashExportBU">ส่งออก CSV แยกคลัง</button></span></div>
      <div class="tw" style="border:0"><table style="min-width:760px"><thead><tr>
        <th>คลัง (BU)</th><th style="text-align:right">เคสทั้งปี</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">Pending</th><th style="text-align:right">ยอด Pending</th><th style="text-align:right">% Pending</th>
        <th style="text-align:right">ปิดแล้ว</th><th style="text-align:right">ยอดปิดแล้ว</th>
      </tr></thead><tbody>
      ${bus.length ? bus.map(b => `<tr style="cursor:default">
        <td><span class="bu">${esc(b.bu)}</span></td>
        <td class="r">${b.n}</td><td class="r">${baht0(b.amt)}</td>
        <td class="r" style="${b.pending?'color:var(--bad)':''}">${b.pending||'—'}</td><td class="r">${b.pendingAmt?baht0(b.pendingAmt):'—'}</td>
        <td class="r">${b.n?Math.round(b.pending/b.n*100)+'%':'—'}</td>
        <td class="r" style="color:var(--ok)">${b.closed||'—'}</td><td class="r">${b.closedAmt?baht0(b.closedAmt):'—'}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="empty">ไม่มีเคสในปีนี้</td></tr>'}
      </tbody></table></div>
    </div>`;

  document.getElementById('dashPrev').onclick = () => { DASH.year--; render(); };
  document.getElementById('dashNext').onclick = () => { DASH.year++; render(); };
  document.getElementById('dashNow').onclick  = () => { DASH.year = NOW().getFullYear(); render(); };
  document.querySelectorAll('#dashModeSeg button').forEach(b => b.onclick = () => { DASH.mode = b.dataset.mode; render(); });
  document.getElementById('dashExportMonth').onclick = () => {
    const rows = [[colLabel,'รับเข้า','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)','ปิดแล้ว','ยอดปิดแล้ว (บาท)']];
    for(const b of buckets) rows.push([b.title, b.n, b.amt.toFixed(2), b.pending, b.pendingAmt.toFixed(2), b.closed, b.closedAmt.toFixed(2)]);
    download(`claim-dashboard-${periodMode?'period':'month'}-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
  document.getElementById('dashExportBU').onclick = () => {
    const rows = [['คลัง (BU)','เคสทั้งปี','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)','% Pending','ปิดแล้ว','ยอดปิดแล้ว (บาท)']];
    for(const b of bus) rows.push([b.bu, b.n, b.amt.toFixed(2), b.pending, b.pendingAmt.toFixed(2),
      b.n ? Math.round(b.pending/b.n*100) : 0, b.closed, b.closedAmt.toFixed(2)]);
    download(`claim-dashboard-bu-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
}
