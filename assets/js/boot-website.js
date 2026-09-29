/* ===== standalone WEBSITE build ===== */
(function(){
  onAuthed=async()=>{location.href='dashboard.html'};
  A.openapp=()=>{location.href='app.html'};
  API.get('/api/faq').then(faq=>{DB.faq=faq;if(S.page==='landing')render()}).catch(()=>{});
  render();
})();
