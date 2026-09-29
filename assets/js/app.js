/* ===== app shell ===== */
const A={},IN={},CH={},FORMS={},V={},MOD={},POST={};
const ROLES={
  landlord:{ar:'مؤجر',en:'Landlord',icon:'building',c:'var(--brand)'},
  tenant:{ar:'مستأجر',en:'Tenant',icon:'key',c:'var(--slate)'},
  admin:{ar:'مدير النظام',en:'Administrator',icon:'shield',c:'var(--gold)'}
};
const NAV={
 landlord:[
  [null,[['overview','grid','نظرة عامة','Overview'],['properties','building','العقارات','Properties'],['contracts','file','العقود','Contracts'],['payments','card','المدفوعات','Payments'],['renewals','refresh','التجديد','Renewals'],['maintenance','wrench','الصيانة','Maintenance'],['calendar','calendar','التقويم','Calendar'],['documents','folder','المستندات','Documents']]],
  [['أدوات','Tools'],[['reports','chart','التقارير','Reports'],['verify','shield','التحقق من عقد','Verify a contract'],['support','help','المساعدة والدعم','Help & support']]]],
 tenant:[
  [null,[['overview','grid','نظرة عامة','Overview'],['contracts','file','عقدي','My contract'],['payments','card','المدفوعات','Payments'],['renewals','refresh','التجديد','Renewal'],['maintenance','wrench','الصيانة','Maintenance'],['calendar','calendar','التقويم','Calendar'],['documents','folder','المستندات','Documents']]],
  [['أدوات','Tools'],[['verify','shield','التحقق من عقد','Verify a contract'],['support','help','المساعدة والدعم','Help & support']]]],
 admin:[
  [null,[['overview','grid','لوحة المؤشرات','Dashboard'],['users','users','المستخدمون','Users'],['verification','shield','طلبات التوثيق','Verification'],['contracts','file','العقود','Contracts'],['properties','building','العقارات','Properties'],['payments','card','المدفوعات والرسوم','Payments & fees'],['tickets','msg','الدعم والنزاعات','Support & disputes']]],
  [['النظام','System'],[['integrations','plug','التكامل مع الجهات','Integrations'],['content','layers','المحتوى والقوالب','Content & templates'],['roles','lock','الأدوار والصلاحيات','Roles & permissions'],['reports','chart','التقارير','Reports'],['audit','list','سجل التدقيق','Audit log'],['settings','sliders','الإعدادات','Settings']]]]
};
const TITLE={notifications:['الإشعارات','Notifications'],profile:['حسابي','My account']};
const viewTitle=()=>{const all=NAV[S.role].flatMap(g=>g[1]);const it=all.find(i=>i[0]===S.view);return it?T(it[2],it[3]):TITLE[S.view]?T(...TITLE[S.view]):''};
const curUser=()=>userOf(S.uid);
const dispName=()=>S.dispName||(curUser()?L(curUser().name):'');

/* scoped data (server already scopes most of this; these just filter the hydrated cache) */
const myContracts=()=>S.role==='admin'?DB.contracts:DB.contracts.filter(c=>S.role==='landlord'?c.landlord===S.uid:c.tenant===S.uid);
const myProps=()=>S.role==='admin'?DB.props:DB.props.filter(p=>p.owner===S.uid);
const myUnits=()=>{const ids=myProps().map(p=>p.id);return DB.units.filter(u=>ids.includes(u.prop))};
const myPays=()=>{const ids=myContracts().map(c=>c.id);return DB.payments.filter(p=>ids.includes(p.c))};
const myMaint=()=>{if(S.role==='admin')return DB.maint;if(S.role==='tenant')return DB.maint.filter(m=>m.by===S.uid);const ids=myUnits().map(u=>u.id);return DB.maint.filter(m=>ids.includes(m.unit))};
const myNotifs=()=>DB.notifs.slice().sort((a,b)=>b.t-a.t); // already scoped to the signed-in user by the server
const unread=()=>myNotifs().filter(n=>!n.read).length;

function badgeFor(id){
  if(S.role==='landlord'){if(id==='payments')return myPays().filter(p=>p.status==='overdue').length;if(id==='maintenance')return myMaint().filter(m=>m.st==='new').length;if(id==='renewals')return renewalList().length}
  if(S.role==='tenant'){if(id==='payments')return myPays().filter(p=>['due','overdue'].includes(p.status)&&p.kind==='rent').length+myPays().filter(p=>p.kind==='fee'&&p.status!=='paid').length;if(id==='renewals')return renewalList().length}
  if(S.role==='admin'){if(id==='verification')return DB.verif.length;if(id==='contracts')return DB.contracts.filter(c=>c.status==='under_review').length;if(id==='tickets')return DB.tickets.filter(t=>t.st==='open').length}
  return 0;
}
function renewalList(){return myContracts().filter(c=>['active'].includes(c.status)&&days(end(c),TODAY)<=90&&days(end(c),TODAY)>=0)}

