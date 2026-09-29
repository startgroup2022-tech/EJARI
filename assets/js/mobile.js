/* ===== MOBILE APP shell (bottom tab bar). Overrides App() / Landing() from the desktop bundle. ===== */
document.documentElement.classList.add('mobile-app');
const TABS={
  tenant:[['overview','home','الرئيسية','Home'],['payments','card','المدفوعات','Payments'],['contracts','file','عقدي','Lease'],['maintenance','wrench','الصيانة','Repairs'],['more','menu','المزيد','More']],
  landlord:[['overview','home','الرئيسية','Home'],['contracts','file','العقود','Leases'],['payments','card','المدفوعات','Payments'],['maintenance','wrench','الصيانة','Repairs'],['more','menu','المزيد','More']]
};
TITLE.more=['المزيد','More'];
function App(){
  const tabs=TABS[S.role]||TABS.tenant;const ids=tabs.map(t=>t[0]);const isTab=ids.includes(S.view);const n=unread();
  return `<div class="mapp"><header class="mtop">${isTab?'':`<button class="btn ico ghost" data-a="mback" aria-label="${T('رجوع','Back')}">${ic(S.lang==='ar'?'right':'left',22)}</button>`}<span class="mlogo">${logoImg(42)}</span><span class="sp"></span>
    <button class="btn ico ghost rel" data-a="nav" data-v="notifications" aria-label="${T('الإشعارات','Notifications')}">${ic('bell',22)}${n?'<span class="dot"></span>':''}</button>
    <button class="mav" data-a="nav" data-v="more" aria-label="${T('حسابي','My account')}">${ava(dispName())}</button></header>
   <main id="view" tabindex="-1">${View()}</main>
   <nav class="tabbar" aria-label="${T('التنقل الرئيسي','Main navigation')}">${tabs.map(t=>{const on=S.view===t[0]||(t[0]==='more'&&!ids.includes(S.view));const b=t[0]==='more'?0:badgeFor(t[0]);return `<button class="tab ${on?'on':''}" data-a="nav" data-v="${t[0]}" ${on?'aria-current="page"':''}>${ic(t[1],22)}<span>${T(t[2],t[3])}</span>${b?`<i class="tb">${b}</i>`:''}</button>`}).join('')}</nav></div>`;
}
A.mback=()=>go(['notifications','profile'].includes(S.view)?'overview':'more');
V.more=()=>{
  const all=NAV[S.role].flatMap(g=>g[1]);const tabIds=(TABS[S.role]||[]).map(t=>t[0]);
  const items=all.filter(i=>!tabIds.includes(i[0])).map(i=>[i[0],i[1],T(i[2],i[3]),badgeFor(i[0])]).concat([['notifications','bell',T('الإشعارات','Notifications'),unread()],['profile','user',T('حسابي وإعداداتي','My account & settings'),0]]);
  return `<div class="card" style="margin-bottom:16px"><div class="cb row" style="gap:14px">${ava(dispName(),'lg')}<div style="flex:1;min-width:0"><b style="font-size:18px">${esc(dispName())}</b><div class="sm mut">${T(ROLES[S.role].ar,ROLES[S.role].en)}</div></div></div></div>
  <div class="card" style="margin-bottom:16px">${items.map(i=>`<button class="li click mrow" data-a="nav" data-v="${i[0]}"><span class="ii teal">${ic(i[1],19)}</span><div class="tx b">${i[2]}</div>${i[3]?`<span class="bd">${i[3]}</span>`:''}${ic(S.lang==='ar'?'left':'right',16)}</button>`).join('')}</div>
  <div class="card" style="margin-bottom:16px"><div class="cb col"><div class="row"><span style="flex:1">${T('الحساب التجريبي','Demo account')}</span>${seg([['tenant',T('مستأجر','Tenant')],['landlord',T('مؤجر','Landlord')]],S.role,'switchrole2')}</div>
   <div class="row"><span style="flex:1">${T('اللغة','Language')}</span>${seg([['ar','العربية'],['en','English']],S.lang,'setlang')}</div>
   <div class="row"><span style="flex:1">${T('المظهر','Theme')}</span>${seg([['auto',T('تلقائي','Auto')],['light',T('فاتح','Light')],['dark',T('داكن','Dark')]],S.theme,'settheme')}</div></div></div>
  <button class="btn danger" style="width:100%" data-a="logout">${ic('logout',17)}${T('تسجيل الخروج','Sign out')}</button>
  <div class="xs mut3 tc" style="margin-top:14px">${T('إيجاري · نسخة تجريبية 1.0 — البيانات وهمية','Ejari · demo build 1.0 — fictional data')}</div>`;
};
A.switchrole2=async d=>{S.view='overview';await A.login({r:d.v})};
/* splash / sign-in */
function Landing(){
  return `<div class="splash"><div class="sp-top"><button class="btn ico ghost lt" data-a="lang" aria-label="${T('English','العربية')}"><b style="font-size:13px">${T('EN','ع')}</b></button></div>
   <div class="sp-mid">${logoImg(150,'dark')}<h1>${T('إيجارك. عقارك. حقوقك.','Your rent. Your property. Your rights.')}</h1><p>${T('كلها في منصة واحدة','All on one platform')}</p></div>
   <div class="sp-bot"><button class="btn brand lg" data-a="login" data-r="tenant">${ic('key',18)}${T('دخول كمستأجر (تجريبي)','Enter as tenant (demo)')}</button><button class="btn lg w" data-a="login" data-r="landlord">${ic('building',18)}${T('دخول كمؤجر (تجريبي)','Enter as landlord (demo)')}</button>
   <div class="sp-links"><a data-a="modal" data-t="login">${T('بريد وكلمة مرور','Email & password')}</a><span>·</span><a data-a="modal" data-t="verify">${T('التحقق من عقد','Verify a contract')}</a><span>·</span><a data-a="modal" data-t="register">${T('إنشاء حساب','Create account')}</a></div></div></div>`;
}
