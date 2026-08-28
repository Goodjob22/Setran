/* ============================================================
   auth-supabase.js — หน้าเข้าสู่ระบบ ใช้ระบบล็อกอินของ Supabase
   ============================================================ */
let ME = null;

const AU = {
  login:  (email, password) => SB.auth.signInWithPassword({ email, password }),
  signup: (email, password, display) =>
            SB.auth.signUp({ email, password, options:{ data:{ display } } }),
  reset:  email => SB.auth.resetPasswordForEmail(email, { redirectTo: location.href }),
  out:    () => SB.auth.signOut(),
};

function authErr(e){
  const m = String(e?.message || e);
  if(/Invalid login credentials/i.test(m))       return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if(/Email not confirmed/i.test(m))             return 'ยังไม่ได้ยืนยันอีเมล — เปิดกล่องจดหมายแล้วกดลิงก์ยืนยันก่อน';
  if(/User already registered/i.test(m))         return 'อีเมลนี้สมัครไว้แล้ว — กดเข้าสู่ระบบแทน';
  if(/Password should be at least/i.test(m))     return 'รหัสผ่านสั้นเกินไป ต้องอย่างน้อย 8 ตัวอักษร';
  if(/rate limit|too many/i.test(m))             return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่';
  if(/Signups not allowed/i.test(m))             return 'ระบบปิดการสมัครเอง — ให้ผู้ดูแลเพิ่มบัญชีให้';
  if(/Failed to fetch/i.test(m))                 return 'ต่อเน็ตไม่ได้ — ตรวจสัญญาณอินเทอร์เน็ต';
  return m;
}

