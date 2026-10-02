/* ===== standalone DASHBOARD build: real session on load, or the sign-in screen ===== */
(function(){
  onAuthed=async()=>{
    const boot=await API.get('/api/bootstrap');
    hydrate(boot);
    S.role=boot.me.role;S.uid=boot.me.id;S.page='app';S.view='overview';S.pop=null;S.nav=false;S.modal=null;
    closeModal();render();window.scrollTo(0,0);
  };
  A.home=()=>{location.href='website.html'};
  (async()=>{
    try{const cfg=await API.get('/api/config');S.demo=!!cfg.demo}catch(e){S.demo=false}
    try{
      const me=await API.get('/api/auth/me');
      if(me.user){await onAuthed();return}
    }catch(e){}
    render(); // show the sign-in screen (Landing(), defined in dashboard-login.js)
  })();
})();
