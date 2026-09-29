/* ===== MOBILE APP build: tenant & landlord only ===== */
(function(){
  try{if(window.top!==window.self)document.documentElement.classList.add('framed')}catch(e){document.documentElement.classList.add('framed')}
  onAuthed=async()=>{
    const boot=await API.get('/api/bootstrap');
    if(boot.me.role==='admin'){toast(T('هذا التطبيق للمؤجر والمستأجر فقط','This app is for landlords and tenants only'),true);return}
    hydrate(boot);
    S.role=boot.me.role;S.uid=boot.me.id;S.page='app';S.view='overview';S.modal=null;
    closeModal();render();window.scrollTo(0,0);
  };
  (async()=>{
    try{
      const me=await API.get('/api/auth/me');
      if(me.user&&me.user.role!=='admin'){await onAuthed();return}
    }catch(e){}
    render(); // splash / sign-in (Landing(), defined in mobile.js)
  })();
})();