function Sidebar(){
  const groups=NAV[S.role].map(g=>`${g[0]?`<div class="grp">${T(...g[0])}</div>`:''}${g[1].map(i=>{const b=badgeFor(i[0]);return `<button class="ni ${S.view===i[0]?'on':''}" data-a="nav" data-v="${i[0]}" ${S.view===i[0]?'aria-current="page"':''}>${ic(i[1],19)}<span>${T(i[2],i[3])}</span>${b?`<span class="bd">${b}</span>`:''}</button>`}).join('')}`).join('');
  return `<aside class="side" aria-label="${T('القائمة الرئيسية','Main navigation')}">
   <div class="sb"><span>${logoImg(56)}</span><button class="btn ghost sm ico menu-b" data-a="navclose" aria-label="${T('إغلاق','Close')}">${ic('x',18)}</button></div>
   <nav>${groups}</nav>
   <div class="sf">
     <div class="me">${ava(dispName())}<div><b>${esc(dispName())}</b><small>${T(ROLES[S.role].ar,ROLES[S.role].en)}</small></div></div>
   </div></aside>`;
}
function Topbar(){
  const dark=isDark();const n=unread();
  return `<header class="top">
   <button class="btn ico menu-b" data-a="navopen" aria-label="${T('القائمة','Menu')}">${ic('menu',20)}</button>
   <button class="cmd" data-a="modal" data-t="cmd">${ic('search',17)}<span>${T('ابحث في العقود والعقارات والمستخدمين…','Search contracts, properties, people…')}</span><kbd>Ctrl K</kbd></button>
   <span class="sp"></span>
   <button class="btn ico" data-a="lang" title="${T('English','العربية')}" aria-label="${T('English','العربية')}"><span style="font-weight:600;font-size:13px">${T('EN','ع')}</span></button>
   <button class="btn ico" data-a="theme" aria-label="${T('تبديل المظهر','Toggle theme')}">${ic(dark?'sun':'moon',18)}</button>
   <div class="rel"><button class="btn ico" data-a="pop" data-v="notif" aria-label="${T('الإشعارات','Notifications')}" aria-expanded="${S.pop==='notif'}">${ic('bell',19)}${n?'<span class="dot"></span>':''}</button>${S.pop==='notif'?NotifPop():''}</div>
   <div class="rel"><button class="btn" style="padding:0 6px 0 12px;padding-inline:6px 12px" data-a="pop" data-v="me" aria-expanded="${S.pop==='me'}">${ava(dispName())}<span class="hide-m" style="font-weight:500">${esc(dispName().split(' ')[0]||'')}</span>${ic('down',15)}</button>${S.pop==='me'?MePop():''}</div>
  </header>`;
}
function NotifPop(){
  const l=myNotifs().slice(0,5);
  return `<div class="pop"><div class="ph2"><span>${T('الإشعارات','Notifications')}</span><button class="btn sm ghost" data-a="readall">${T('تعليم الكل كمقروء','Mark all read')}</button></div>
   ${l.map(n=>`<div class="li click ${n.read?'':'unread'}" data-a="notifgo" data-id="${n.id}"><span class="ii ${NTY[n.ty][1]}">${ic(NTY[n.ty][0],17)}</span><div class="tx"><div class="sm b">${T(n.ar,n.en)}</div><div class="xs mut3">${rel(n.t)}</div></div></div>`).join('')||empty(T('لا إشعارات','No notifications'),'','bell')}
   <button class="mi tc" style="justify-content:center;color:var(--teal);font-weight:500" data-a="nav" data-v="notifications">${T('عرض كل الإشعارات','View all notifications')}</button></div>`;
}
function MePop(){
  return `<div class="pop" style="width:260px"><div class="li"><div>${ava(dispName())}</div><div class="tx"><div class="b">${esc(dispName())}</div><div class="xs mut3">${T(ROLES[S.role].ar,ROLES[S.role].en)} · ${esc(curUser()?curUser().email:'')}</div></div></div>
   <button class="mi" data-a="nav" data-v="profile">${ic('user',17)}${T('حسابي وإعداداتي','My account & settings')}</button>
   <button class="mi" data-a="nav" data-v="notifications">${ic('bell',17)}${T('الإشعارات','Notifications')}</button>
   <button class="mi" data-a="home">${ic('home',17)}${T('الصفحة الرئيسية للموقع','Website home')}</button>
   <button class="mi" style="color:var(--bad)" data-a="logout">${ic('logout',17)}${T('تسجيل الخروج','Sign out')}</button></div>`;
}
function App(){
  return `<div class="app ${S.nav?'nav-open':''}">${Sidebar()}<div class="scrim" data-a="navclose"></div>
   <div class="main">${Topbar()}<main id="view" tabindex="-1">${View()}</main></div></div>`;
}
function View(){const f=V[S.view];return f?f():empty(T('الصفحة غير متوفرة','Page not available'))}
const DASH={landlord:['لوحة المؤجر','Landlord dashboard'],tenant:['لوحة المستأجر','Tenant dashboard'],admin:['لوحة الإدارة','Admin console']};
const pageHead=(t,s,actions)=>`<div class="ph"><div><div class="crumb"><b>${T(...DASH[S.role])}</b></div><h1>${t}</h1>${s?`<p>${s}</p>`:''}</div>${actions?`<div class="row wrapf">${actions}</div>`:''}</div>`;
const isDark=()=>S.theme==='dark'||(S.theme==='auto'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);

