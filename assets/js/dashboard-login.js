/* ===== dashboard sign-in screen (replaces the landing page in the dashboard build) ===== */
S.loginRole='landlord';
function Landing(){
  const r=S.loginRole;
  return `<div class="lsplit">
   <aside class="lbrand"><div>${logoImg(84,'dark')}</div>
     <div class="lb-mid"><h1>${T('لوحة تحكم إيجاري','Ejari control panel')}</h1><p>${T('إدارة العقود والمدفوعات والصيانة والتجديد في مكان واحد، لكل من المؤجر والمستأجر والإدارة.','Manage leases, payments, maintenance and renewals in one place — for landlords, tenants and administrators.')}</p>
     <ul>${[[T('عقود بتوقيع إلكتروني ورمز QR','E-signed leases with QR verification'),'pen'],[T('تحصيل ومتابعة للمدفوعات لحظياً','Live payment collection and tracking'),'card'],[T('لوحة مراجعة وصلاحيات وسجل تدقيق','Review queues, permissions and audit log'),'shield']].map(x=>`<li>${ic(x[1],18)}<span>${x[0]}</span></li>`).join('')}</ul></div>
     <div class="xs" style="opacity:.7">${T('© 2026 إيجاري — منصة إدارة الإيجارات','© 2026 Ejari — rental management platform')}</div></aside>
   <main class="lform"><div class="lf-top"><a class="btn ghost sm" data-a="home">${ic(S.lang==='ar'?'right':'left',16)} ${T('العودة إلى الموقع','Back to website')}</a><span class="sp"></span>
     <button class="btn ico ghost" data-a="lang" aria-label="${T('English','العربية')}"><b style="font-size:13px">${T('EN','ع')}</b></button><button class="btn ico ghost" data-a="theme" aria-label="${T('تبديل المظهر','Toggle theme')}">${ic(isDark()?'sun':'moon',18)}</button></div>
    <form class="lcard" data-form="signin"><h2>${T('تسجيل الدخول','Sign in')}</h2>${demoOn()?`<p class="mut" style="margin:4px 0 18px">${T('اختر نوع الحساب للدخول بحساب تجريبي:','Choose an account type to sign in with a demo account:')}</p>
     <div class="rolepick" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:18px">${Object.keys(ROLES).map(k=>`<button type="button" class="rp ${k===r?'on':''}" data-a="loginrole" data-r="${k}"><span class="ii" style="color:${ROLES[k].c}">${ic(ROLES[k].icon,22)}</span><b class="sm">${T(ROLES[k].ar,ROLES[k].en)}</b></button>`).join('')}</div>
     <div class="col">${field(T('البريد الإلكتروني','Email'),inp('lgMail2',DEMO_EMAIL[r],'email','dir="ltr" style="text-align:start" readonly'))}${field(T('كلمة المرور','Password'),inp('lgPw2','Demo@1234','password','readonly'))}</div>
     <button class="btn brand lg" style="width:100%;margin-top:20px" data-a="submitdemo" data-r="${r}">${ic('lock',17)}${T('دخول','Sign in')} · ${T(ROLES[r].ar,ROLES[r].en)}</button>
     <div class="hint tc" style="margin-top:12px">${T('حساب تجريبي حقيقي — بيانات معبّأة تلقائياً.','A real demo account — credentials filled in automatically.')}</div>`
   :`<p class="mut" style="margin:4px 0 18px">${T('أدخل بيانات حسابك للدخول.','Enter your account details to sign in.')}</p>
     <div class="col">${field(T('البريد الإلكتروني','Email'),inp('lgMail','','email','dir="ltr" style="text-align:start" data-focus autocomplete="username"'))}${field(T('كلمة المرور','Password'),inp('lgPw','','password','dir="ltr" style="text-align:start" autocomplete="current-password"'))}</div>
     <button class="btn brand lg" style="width:100%;margin-top:20px" data-a="pwlogin">${ic('lock',17)}${T('دخول','Sign in')}</button>`}
     <div class="hr"></div><div class="tc sm mut">${T('ليس لديك حساب؟','No account yet?')} <a style="color:var(--brand);font-weight:600;cursor:pointer" data-a="modal" data-t="register">${T('أنشئ حساباً','Create one')}</a> · <a style="color:var(--brand);font-weight:600;cursor:pointer" data-a="modal" data-t="verify">${T('التحقق من عقد','Verify a contract')}</a></div></form></main></div>`;
}
A.loginrole=d=>{S.loginRole=d.r;render()};
A.submitdemo=d=>A.login({r:d.r});
FORMS.signin=e=>{e.preventDefault();A.login({r:S.loginRole})};
