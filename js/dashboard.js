/* ============================================================
   dashboard.js — ภาพรวมทั้งปี แยกรายเดือนและแยก BU (คลัง)
   นับตามวันที่รับเมล (m.t0) ของแต่ละเคส เหมือนหน้าอื่นในระบบ
   ============================================================ */
const MONTH_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
let DASH = {year: NOW().getFullYear()};

function yearMonths(year){
  const months = Array.from({length:12}, (_, i) => ({m:i, n:0, amt:0, pending:0, pendingAmt:0, closed:0, closedAmt:0}));
  for(const {c, m} of CACHE){
    if(!m.t0) continue;
    const d = D(m.t0);
    if(d.getFullYear() !== year) continue;
    const mo = months[d.getMonth()];
    const a = c.amount || 0;
    mo.n++; mo.amt += a;
    if(m.status === 'OPEN'){ mo.pending++; mo.pendingAmt += a; }
    else if(m.status === 'CLOSED'){ mo.closed++; mo.closedAmt += a; }
  }
  return months;
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
  const months = yearMonths(DASH.year);
  const bus = yearByBU(DASH.year);
  const total = months.reduce((s, mo) => s + mo.n, 0);
  const totalAmt = months.reduce((s, mo) => s + mo.amt, 0);
  const pending = months.reduce((s, mo) => s + mo.pending, 0);
  const pendingAmt = months.reduce((s, mo) => s + mo.pendingAmt, 0);
  const closed = months.reduce((s, mo) => s + mo.closed, 0);
  const closedAmt = months.reduce((s, mo) => s + mo.closedAmt, 0);
  const pendingPct = total ? Math.round(pending / total * 100) : null;
  const CH = 200;   // ความสูงกราฟ (px)
  const maxN = Math.max(1, ...months.map(mo => mo.n));

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
      <div class="phead"><h3>แยกรายเดือน — Pending เทียบกับปิดแล้ว</h3>
        <span class="sp"><button type="button" class="sm" id="dashExportMonth">ส่งออก CSV รายเดือน</button></span></div>
      <div class="pbody">
        <div class="ylegend">
          <span class="lg"><i class="sw" style="background:var(--bad)"></i>Pending (ค้าง)</span>
          <span class="lg"><i class="sw" style="background:var(--ok)"></i>ปิดแล้ว</span>
        </div>
        <div class="ychart">
          ${months.map(mo => {
            const closedPx = mo.n ? Math.round(mo.closed / maxN * CH) : 0;
            const pendingPx = mo.n ? Math.round(mo.pending / maxN * CH) : 0;
            const gap = mo.closed && mo.pending ? 2 : 0;
            const closedTop = mo.pending === 0;
            return `<div class="ycol">
              <div class="ytotal">${mo.n || ''}</div>
              <div class="ybar" style="height:${CH}px" title="${MONTH_TH[mo.m]} ${DASH.year+543} — Pending ${mo.pending} เคส (${baht0(mo.pendingAmt)} บาท) · ปิดแล้ว ${mo.closed} เคส (${baht0(mo.closedAmt)} บาท)">
                ${mo.pending ? `<div class="yseg pending" style="position:absolute;left:0;right:0;bottom:${closedPx+gap}px;height:${pendingPx}px;border-radius:4px 4px 0 0"></div>` : ''}
                ${mo.closed ? `<div class="yseg closed" style="position:absolute;left:0;right:0;bottom:0;height:${closedPx}px;border-radius:${closedTop?'4px 4px':'0 0'} 0 0"></div>` : ''}
              </div>
              <div class="ymonth">${MONTH_TH[mo.m]}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="tw" style="border:0;border-top:1px solid var(--rule)"><table style="min-width:760px"><thead><tr>
        <th>เดือน</th><th style="text-align:right">รับเข้า</th><th style="text-align:right">ยอดรวม</th>
        <th style="text-align:right">Pending</th><th style="text-align:right">ยอด Pending</th>
        <th style="text-align:right">ปิดแล้ว</th><th style="text-align:right">ยอดปิดแล้ว</th>
      </tr></thead><tbody>
      ${months.map(mo => `<tr style="cursor:default">
        <td>${MONTH_TH[mo.m]} ${DASH.year+543}</td>
        <td class="r">${mo.n}</td><td class="r">${baht0(mo.amt)}</td>
        <td class="r" style="${mo.pending?'color:var(--bad)':''}">${mo.pending||'—'}</td><td class="r">${mo.pendingAmt?baht0(mo.pendingAmt):'—'}</td>
        <td class="r" style="color:var(--ok)">${mo.closed||'—'}</td><td class="r">${mo.closedAmt?baht0(mo.closedAmt):'—'}</td>
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
  document.getElementById('dashExportMonth').onclick = () => {
    const rows = [['เดือน','รับเข้า','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)','ปิดแล้ว','ยอดปิดแล้ว (บาท)']];
    for(const mo of months) rows.push([`${MONTH_TH[mo.m]} ${DASH.year+543}`, mo.n, mo.amt.toFixed(2),
      mo.pending, mo.pendingAmt.toFixed(2), mo.closed, mo.closedAmt.toFixed(2)]);
    download(`claim-dashboard-month-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
  document.getElementById('dashExportBU').onclick = () => {
    const rows = [['คลัง (BU)','เคสทั้งปี','ยอดรวม (บาท)','Pending','ยอด Pending (บาท)','% Pending','ปิดแล้ว','ยอดปิดแล้ว (บาท)']];
    for(const b of bus) rows.push([b.bu, b.n, b.amt.toFixed(2), b.pending, b.pendingAmt.toFixed(2),
      b.n ? Math.round(b.pending/b.n*100) : 0, b.closed, b.closedAmt.toFixed(2)]);
    download(`claim-dashboard-bu-${DASH.year}-${stamp()}.csv`, csv(rows));
  };
}