function authScreen(mode, msg){
  const signup = mode === 'signup';
  document.getElementById('authWrap').hidden = false;
  document.getElementById('shell').hidden = true;
  document.getElementById('authWrap').innerHTML = `
    <div class="authbox">
      <div class="authhead">
        <div class="authmark">⏱</div>
        <div>
          <h1>Operations Transport เคลียร์เคลม 48 ชั่วโมง</h1>
          <p>${signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบเพื่อใช้งาน'}</p>
        </div>
      </div>
      ${signup ? `<div class="authnote">คนแรกที่สมัครจะเป็นผู้ดูแลระบบโดยอัตโนมัติ
        คนถัดไปต้องรอผู้ดูแลกดอนุมัติก่อนถึงจะเห็นข้อมูล</div>` : ''}
      <form id="authForm" novalidate>
        <div class="afld"><label for="aUser">อีเมล</label>
          <input type="email" id="aUser" autocomplete="username" autocapitalize="off"
            spellcheck="false" required placeholder="you@company.com"></div>
        ${signup ? `<div class="afld"><label for="aName">ชื่อที่ใช้แสดง</label>
          <input type="text" id="aName" placeholder="เช่น ปลา ฝ่ายเคลม"></div>` : ''}
        <div class="afld"><label for="aPw">รหัสผ่าน</label>
          <input type="password" id="aPw" autocomplete="${signup?'new-password':'current-password'}" required>
          ${signup ? '<span class="ahint">อย่างน้อย 8 ตัวอักษร</span>' : ''}</div>
        ${signup ? `<div class="afld"><label for="aPw2">ยืนยันรหัสผ่าน</label>
          <input type="password" id="aPw2" autocomplete="new-password" required></div>` : ''}
        <div class="aerr" id="aErr" ${msg?'':'hidden'}>${esc(msg||'')}</div>
        <button type="submit" class="abtn">${signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}</button>
      </form>
      <p class="afoot" style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
        <a href="#" id="aSwap">${signup ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี สมัครใช้งาน'}</a>
        ${signup ? '' : '<a href="#" id="aForgot">ลืมรหัสผ่าน</a>'}
      </p>
      <p class="afoot">ระบบนี้เก็บข้อมูลเคลมและรูปหลักฐานของบริษัท อย่าใช้รหัสผ่านร่วมกับบัญชีอื่น</p>
    </div>`;

  const err = t => { const e = document.getElementById('aErr'); e.textContent = t; e.hidden = false; };
  document.getElementById('aUser').focus();
  document.getElementById('aSwap').onclick = e => { e.preventDefault(); authScreen(signup ? 'login' : 'signup'); };

  const fg = document.getElementById('aForgot');
  if(fg) fg.onclick = async e => {
    e.preventDefault();
    const email = document.getElementById('aUser').value.trim();
    if(!email){ err('กรอกอีเมลก่อน แล้วค่อยกดลืมรหัสผ่าน'); return; }
    const { error } = await AU.reset(email);
    err(error ? authErr(error) : 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว — เปิดกล่องจดหมายได้เลย');
  };

  document.getElementById('authForm').onsubmit = async ev => {
    ev.preventDefault();
    const email = document.getElementById('aUser').value.trim();
    const pw    = document.getElementById('aPw').value;
    if(!email || !pw){ err('กรอกให้ครบทั้งสองช่อง'); return; }
    if(signup && pw !== document.getElementById('aPw2').value){ err('รหัสผ่านสองช่องไม่ตรงกัน'); return; }
    if(signup && pw.length < 8){ err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร'); return; }
    const btn = document.querySelector('.abtn');
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…';
    try{
      if(signup){
        const { data, error } = await AU.signup(email, pw, document.getElementById('aName').value.trim());
        if(error) throw error;
        if(!data.session){
          authScreen('login', 'สมัครเรียบร้อย — เปิดอีเมลแล้วกดลิงก์ยืนยัน จากนั้นกลับมาเข้าสู่ระบบ');
          return;
        }
      }else{
        const { error } = await AU.login(email, pw);
        if(error) throw error;
      }
      document.getElementById('authWrap').hidden = true;
      document.getElementById('shell').hidden = false;
      await startApp();
    }catch(e){
      err(authErr(e));
      btn.disabled = false; btn.textContent = signup ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ';
    }
  };
}

/* หน้าจอ "สมัครแล้ว แต่ผู้ดูแลยังไม่อนุมัติ" */
function waitScreen(email){
  document.getElementById('authWrap').hidden = false;
  document.getElementById('shell').hidden = true;
  document.getElementById('authWrap').innerHTML = `
    <div class="authbox">
      <div class="authhead"><div class="authmark">⏳</div>
        <div><h1>รอผู้ดูแลอนุมัติ</h1><p>${esc(email || '')}</p></div></div>
      <div class="authnote">บัญชีสร้างเรียบร้อยแล้ว แต่ยังเปิดใช้งานไม่ได้<br><br>
        แจ้งผู้ดูแลระบบให้เข้าไปที่หน้า <b>ตั้งค่า &gt; ผู้ใช้งาน</b> แล้วกดเปิดใช้งานบัญชีนี้
        พร้อมเลือก BU ให้ด้วย จากนั้นกดปุ่มด้านล่างเพื่อลองใหม่</div>
      <button type="button" class="abtn" onclick="location.reload()">ตรวจสอบอีกครั้ง</button>
      <p class="afoot"><a href="#" onclick="logout();return false">ออกจากระบบ</a></p>
    </div>`;
}

async function logout(){
  try{ await AU.out(); }catch(e){}
  location.reload();
}

/* กล่องเปลี่ยนรหัสผ่านตัวเอง */
function openPassword(){
  document.getElementById('pTitle').textContent = 'เปลี่ยนรหัสผ่าน';
  document.getElementById('pBody').innerHTML = `
    <form id="pwForm" novalidate>
      <div class="frow"><div class="fld"><label for="pNew">รหัสผ่านใหม่</label>
        <input type="password" id="pNew" autocomplete="new-password" required>
        <span class="inline-hint">อย่างน้อย 8 ตัวอักษร</span></div>
        <div class="fld"><label for="pNew2">ยืนยันรหัสผ่านใหม่</label>
        <input type="password" id="pNew2" autocomplete="new-password" required></div></div>
      <div class="err" id="pErr"></div>
      <div class="actions"><button type="submit" class="pri">บันทึกรหัสผ่านใหม่</button></div>
    </form>`;
  document.getElementById('pdlg').showModal();
  document.getElementById('pwForm').onsubmit = async ev => {
    ev.preventDefault();
    const e = document.getElementById('pErr'); e.style.display = 'none';
    const next = document.getElementById('pNew').value;
    if(next.length < 8){ e.textContent = 'รหัสผ่านสั้นเกินไป'; e.style.display='block'; return; }
    if(next !== document.getElementById('pNew2').value){
      e.textContent = 'รหัสผ่านใหม่สองช่องไม่ตรงกัน'; e.style.display = 'block'; return; }
    const { error } = await SB.auth.updateUser({ password: next });
    if(error){ e.textContent = authErr(error); e.style.display = 'block'; return; }
    document.getElementById('pdlg').close();
    toast('เปลี่ยนรหัสผ่านแล้ว');
  };
}
