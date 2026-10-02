/* ===== standalone WEBSITE build ===== */
(function(){
  onAuthed=async()=>{location.href='dashboard.html'};
  A.openapp=()=>{location.href='app.html'};
  API.get('/api/config').then(cfg=>{S.demo=!!cfg.demo;if(S.page==='landing')render()}).catch(()=>{S.demo=false});
  API.get('/api/faq').then(faq=>{DB.faq=faq;if(S.page==='landing')render()}).catch(()=>{});
  API.get('/api/stats').then(st=>{DB.stats=st;if(S.page==='landing')render()}).catch(()=>{});
  render();
})();
