/* ===== bootstrap ===== */
document.addEventListener('click',e=>{
  const t=e.target;
  const bd=t.closest&&t.closest('[data-bd]');if(bd&&t===bd){closeModal();return}
  const el=t.closest&&t.closest('[data-a]');
  if(!el){if(S.pop&&!t.closest('.pop')){S.pop=null;render()}return}
  const a=el.dataset.a;
  if(S.pop&&a!=='pop'&&!el.closest('.pop')){S.pop=null}
  if(A[a])A[a](el.dataset,el,e);
});
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.in;if(k&&IN[k])IN[k](e.target.value,e.target)});
document.addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.ch;if(k&&CH[k])CH[k](e.target)});
document.addEventListener('submit',e=>{const f=e.target.closest&&e.target.closest('form[data-form]');if(f){e.preventDefault();const h=FORMS[f.dataset.form];if(h)h(f)}});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(S.modal)closeModal();else if(S.pop){S.pop=null;render()}else if(S.nav){S.nav=false;render()}return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&S.page==='app'){e.preventDefault();openModal('cmd',{});return}
  if(e.key==='Enter'){const id=e.target.id;if(id==='vno'){e.preventDefault();A.doverify()}else if(id==='cmdIn'){e.preventDefault();const b=document.querySelector('#cmdRes [data-a=cmdgo]');if(b)b.click()}}
});
// Each entry point's boot-*.js performs the initial session check / fetch, then calls render() itself.