function render(){
  const y=window.scrollY;const a=document.activeElement;const id=a&&a.id&&$('#root').contains(a)?a.id:null;const pos=id&&a.selectionStart;
  const dEl=document.documentElement;dEl.lang=S.lang;dEl.dir=S.lang==='ar'?'rtl':'ltr';
  if(S.theme==='auto')delete dEl.dataset.theme;else dEl.dataset.theme=S.theme;
  $('#root').innerHTML=S.page==='landing'?Landing():App();
  document.title=S.page==='landing'?T('إيجاري — إدارة الإيجارات الذكية في البحرين','Ejari — Smart rental management in Bahrain'):`${viewTitle()} · ${T('إيجاري','Ejari')}`;
  renderModal();
  if(id){const e=document.getElementById(id);if(e){e.focus();try{e.setSelectionRange(pos,pos)}catch(_){}}}
  window.scrollTo(0,y);
}
function renderView(){
  const v=$('#view');if(!v)return render();
  const y=window.scrollY;const a=document.activeElement;const id=a&&a.id&&v.contains(a)?a.id:null;const pos=id&&a.selectionStart;
  v.innerHTML=View();
  if(id){const e=document.getElementById(id);if(e){e.focus();try{e.setSelectionRange(pos,pos)}catch(_){}}}
  window.scrollTo(0,y);
}
function go(view,opts){S.view=view;S.nav=false;S.pop=null;S.expanded=null;if(opts&&opts.q!=null)S.f.contracts.q=opts.q;render();window.scrollTo(0,0)}

/* ===== modals ===== */
function openModal(t,data){S.modal={t,d:data||{}};renderModal()}
function closeModal(){S.modal=null;renderModal()}
function renderModal(){
  const box=$('#modal');if(!box)return;
  if(!S.modal){box.innerHTML='';document.body.style.overflow='';return}
  const m=MOD[S.modal.t];if(!m){closeModal();return}
  const r=m(S.modal.d);
  box.innerHTML=`<div class="mdl ${r.sheet?'sheet':''}" data-bd="1"><div class="md ${r.cls||''}" role="dialog" aria-modal="true" aria-label="${esc(r.aria||r.title||'')}">${r.head===false?'':`<div class="mh"><h3>${r.title||''}</h3><button class="btn ghost sm ico" data-a="close" aria-label="${T('إغلاق','Close')}">${ic('x',18)}</button></div>`}<div class="mb">${r.body}</div>${r.foot?`<div class="mf">${r.foot}</div>`:''}</div></div>`;
  document.body.style.overflow='hidden';
  const p=POST[S.modal.t];if(p)p(S.modal.d);
  const f=box.querySelector('[data-focus]')||box.querySelector('input:not([type=hidden]),select,textarea');if(f&&!S.modal.noFocus&&window.innerWidth>720)f.focus();
}
function rerenderModal(){const b=$('#modal .md');const sc=b?b.scrollTop:0;renderModal();const n=$('#modal .md');if(n)n.scrollTop=sc}
const val=id=>{const e=document.getElementById(id);return e?e.value:''};
const chk=id=>{const e=document.getElementById(id);return !!(e&&e.checked)};

MOD.confirm=d=>({title:d.title,cls:'narrow',body:`<p class="mut">${d.text}</p>`,foot:`<button class="btn" data-a="close">${T('إلغاء','Cancel')}</button><button class="btn ${d.danger?'danger':'pri'}" data-a="${d.act}" data-id="${esc(d.id||'')}" data-v="${esc(d.v||'')}">${d.label||T('تأكيد','Confirm')}</button>`});

/* ===== generic actions ===== */
Object.assign(A,{
  nav:d=>go(d.v),
  navopen:()=>{S.nav=true;render()},navclose:()=>{S.nav=false;render()},
  lang:()=>{S.lang=S.lang==='ar'?'en':'ar';render()},
  theme:()=>{S.theme=isDark()?'light':'dark';render()},
  pop:d=>{S.pop=S.pop===d.v?null:d.v;render()},
  home:()=>{location.href='website.html'},
  logout:async()=>{try{await API.post('/api/auth/logout')}catch(e){} S.page='landing';S.role=null;S.uid=null;S.pop=null;S.dispName=null; if(location.pathname.endsWith('dashboard.html')||location.pathname.endsWith('app.html')){render()} else {location.href='website.html'} },
  close:()=>closeModal(),
  modal:d=>{S.pop=null;openModal(d.t,d)},
  readall:async()=>{await afterMutation(API.post('/api/notifications/read-all'))},
  notifgo:async d=>{const n=DB.notifs.find(x=>x.id===d.id);const map={pay:'payments',maint:'maintenance',renew:'renewals',contract:'contracts',sys:S.role==='admin'?'verification':'overview'};if(n&&!n.read)API.post(`/api/notifications/${d.id}/read`).catch(()=>{});go(map[n&&n.ty]||'overview')},
  tab:d=>{S.tab[d.k]=d.v;renderView()},
  seg:d=>{const [g,k]=d.k.split('.');S.f[g][k]=d.v;renderView()},
  scroll:d=>{const e=document.getElementById(d.id);S.lnav=false;if(e){render();document.getElementById(d.id).scrollIntoView({behavior:'smooth',block:'start'})}},
  toast:d=>toast(d.m),
  soon:()=>toast(T('هذه الميزة غير مفعّلة في هذه النسخة','This feature is not wired up in this build')),
  expand:d=>{S.expanded=S.expanded===d.id?null:d.id;renderView()},
});
CH.tog=(el)=>{toast(T('تم حفظ التغيير','Change saved'))};

