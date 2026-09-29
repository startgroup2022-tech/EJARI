/* ===== real authentication: demo quick sign-in, email+password login, and registration =====
   Shared by website.html, dashboard.html and app.html. Each entry defines its own `onAuthed()`
   (see boot-website.js / boot-dashboard.js / boot-app.js) — what happens right after a session
   is established (redirect to the dashboard, or hydrate + render in place). */
const DESC={landlord:['إدارة العقارات والعقود والتحصيل','Properties, leases and collections'],tenant:['عقدي ومدفوعاتي وطلبات الصيانة','My lease, payments and repairs'],admin:['مراجعة المنصة والمستخدمين والرسوم','Platform, users and fees oversight']};
const DEMO_EMAIL={landlord:'rashed.almanai@example.bh',tenant:'sara.aldosari@example.bh',admin:'fatima.alhammadi@ejari.bh'};

/* quick demo sign-in: real session, real seeded account — used by every "enter as …" button */
A.login=async(d)=>{
  try{await API.post('/api/auth/demo',{role:d.r});await onAuthed()}
  catch(e){apiError(e,'تعذّر الدخول','Could not sign in')}
};

A.logintab=d=>{S.authTab=d.v;rerenderModal()};

MOD.login=d=>{
  const tab=S.authTab||'demo';
  return {title:T('تسجيل الدخول','Sign in'),cls:'narrow',body:`<div class="authlogo">${logoImg(80)}</div>${d.msg?`<div class="verres" style="background:var(--infosoft);color:var(--info);margin-bottom:14px">${ic('info',20)}<div class="sm" style="color:var(--ink)">${esc(d.msg)}</div></div>`:''}
   <div class="seg" style="width:100%;margin-bottom:16px">${seg([['demo',T('حساب تجريبي','Demo account')],['pw',T('بريد وكلمة مرور','Email & password')]],tab,'logintab')}</div>
   ${tab==='demo'?`<p class="mut sm" style="margin-bottom:14px">${T('حسابات تجريبية حقيقية ومحفوظة في قاعدة البيانات — اختر دوراً للدخول فوراً:','Real, database-backed demo accounts — pick a role to sign in instantly:')}</p><div class="rolepick">${Object.keys(ROLES).map(k=>`<button data-a="login" data-r="${k}"><span class="ii" style="color:${ROLES[k].c}">${ic(ROLES[k].icon,22)}</span><span style="flex:1"><b>${T(ROLES[k].ar,ROLES[k].en)}</b><small class="mut" style="display:block">${T(...DESC[k])}</small></span>${ic(S.lang==='ar'?'left':'right',16)}</button>`).join('')}</div>`
   :`<div class="col">${field(T('البريد الإلكتروني','Email'),inp('lgMail','','email','dir="ltr" style="text-align:start" data-focus autocomplete="username"'))}${field(T('كلمة المرور','Password'),inp('lgPw','','password','dir="ltr" style="text-align:start" autocomplete="current-password"'))}</div><div class="hint" style="margin-top:8px">${T('جرّب أحد الحسابات التجريبية أعلاه، بريده وكلمة المرور','Try one of the demo accounts above, with its email and password')} <b dir="ltr">Demo@1234</b></div><button class="btn brand" style="width:100%;margin-top:14px" data-a="pwlogin">${ic('lock',16)}${T('دخول','Sign in')}</button>`}
   <div class="hr"></div><div class="tc sm mut">${T('ليس لديك حساب؟','No account yet?')} <a style="color:var(--brand);font-weight:600;cursor:pointer" data-a="modal" data-t="register">${T('أنشئ حساباً','Create one')}</a></div>`};
};

A.pwlogin=async()=>{
  const email=val('lgMail').trim(),pw=val('lgPw');
  if(!email||!pw){toast(T('أدخل البريد وكلمة المرور','Enter your email and password'),true);return}
  try{await API.post('/api/auth/login',{email,password:pw});await onAuthed()}
  catch(e){
    if(e&&e.status===401)toast(T('البريد أو كلمة المرور غير صحيحة','Incorrect email or password'),true);
    else if(e&&e.status===403)toast(T('الحساب موقوف','This account is suspended'),true);
    else apiError(e,'تعذّر تسجيل الدخول','Could not sign in');
  }
};

MOD.register=()=>({title:T('إنشاء حساب جديد','Create a new account'),body:`<div class="fg"><div class="full"><label class="lb">${T('نوع الحساب','Account type')}</label><div class="fg"><label class="opt"><input type="radio" name="rgR" value="landlord" checked>${ic('building',18)}<b>${T('مؤجر','Landlord')}</b></label><label class="opt"><input type="radio" name="rgR" value="tenant">${ic('key',18)}<b>${T('مستأجر','Tenant')}</b></label></div></div>${field(T('الاسم الكامل','Full name'),inp('rgN','','text','autocomplete="name" data-focus'),'full')}${field(T('الرقم الشخصي (CPR)','CPR number'),inp('rgC','','text','inputmode="numeric" maxlength="9" dir="ltr" style="text-align:start" placeholder="9 '+T('أرقام','digits')+'"'))}${field(T('رقم الهاتف','Phone'),inp('rgP','','tel','dir="ltr" style="text-align:start" placeholder="+973 3XXX XXXX"'))}${field(T('البريد الإلكتروني','Email'),inp('rgE','','email','dir="ltr" style="text-align:start" autocomplete="username"'),'full')}${field(T('كلمة المرور','Password'),inp('rgPw','','password','dir="ltr" style="text-align:start" autocomplete="new-password"'),'full','8+ '+T('أحرف','characters'))}<label class="opt full"><input type="checkbox" id="rgT"><span class="sm">${T('أوافق على الشروط والأحكام وسياسة الخصوصية','I agree to the terms & conditions and privacy policy')}</span></label></div>`,foot:`<button class="btn" data-a="close">${T('إلغاء','Cancel')}</button><button class="btn brand" data-a="regsave">${T('إنشاء الحساب','Create account')}</button>`});
A.regsave=async()=>{
  const n=val('rgN').trim(),c=val('rgC').trim(),pw=val('rgPw');
  if(n.length<3){toast(T('أدخل اسمك الكامل','Enter your full name'),true);return}
  if(!/^\d{9}$/.test(c)){toast(T('الرقم الشخصي يتكون من 9 أرقام','CPR must be 9 digits'),true);return}
  if(!/.+@.+\..+/.test(val('rgE'))){toast(T('أدخل بريداً إلكترونياً صحيحاً','Enter a valid email'),true);return}
  if(pw.length<8){toast(T('كلمة المرور 8 أحرف على الأقل','Password must be at least 8 characters'),true);return}
  if(!chk('rgT')){toast(T('يجب الموافقة على الشروط','You must accept the terms'),true);return}
  const role=(document.querySelector('input[name=rgR]:checked')||{}).value||'landlord';
  try{
    await API.post('/api/auth/register',{role,name:n,cpr:c,phone:val('rgP').trim(),email:val('rgE').trim(),password:pw});
    toast(T('تم إنشاء حسابك — أهلاً '+n.split(' ')[0],'Account created — welcome '+n.split(' ')[0]));
    await onAuthed();
  }catch(e){
    if(e&&e.status===409)toast(T('هذا البريد مستخدم بالفعل','This email is already registered'),true);
    else apiError(e,'تعذّر إنشاء الحساب','Could not create the account');
  }
};