/* smart assistant */
function intent(text){
  const t=String(text).toLowerCase();const area=Object.values(AREAS).find(a=>t.includes(a.ar)||t.includes(a.en.toLowerCase()));
  const has=(...w)=>w.some(x=>t.includes(x));const q=area?L(area):'';
  if(has('تجديد','جدد','renew'))return {view:'renewals',q};
  if(has('تحقق','verify','صحة عقد','authentic'))return {view:'verify'};
  if(has('عقد جديد','إنشاء عقد','انشاء عقد','أنشئ عقد','create a contract','new contract','new lease','create contract'))return S.role==='landlord'?{modal:'wizard'}:{view:'contracts'};
  if(has('صيانة','تسرب','تسرّب','تكييف','repair','maint','leak','a/c','broken'))return S.role==='tenant'?{modal:'maintnew'}:{view:'maintenance',q};
  if(has('دفع','سداد','متأخر','pay','overdue','rent'))return {view:'payments'};
  if(has('مستند','وثيق','إيصال','ايصال','document','receipt'))return S.role==='admin'?{view:'contracts'}:{view:'documents'};
  if(has('تقرير','إحصائ','report'))return {view:S.role==='tenant'?'overview':'reports'};
  if(has('مستخدم','user'))return S.role==='admin'?{view:'users'}:{view:'profile'};
  if(has('عقار','وحدة','property','unit','building'))return {view:S.role==='tenant'?'contracts':'properties',q};
  if(has('دعم','مساعدة','help','support','question','سؤال'))return {view:S.role==='admin'?'tickets':'support'};
  if(has('عقد','contract','lease'))return {view:'contracts',q};
  return {view:S.role==='admin'?'tickets':'support',miss:true};
}
function runIntent(i){
  if(i.modal){go('overview');openModal(i.modal,{});return}
  if(!NAV[S.role].flatMap(g=>g[1]).some(x=>x[0]===i.view)&&!['notifications','profile'].includes(i.view)){go('overview');return}
  go(i.view,{q:i.q||''});
  toast(i.miss?T('لم أفهم طلبك تماماً، هذه صفحة المساعدة','I did not fully get that — here is the help page'):T('فتحت لك: '+viewTitle(),'Opened: '+viewTitle()));
}
FORMS.ask=(f)=>{const t=val('askIn').trim();if(!t){toast(T('اكتب طلبك أولاً','Type your request first'),true);return}S.askText=t;const i=intent(t);
  if(S.page==='landing'){S.pending=i;openModal('login',{msg:T('سجّل الدخول لتنفيذ طلبك: «'+t+'»','Sign in to continue: “'+t+'”')});return}runIntent(i)};
A.chip=d=>{const e=document.getElementById('askIn');if(e){e.value=d.t;e.focus()}};

/* ===== command palette ===== */
MOD.cmd=()=>({title:T('بحث سريع','Quick search'),cls:'narrow',aria:T('بحث','Search'),body:`${inp('cmdIn','','search',`placeholder="${T('اكتب للبحث…','Type to search…')}" data-in="cmd" autocomplete="off" data-focus`)}<div id="cmdRes" style="margin-top:12px">${cmdResults('')}</div>`});
function cmdResults(q){
  q=q.trim().toLowerCase();const items=[];
  NAV[S.role].flatMap(g=>g[1]).forEach(i=>items.push({k:'view',id:i[0],ic:i[1],t:T(i[2],i[3]),s:T('صفحة','Page'),h:(i[2]+' '+i[3]).toLowerCase()}));
  myContracts().forEach(c=>{const u=unitOf(c.unit);if(!u)return;items.push({k:'contract',id:c.id,ic:'file',t:c.no,s:`${uname(c.tenant)} · ${unitLabel(u)}`,h:(c.no+' '+uname(c.tenant)+' '+L(propOf(u.prop).name)).toLowerCase()})});
  if(S.role!=='tenant')myProps().forEach(p=>items.push({k:'prop',id:p.id,ic:'building',t:L(p.name),s:L(AREAS[p.area]),h:(p.name.ar+' '+p.name.en+' '+p.deed).toLowerCase()}));
  if(S.role==='admin')DB.users.forEach(u=>items.push({k:'user',id:u.id,ic:'user',t:L(u.name),s:T(ROLES[u.role].ar,ROLES[u.role].en),h:(u.name.ar+' '+u.name.en+' '+(u.cpr||'')).toLowerCase()}));
  const r=(q?items.filter(i=>i.h.includes(q)||i.t.toLowerCase().includes(q)):items.filter(i=>i.k==='view')).slice(0,9);
  return r.length?r.map(i=>`<button class="mi btn ghost" style="width:100%;justify-content:flex-start;height:auto;padding:9px 10px;text-align:start" data-a="cmdgo" data-k="${i.k}" data-id="${esc(i.id)}"><span class="li" style="padding:0;border:0"><span class="ii teal">${ic(i.ic,17)}</span><span class="tx"><b class="sm">${esc(i.t)}</b><span class="xs mut3" style="display:block">${esc(i.s)}</span></span></span></button>`).join(''):empty(T('لا نتائج','No results'),'','search');
}
IN.cmd=v=>{$('#cmdRes').innerHTML=cmdResults(v)};
A.cmdgo=d=>{closeModal();if(d.k==='view')go(d.id);else if(d.k==='contract'){openModal('contract',{id:d.id})}else if(d.k==='prop'){go('properties');openModal('prop',{id:d.id})}else if(d.k==='user'){go('users');openModal('user',{id:d.id})}};

/* ===== notifications view ===== */
V.notifications=()=>{
  const f=S.f.notif.t;const all=myNotifs();const l=all.filter(n=>f==='all'||(f==='unread'&&!n.read));
  return pageHead(T('الإشعارات','Notifications'),T('تنبيهات حسابك ونشاط العقود والمدفوعات','Alerts about your account, contracts and payments'),btn(T('تعليم الكل كمقروء','Mark all read'),'readall','', '', 'check'))+
  `<div class="tb">${seg([['all',T('الكل','All'),all.length],['unread',T('غير المقروءة','Unread'),all.filter(n=>!n.read).length]],f,'seg','data-k="notif.t"')}</div>
  <div class="card">${l.map(n=>`<div class="li click ${n.read?'':'unread'}" data-a="notifgo" data-id="${n.id}"><span class="ii ${NTY[n.ty][1]}">${ic(NTY[n.ty][0],18)}</span><div class="tx"><div class="b">${T(n.ar,n.en)}</div><div class="sm mut">${L(n.sub)}</div></div><span class="xs mut3">${rel(n.t)}</span></div>`).join('')||empty(T('لا توجد إشعارات','No notifications'),T('ستظهر هنا التنبيهات الجديدة','New alerts will show up here'),'bell')}</div>`;
};

/* ===== verify (real, public API — works logged out too) ===== */
function verifyResultHtml(r){
  if(!r||r.network)return `<div class="verres bad">${ic('alert',26)}<div><b>${T('تعذّر الاتصال بالخادم','Could not reach the server')}</b></div></div>`;
  if(!r.found)return `<div class="verres bad">${ic('alert',26)}<div><b>${T('لم يتم العثور على العقد','Contract not found')}</b><div class="sm">${T('تأكد من كتابة الرقم بالشكل الصحيح، مثال: EJ-2026-00412.','Check the number format, for example EJ-2026-00412.')}</div></div></div>`;
  const bad=['terminated','disputed','expired','rejected'].includes(r.status);
  return `<div class="verres ${bad?'bad':'ok'}">${ic(bad?'alert':'shield',26)}<div style="flex:1"><b>${bad?T('العقد موجود لكنه غير سارٍ','Contract found but not in force'):T('عقد موثّق وساري','Verified and in force')}</b>
   <dl class="kv" style="margin-top:10px;color:var(--ink)"><dt>${T('رقم العقد','Contract no.')}</dt><dd class="num">${r.no}</dd><dt>${T('الحالة','Status')}</dt><dd>${CSTATUS(r.status)}</dd><dt>${T('العقار','Property')}</dt><dd>${L(r.property)} · ${L(AREAS[r.area]||{ar:r.area,en:r.area})}</dd><dt>${T('الوحدة','Unit')}</dt><dd>${L(UT[r.unit.type]||{ar:r.unit.type,en:r.unit.type})} ${r.unit.no}</dd><dt>${T('المدة','Term')}</dt><dd>${fd(new Date(r.start))} → ${fd(new Date(r.end))}</dd><dt>${T('التوقيع','Signatures')}</dt><dd>${r.signedBoth?T('مؤجر + مستأجر','Landlord + tenant'):T('غير مكتمل','Incomplete')}</dd></dl>
   <div class="xs" style="margin-top:8px;color:var(--ink3)">${T('لا تُعرض بيانات شخصية في التحقق العام.','No personal data is shown in public verification.')}</div></div>${qrSvg(r.no)}</div>`;
}
const ST={active:['فعّال','Active','ok'],expiring:['قارب على الانتهاء','Expiring soon','warn'],pending_sign:['بانتظار التوقيع','Awaiting signature','info'],pending_pay:['بانتظار دفع الرسوم','Awaiting fees','info'],under_review:['قيد المراجعة','Under review','gold'],draft:['مسودة','Draft',''],expired:['منتهٍ','Expired',''],terminated:['مفسوخ','Terminated','bad'],disputed:['متنازع عليه','Disputed','bad'],rejected:['مرفوض','Rejected','bad']};
const CSTATUS=s=>chip(T(ST[s][0],ST[s][1]),ST[s][2]);
const verifyBox=(no)=>`<div class="row wrapf"><div style="flex:1;min-width:220px">${inp('vno',no||'','text',`placeholder="EJ-2026-00412" autocomplete="off" dir="ltr" style="text-align:start" data-focus`)}</div><button class="btn pri" data-a="doverify">${ic('shield',17)}${T('تحقق','Verify')}</button></div><div class="hint">${T('جرّب: EJ-2026-00412 أو EJ-2026-00301 أو رقماً غير موجود','Try: EJ-2026-00412, EJ-2026-00301 or a number that does not exist')}</div><div id="vres" style="margin-top:16px">${no?`<div class="tc" style="padding:20px"><div class="spin"></div></div>`:''}</div>`;
async function runVerify(no){
  const box=$('#vres');if(box)box.innerHTML=`<div class="tc" style="padding:20px"><div class="spin"></div></div>`;
  let r; try{const res=await fetch('/api/verify/'+encodeURIComponent(no));r=res.status===404?{found:false}:await res.json()}catch(e){r={network:true}}
  if(box)box.innerHTML=verifyResultHtml(r);
}
A.doverify=()=>{const v=val('vno').trim();if(!v){toast(T('أدخل رقم العقد','Enter the contract number'),true);return}runVerify(v)};
MOD.verify=d=>({title:T('التحقق من عقد','Verify a contract'),body:verifyBox(d.no)});
V.verify=()=>pageHead(T('التحقق من عقد','Verify a contract'),T('تأكد من صحة أي عقد إيجار مسجّل في المنصة برقمه','Check that any lease registered on the platform is genuine using its number'))+`<div class="card" style="max-width:720px"><div class="cb">${verifyBox('')}</div></div>`;
POST.verify=d=>{if(d.no)runVerify(d.no)};

/* ===== documents ===== */
V.documents=()=>{
  const all=DB.docs.filter(d=>d.owner===S.uid);const f=S.f.docs.t;const l=all.filter(d=>f==='all'||d.type===f);
  const counts=t=>t==='all'?all.length:all.filter(d=>d.type===t).length;
  return pageHead(T('المستندات','Documents'),T('كل عقودك وإيصالاتك وسنداتك في مكان واحد','All your contracts, receipts and deeds in one place'),`<input type="file" id="fileIn" class="hide" data-ch="upload">${btn(T('رفع مستند','Upload document'),'pickfile','','pri','upload')}`)+
  `<div class="tb">${seg([['all',T('الكل','All'),counts('all')],...Object.keys(DT).map(k=>[k,L(DT[k]),counts(k)])],f,'seg','data-k="docs.t"')}</div>
  <div class="card">${l.map(d=>`<div class="li"><span class="ii ${d.type==='contract'?'teal':d.type==='receipt'?'ok':d.type==='deed'?'brand':''}">${ic(d.type==='receipt'?'receipt':d.type==='id'?'user':'file',18)}</span><div class="tx"><div class="b" style="word-break:break-word">${esc(d.name)}</div><div class="xs mut3">${L(DT[d.type])} · ${d.size} · ${fd(d.date)}</div></div>${d.dataUrl?`<a class="btn sm ico ghost" href="${d.dataUrl}" download="${esc(d.name)}" title="${T('تنزيل','Download')}">${ic('download',16)}</a>`:ibtn('download','soon','',T('تنزيل','Download'))}${ibtn('trash','modal',{t:'confirm',title:T('حذف المستند','Delete document'),text:T('هل تريد حذف هذا المستند؟ لا يمكن التراجع عن ذلك.','Delete this document? This cannot be undone.'),act:'deldoc',id:d.id,danger:1,label:T('حذف','Delete')},T('حذف','Delete'))}</div>`).join('')||empty(T('لا توجد مستندات','No documents'),T('ارفع أول مستند لك ليُحفظ بأمان.','Upload your first document to store it securely.'),'folder')}</div>`;
};
A.pickfile=()=>{const e=$('#fileIn');if(e)e.click()};
CH.upload=async el=>{
  const f=el.files&&el.files[0];if(!f)return;
  if(f.size>3*1024*1024){toast(T('الملف أكبر من 3 ميغابايت','File is larger than 3 MB'),true);return}
  const type=/id|هوية/i.test(f.name)?'id':/deed|سند/i.test(f.name)?'deed':/receipt|إيصال/i.test(f.name)?'receipt':'other';
  const dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(f)});
  try{await afterMutation(API.post('/api/documents',{name:f.name,type,sizeKb:Math.max(1,Math.round(f.size/1024)),dataUrl}));toast(T('تم رفع المستند','Document uploaded'))}
  catch(e){apiError(e,'تعذّر رفع المستند','Could not upload the document')}
};
A.deldoc=async d=>{try{await afterMutation(API.del('/api/documents/'+d.id));closeModal();toast(T('تم حذف المستند','Document deleted'))}catch(e){apiError(e,'تعذّر حذف المستند','Could not delete the document')}};

/* ===== support ===== */
V.support=()=>{
  const q=S.f.faq.q.toLowerCase();const l=DB.faq.filter(f=>f.pub&&(!q||(L(f.q)+L(f.a)).toLowerCase().includes(q)));
  const mine=DB.tickets?DB.tickets.filter(t=>t.from===S.uid):[];
  return pageHead(T('المساعدة والدعم','Help & support'),T('إجابات سريعة، أو تواصل مع فريق الدعم','Quick answers, or reach the support team'),btn(T('تذكرة دعم جديدة','New support ticket'),'modal',{t:'ticketnew'},'pri','plus'))+
  `<div class="g2" style="margin-top:0"><div><div class="tb">${searchBox('faqQ',S.f.faq.q,T('ابحث في الأسئلة الشائعة…','Search the FAQ…'),'faq')}</div>
   <div class="card">${l.map(f=>`<details class="fq" style="padding-inline:20px"><summary>${L(f.q)}${ic('down',18)}</summary><p>${L(f.a)}</p></details>`).join('')||empty(T('لا نتائج','No results'),T('جرّب كلمات أخرى أو افتح تذكرة دعم.','Try other words or open a support ticket.'),'search')}</div></div>
   <div class="col"><div class="card"><div class="ch"><h3>${T('تواصل معنا','Contact us')}</h3></div><div class="cb col">
     <div class="row">${ic('phone',18)}<span class="num" dir="ltr">+973 1753 7070</span></div><div class="row">${ic('phone',18)}<span class="num" dir="ltr">+973 1725 7070</span></div><div class="row">${ic('mail',18)}<span dir="ltr">info@ejari.bh</span></div><div class="xs mut3">${T('أوقات الدعم: الأحد – الخميس، 7:30 ص – 3:30 م','Support hours: Sun – Thu, 7:30 am – 3:30 pm')}</div></div></div>
    <div class="card"><div class="ch"><h3>${T('تذاكري','My tickets')}</h3></div>${mine.map(t=>`<div class="li"><span class="ii info">${ic('msg',17)}</span><div class="tx"><div class="sm b">${esc(t.subj)}</div><div class="xs mut3">${t.id} · ${rel(t.created)}</div></div>${TSTATUS(t.st)}</div>`).join('')||empty(T('لا توجد تذاكر','No tickets'),'','msg')}</div></div></div>`;
};
IN.faq=v=>{S.f.faq.q=v;renderView()};
const TSTATUS=s=>chip({open:T('مفتوحة','Open'),pending:T('بانتظار الرد','Pending'),resolved:T('محلولة','Resolved')}[s],{open:'warn',pending:'info',resolved:'ok'}[s]);
MOD.ticketnew=()=>({title:T('تذكرة دعم جديدة','New support ticket'),body:`<div class="fg">${field(T('التصنيف','Category'),sel('tkCat',Object.keys(TCAT).map(k=>[k,L(TCAT[k])]),'other'))}${field(T('الأولوية','Priority'),sel('tkPri',[['low',T('منخفضة','Low')],['normal',T('عادية','Normal')],['high',T('عاجلة','Urgent')]],'normal'))}${field(T('الموضوع','Subject'),inp('tkSub','', 'text','data-focus'),'full')}${field(T('التفاصيل','Details'),`<textarea class="ta" id="tkMsg"></textarea>`,'full')}</div>`,foot:`<button class="btn" data-a="close">${T('إلغاء','Cancel')}</button><button class="btn pri" data-a="ticketsave">${ic('send',16)}${T('إرسال','Send')}</button>`});
A.ticketsave=async()=>{const s=val('tkSub').trim(),m=val('tkMsg').trim();if(!s||!m){toast(T('أكمل الموضوع والتفاصيل','Fill in subject and details'),true);return}
  try{await afterMutation(API.post('/api/tickets',{subject:s,category:val('tkCat'),priority:val('tkPri'),message:m}));closeModal();toast(T('تم إرسال تذكرتك','Ticket sent'))}catch(e){apiError(e,'تعذّر إرسال التذكرة','Could not send the ticket')}};

/* ===== profile ===== */
V.profile=()=>{
  const u=curUser();if(!u)return '';
  return pageHead(T('حسابي','My account'),T('بياناتك الشخصية والأمان والتفضيلات','Your personal details, security and preferences'),btn(T('حفظ التغييرات','Save changes'),'saveprof','','pri','check'))+
  `<div class="g2" style="margin-top:0"><div class="col">
   <div class="card"><div class="cb"><div class="row wrapf" style="gap:16px">${ava(dispName(),'lg')}<div style="flex:1"><h3>${esc(dispName())}</h3><div class="mut sm">${T(ROLES[S.role].ar,ROLES[S.role].en)}</div></div>${u.verified?chip(T('هوية موثّقة','Identity verified'),'ok'):chip(T('بانتظار التوثيق','Pending verification'),'warn')}</div><hr class="hr">
    <div class="fg">${field(T('الاسم','Name'),inp('pfName',dispName()))}${field(T('الرقم الشخصي (CPR)','CPR number'),inp('pfCpr',u.cpr?'•••••• '+u.cpr.slice(-3):'—','text','readonly'))}${field(T('رقم الهاتف','Phone'),inp('pfPhone',u.phone||'','tel','dir="ltr" style="text-align:start"'))}${field(T('البريد الإلكتروني','Email'),inp('pfMail',u.email,'email','dir="ltr" style="text-align:start" readonly'),'','',)}</div></div></div>
   </div>
  <div class="col"><div class="card"><div class="ch"><h3>${T('الأمان','Security')}</h3></div><div class="cb col">
    <button class="btn" data-a="modal" data-t="pwd">${ic('key',16)}${T('تغيير كلمة المرور','Change password')}</button>
    <div class="xs mut3">${T('جلستك الحالية مؤمّنة بكوكي HttpOnly حقيقية صادرة من الخادم.','Your current session is secured by a real, server-issued HttpOnly cookie.')}</div></div></div>
   <div class="card"><div class="ch"><h3>${T('المظهر واللغة','Appearance & language')}</h3></div><div class="cb col"><div class="row"><span style="flex:1">${T('اللغة','Language')}</span>${seg([['ar','العربية'],['en','English']],S.lang,'setlang')}</div><div class="row"><span style="flex:1">${T('المظهر','Theme')}</span>${seg([['auto',T('تلقائي','Auto')],['light',T('فاتح','Light')],['dark',T('داكن','Dark')]],S.theme,'settheme')}</div></div></div></div></div>`;
};
A.setlang=d=>{S.lang=d.v;render()};A.settheme=d=>{S.theme=d.v;render()};
A.saveprof=()=>{const n=val('pfName').trim();if(n)S.dispName=n;render();toast(T('تم حفظ الاسم المعروض لهذه الجلسة','Display name updated for this session'))};
MOD.pwd=()=>({title:T('تغيير كلمة المرور','Change password'),cls:'narrow',body:`<div class="col">${field(T('كلمة المرور الجديدة','New password'),inp('pw1','','password','data-focus'),'','8+ '+T('أحرف','characters'))}${field(T('تأكيد كلمة المرور','Confirm password'),inp('pw2','','password'))}</div><div class="hint">${T('هذه الشاشة تجريبية ولا تُحدّث كلمة المرور فعلياً بعد.','This screen is a placeholder and does not update the password yet.')}</div>`,foot:`<button class="btn" data-a="close">${T('إلغاء','Cancel')}</button><button class="btn pri" data-a="pwdsave">${T('تحديث','Update')}</button>`});
A.pwdsave=()=>{const a=val('pw1');if(a.length<8){toast(T('كلمة المرور قصيرة جداً','Password is too short'),true);return}if(a!==val('pw2')){toast(T('كلمتا المرور غير متطابقتين','Passwords do not match'),true);return}closeModal();toast(T('تم استلام الطلب (شاشة تجريبية)','Request received (placeholder screen)'))};

/* export preview (client-side CSV built from the real hydrated data) */
MOD.export=d=>({title:T('معاينة التصدير','Export preview'),cls:'wide',body:`<p class="mut sm" style="margin-bottom:10px">${T('نص CSV مبني من بياناتك الحقيقية الحالية. انسخه أو احفظه كملف .csv.','CSV text built from your real, current data. Copy it or save it as a .csv file.')}</p><textarea class="ta" id="csvTx" readonly dir="ltr" style="min-height:260px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px">${esc(EXPORTS[d.kind]?EXPORTS[d.kind]():'')}</textarea>`,foot:`<button class="btn" data-a="close">${T('إغلاق','Close')}</button><button class="btn pri" data-a="copycsv">${ic('copy',16)}${T('نسخ','Copy')}</button>`});
const EXPORTS={
  contracts:()=>['no,tenant,unit,start,end,rent_bhd,status',...myContracts().map(c=>[c.no,L(userOf(c.tenant).name).replace(/,/g,' '),unitOf(c.unit).no,fd(c.start).replace(/,/g,''),fd(end(c)),c.rent,cst(c)].join(','))].join('\n'),
  payments:()=>['contract,due,amount_bhd,status,receipt',...myPays().map(p=>[ctOf(p.c).no,fd(p.due),p.amount,p.status,p.receipt||''].join(','))].join('\n'),
  users:()=>['id,name,role,status,verified',...DB.users.map(u=>[u.id,u.name.en,u.role,u.status,u.verified].join(','))].join('\n'),
  audit:()=>['time,user,action,entity',...DB.audit.map(a=>[fdt(a.t),uname(a.u),a.en,a.ent].join(','))].join('\n'),
  income:()=>['month,collected_bhd,expected_bhd',...incomeSeries(12).map(m=>[m.l,m.paid,m.exp].join(','))].join('\n'),
};
A.copycsv=()=>{const t=$('#csvTx');if(!t)return;t.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}try{if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(()=>{},()=>{})}catch(_){}toast(ok?T('تم النسخ','Copied'):T('حدّد النص وانسخه يدوياً','Select the text and copy it manually'))};
