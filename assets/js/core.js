'use strict';
/* ===== state ===== */
let onAuthed=async()=>{}; // overridden per entry point (website/dashboard/app) once auth.js + the boot script load
const S={lang:'ar',theme:'auto',page:'landing',role:null,uid:null,dispName:null,view:'overview',nav:false,pop:null,modal:null,demo:null,
  f:{contracts:{q:'',st:'all'},payments:{q:'',st:'all'},users:{q:'',role:'all',st:'all'},maint:{q:''},docs:{t:'all'},notif:{t:'all'},faq:{q:''},audit:{q:''},props:{q:''},tickets:{st:'all'},ledger:{q:''},req:{q:'',st:'all'},svc:{q:''},content:{q:''}},
  tab:{},cal:null,svc:0,pending:null,lnav:false,expanded:null,pg:{}};
/* Demo sign-in is enabled only when the server reports it via /api/config. In production it is
   false, so no demo UI is ever rendered and no demo endpoint is offered. */
const demoOn=()=>S.demo===true;
const $=(s,r)=> (r||document).querySelector(s);
const T=(ar,en)=>S.lang==='ar'?ar:en;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Pick the active-language string. Returns ESCAPED text: every value that reaches the DOM
   goes through this helper, so user-controlled names/titles/notes cannot inject markup.
   Callers that need the raw value (logic, comparisons) must use rawL() instead. */
const rawL=o=>o==null?'':typeof o==='string'?o:(o[S.lang]||o.ar);
const L=o=>esc(rawL(o));
const fmt=n=>Number(n).toLocaleString('en-US');
const cur=()=>T('د.ب','BD');
const money=n=>S.lang==='ar'?`${fmt(n)} د.ب`:`BD ${fmt(n)}`;
const MAR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const MEN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MENF=['January','February','March','April','May','June','July','August','September','October','November','December'];
const mon=(m,full)=>S.lang==='ar'?MAR[m]:(full?MENF[m]:MEN[m]);
const fd=d=>d?`${d.getDate()} ${mon(d.getMonth())} ${d.getFullYear()}`:'—';
const fdt=d=>d?`${fd(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'—';
const initials=n=>{const p=String(n).trim().split(/\s+/);return (p[0]||'').charAt(0)+(p[1]?p[1].charAt(0):'')};
const pct=(a,b)=>b?Math.round(a/b*100):0;

/* ===== icons ===== */
const IC={
grid:'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
building:'M4 21V5l8-3v19M20 21V9l-8-2M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M3 21h18',
file:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
card:'M3 6h18v12H3zM3 10h18M7 15h3',
refresh:'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
wrench:'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5L16 9.5',
help:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01',
bell:'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
users:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
sliders:'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
plus:'M12 5v14M5 12h14',check:'M5 12l5 5L20 7',x:'M6 6l12 12M18 6L6 18',menu:'M4 6h16M4 12h16M4 18h16',
down:'M6 9l6 6 6-6',left:'M15 6l-6 6 6 6',right:'M9 6l6 6-6 6',
sun:'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
moon:'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
globe:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
upload:'M12 16V4M7 9l5-5 5 5M4 20h16',download:'M12 4v12M7 11l5 5 5-5M4 20h16',
edit:'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
calendar:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
alert:'M12 3l10 18H2zM12 10v5M12 18h.01',info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
logout:'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',key:'M21 2l-2 2M11.4 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM11.4 11.6L15.5 7.5M15.5 7.5l3 3L22 7l-3-3',
eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
mail:'M3 6h18v12H3zM3 7l9 7 9-7',phone:'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
sparkle:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
filter:'M3 5h18l-7 8v6l-4-2v-4z',qr:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2M18 18h2v2',
pin:'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
plug:'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',lock:'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',star:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
send:'M22 2L11 13M22 2l-7 20-4-9-9-4z',pen:'M3 21l3-1 13-13-2-2L4 18zM14 6l4 4',home:'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
tag:'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',coins:'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
receipt:'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',msg:'M4 5h16v11H9l-5 4z',copy:'M9 9h11v11H9zM5 15V4h11',
apple:'M12 7c1.5-2 3-2 4-2 0 2-1 3.5-3 4 2 0 4 1.5 4 4.5 0 3.5-2.500 6.500-4.500 6.500-1 0-1.500-.5-2.500-.5s-1.500.5-2.500.5C6.500 20 4 16 4 12.500 4 9 6 7.500 8 7.500c1.500 0 2.500 1 4 1',
play:'M6 4l14 8-14 8z',trend:'M3 17l6-6 4 4 8-8M15 7h6v6',history:'M3 12a9 9 0 1 0 3-6.700L3 8M3 3v5h5M12 7v5l3 2',
zap:'M13 2L4 14h7l-1 8 9-12h-7z',layers:'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
};
const ic=(n,s=18)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[n]||IC.info}"/></svg>`;

/* ===== ui primitives ===== */
const chip=(t,k)=>`<span class="chip ${k||''}">${esc(t)}</span>`;
const ava=(n,cls)=>`<span class="av ${cls||''}">${esc(initials(n))}</span>`;
const empty=(t,d,i)=>`<div class="empty">${ic(i||'folder',34)}<b>${t}</b>${d?`<div>${d}</div>`:''}</div>`;
const btn=(label,a,data,cls,icon)=>`<button class="btn ${cls||''}" data-a="${a}" ${Object.entries(data||{}).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${icon?ic(icon,cls&&cls.includes('sm')?15:17):''}${label}</button>`;
const ibtn=(icon,a,data,label)=>`<button class="btn sm ico ghost" title="${esc(label||'')}" aria-label="${esc(label||'')}" data-a="${a}" ${Object.entries(data||{}).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${ic(icon,16)}</button>`;
const sw=(on,key,extra)=>`<label class="sw"><input type="checkbox" ${on?'checked':''} data-ch="${key}" ${extra||''}><i></i></label>`;
const seg=(opts,cur,act,extra)=>`<div class="seg" role="tablist">${opts.map(o=>`<button class="${o[0]===cur?'on':''}" data-a="${act}" data-v="${o[0]}" ${extra||''}>${o[1]}${o[2]!=null?`<span class="n">${o[2]}</span>`:''}</button>`).join('')}</div>`;
const tabs=(opts,cur,key)=>`<div class="tabs">${opts.map(o=>`<button class="${o[0]===cur?'on':''}" data-a="tab" data-k="${key}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
const searchBox=(id,val,ph,inKey)=>`<div class="sr">${ic('search',16)}<input class="in" id="${id}" type="search" value="${esc(val)}" placeholder="${esc(ph)}" data-in="${inKey}" autocomplete="off"></div>`;
const field=(label,inner,cls,hint)=>`<div class="fld ${cls||''}"><label class="lb">${label}</label>${inner}${hint?`<div class="hint">${hint}</div>`:''}</div>`;
const sel=(id,opts,val,extra)=>`<select class="sel" id="${id}" ${extra||''}>${opts.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(val)?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`;
const inp=(id,val,type,extra)=>`<input class="in" id="${id}" type="${type||'text'}" value="${esc(val==null?'':val)}" ${extra||''}>`;
function table(cols,rows,emptyHtml){
  if(!rows.length) return `<div class="card">${emptyHtml||empty(T('لا توجد نتائج','No results'),T('جرّب تغيير الفلاتر أو البحث','Try changing the filters or search'),'search')}</div>`;
  return `<div class="tw"><table class="rt"><thead><tr>${cols.map(c=>`<th class="${c.c||''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr ${r._a?`class="click" data-a="${r._a}" data-id="${esc(r.id)}"`:''}>${cols.map(c=>`<td data-label="${esc(c.h)}" class="${c.c||''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function toast(msg,err,action){
  let box=$('#toasts'); if(!box) return;
  const el=document.createElement('div'); el.className='toast'+(err?' err':'');
  el.innerHTML=`${ic(err?'alert':'check',18)}<span>${esc(msg)}</span>${action?`<button class="btn sm ghost" data-a="${esc(action.a)}" data-id="${esc(action.id||'')}">${esc(action.label)}</button>`:''}`; box.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity .25s';setTimeout(()=>el.remove(),260)},action?5200:2800);
}
/* skeleton placeholders shown while a view's data is being (re)loaded */
const skeleton=(rows=3)=>`<div class="card sk"><div class="cb col">${Array.from({length:rows}).map(()=>`<div class="sk-row"><span class="sk-b sk-av"></span><span class="sk-b sk-l"></span><span class="sk-b sk-s"></span></div>`).join('')}</div></div>`;
/* client-side pagination: returns the slice for the current page plus the pager markup */
const PAGE_SIZE=8;
function paginate(items,key){
  const total=items.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  const p=Math.min(Math.max(1,S.pg[key]||1),pages);
  return {slice:items.slice((p-1)*PAGE_SIZE,p*PAGE_SIZE),pager:pages>1?`<div class="pager"><span class="xs mut3">${T(`${total} عنصر`,`${total} items`)}</span><span class="sp"></span>${Array.from({length:pages}).map((_,i)=>`<button class="btn sm ${i+1===p?'pri':'ghost'}" data-a="page" data-k="${key}" data-v="${i+1}">${i+1}</button>`).join('')}</div>`:''};
}
/* server-driven permission check for the signed-in admin sub-role (mirrors the backend) */
const can=(perm)=>{if(!DB.perm||!DB.roles)return false;const u=curUser&&curUser();if(!u||u.role!=='admin')return false;const sub=u.sub||'super';if(sub==='super')return true;return !!(DB.perm[sub]&&DB.perm[sub][perm]);};
/* trigger a real file download from an authenticated endpoint */
function download(path){const a=document.createElement('a');a.href=path;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();}

/* ===== charts (inline svg) ===== */
function niceMax(v){if(v<=0)return 4;const raw=v/4;const p=Math.pow(10,Math.floor(Math.log10(raw)));const n=raw/p;const st=(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;return st*4}
const kfmt=v=>v>=1000?(v/1000).toFixed(v%1000?1:0).replace('.0','')+'k':String(v);
function barChart(labels,sets,colors,opt){
  opt=opt||{};const W=640,H=opt.h||250,pl=42,pb=28,pt=12,pr=6;
  const mx=niceMax(Math.max(1,...sets.flat()));const iw=W-pl-pr,ih=H-pt-pb,gw=iw/labels.length;
  const bw=Math.min(30,(gw*.72)/sets.length);let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label||'chart')}">`;
  for(let i=0;i<=4;i++){const y=pt+ih-ih*i/4;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--line2)"/><text x="${pl-8}" y="${y+4}" text-anchor="end">${kfmt(Math.round(mx*i/4))}</text>`}
  labels.forEach((l,i)=>{const cx=pl+gw*i+gw/2;const tw=bw*sets.length+3*(sets.length-1);
    sets.forEach((set,k)=>{const h=ih*set[i]/mx;const x=cx-tw/2+k*(bw+3);s+=`<rect x="${x}" y="${pt+ih-h}" width="${bw}" height="${Math.max(h,0)}" rx="4" fill="${colors[k]}"><title>${esc(l)}: ${fmt(set[i])}</title></rect>`});
    s+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`});
  return s+'</svg>';
}
function lineChart(labels,sets,colors,opt){
  opt=opt||{};const W=640,H=opt.h||240,pl=42,pb=28,pt=12,pr=10;
  const mx=niceMax(Math.max(1,...sets.flat()));const iw=W-pl-pr,ih=H-pt-pb;const X=i=>pl+iw*i/Math.max(1,labels.length-1),Y=v=>pt+ih-ih*v/mx;
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label||'chart')}">`;
  for(let i=0;i<=4;i++){const y=pt+ih-ih*i/4;s+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--line2)"/><text x="${pl-8}" y="${y+4}" text-anchor="end">${kfmt(Math.round(mx*i/4))}</text>`}
  sets.forEach((set,k)=>{const d=set.map((v,i)=>`${i?'L':'M'}${X(i)},${Y(v)}`).join('');
    if(k===0)s+=`<path d="${d}L${X(set.length-1)},${pt+ih}L${X(0)},${pt+ih}Z" fill="${colors[k]}" opacity=".12"/>`;
    s+=`<path d="${d}" fill="none" stroke="${colors[k]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    set.forEach((v,i)=>{s+=`<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="var(--sf)" stroke="${colors[k]}" stroke-width="2"><title>${esc(labels[i])}: ${fmt(v)}</title></circle>`})});
  labels.forEach((l,i)=>{s+=`<text x="${X(i)}" y="${H-8}" text-anchor="middle">${esc(l)}</text>`});
  return s+'</svg>';
}
function donut(parts,centerTop,centerSub){
  const tot=parts.reduce((a,p)=>a+p.v,0)||1,R=52,C=2*Math.PI*R;let off=0,s=`<svg viewBox="0 0 140 140" width="150" height="150" style="direction:ltr" role="img"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--line2)" stroke-width="16"/>`;
  parts.forEach(p=>{const len=C*p.v/tot;s+=`<circle cx="70" cy="70" r="${R}" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(p.l)}: ${p.v}</title></circle>`;off+=len});
  s+=`<text x="70" y="70" text-anchor="middle" style="font-size:22px;font-weight:600;fill:var(--ink)">${centerTop}</text><text x="70" y="88" text-anchor="middle" style="font-size:11px">${centerSub||''}</text></svg>`;return s;
}
function hbars(items,color){const mx=Math.max(1,...items.map(i=>i.v));return items.map(i=>`<div class="hb"><span class="mut">${esc(i.l)}</span><div class="pg"><i style="width:${i.v/mx*100}%;${color?`background:${color}`:''}"></i></div><b class="num">${i.t!=null?i.t:fmt(i.v)}</b></div>`).join('')}
/* ===== real QR encoder (byte mode, versions 1..3, EC level L, mask 0) ===== */
const _QREXP=new Uint8Array(512),_QRLOG=new Uint8Array(256);
(function(){let x=1;for(let i=0;i<255;i++){_QREXP[i]=x;_QRLOG[x]=i;x<<=1;if(x&0x100)x^=0x11d}for(let i=255;i<512;i++)_QREXP[i]=_QREXP[i-255]})();
const _qmul=(a,b)=>(a===0||b===0?0:_QREXP[_QRLOG[a]+_QRLOG[b]]);
function _qrGen(deg){let p=[1];for(let i=0;i<deg;i++){const n=new Array(p.length+1).fill(0);for(let j=0;j<p.length;j++){n[j]^=p[j];n[j+1]=_qmul(p[j],_QREXP[i])}p=n}return p}
function _qrEC(data,len){const g=_qrGen(len),r=new Array(len).fill(0);for(const b of data){const f=b^r[0];r.shift();r.push(0);for(let i=0;i<len;i++)r[i]^=_qmul(g[i+1],f)}return r}
const _QRSZ={1:[26,19],2:[44,34],3:[70,55]},_QRALIGN={1:[],2:[6,18],3:[6,22]};
function qrMatrix(text){
  const bytes=[];for(const ch of unescape(encodeURIComponent(String(text))))bytes.push(ch.charCodeAt(0));
  let ver=0;for(const v of [1,2,3])if(bytes.length<=_QRSZ[v][1]-2){ver=v;break}
  if(!ver)throw new Error('qr_too_long');
  const [total,dataCw]=_QRSZ[ver];
  const bits=[];const push=(v,l)=>{for(let i=l-1;i>=0;i--)bits.push((v>>i)&1)};
  push(0b0100,4);push(bytes.length,8);for(const b of bytes)push(b,8);
  for(let i=0;i<4&&bits.length<dataCw*8;i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const cw=[];for(let i=0;i<bits.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bits[i+j];cw.push(v)}
  for(let i=0;cw.length<dataCw;i++)cw.push([0xEC,0x11][i%2]);
  const msg=cw.concat(_qrEC(cw,total-dataCw));
  const size=ver*4+17;
  const m=Array.from({length:size},()=>new Array(size).fill(false));
  const res=Array.from({length:size},()=>new Array(size).fill(false));
  const set=(r,c,v)=>{if(r>=0&&c>=0&&r<size&&c<size){m[r][c]=v;res[r][c]=true}};
  const finder=(r0,c0)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=r0+r,cc=c0+c;if(rr<0||cc<0||rr>=size||cc>=size)continue;const on=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4);set(rr,cc,on)}};
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
  for(const r of _QRALIGN[ver])for(const c of _QRALIGN[ver]){if((r<=8&&c<=8)||(r<=8&&c>=size-9)||(r>=size-9&&c<=8))continue;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)set(r+dr,c+dc,Math.max(Math.abs(dr),Math.abs(dc))!==1)}
  set(size-8,8,true);
  for(let i=0;i<9;i++){res[8][i]=true;res[i][8]=true}
  for(let i=0;i<8;i++){res[8][size-1-i]=true;res[size-1-i][8]=true}
  const dbits=[];for(const w of msg)for(let i=7;i>=0;i--)dbits.push((w>>i)&1);
  let dir=-1,row=size-1,bi=0;
  for(let col=size-1;col>0;col-=2){const c0=col<=6?col-1:col;
    for(let i=0;i<size;i++){const r=dir===-1?row-i:row+i;
      for(const c of [c0,c0-1]){if(res[r][c])continue;let bit=bi<dbits.length?dbits[bi++]:0;if((r+c)%2===0)bit^=1;m[r][c]=bit===1}}
    dir=-dir;row=dir===-1?size-1:0}
  const fmtData=(0b01<<3)|0;let rem=fmtData<<10;
  for(let i=14;i>=10;i--)if((rem>>i)&1)rem^=0b10100110111<<(i-10);
  const fmt=((fmtData<<10)|rem)^0b101010000010010;const fb=i=>((fmt>>i)&1)===1;
  for(let i=0;i<15;i++){
    if(i<6)m[i][8]=fb(i);else if(i<8)m[i+1][8]=fb(i);else m[size-15+i][8]=fb(i);
    if(i<8)m[8][size-i-1]=fb(i);else if(i<9)m[8][15-i]=fb(i);else m[8][15-i-1]=fb(i)}
  m[size-8][8]=true;
  return m;
}
function qrSvg(seed){
  let m;try{m=qrMatrix(seed)}catch(e){return `<div class="qr qr-fallback" aria-label="${T('رمز التحقق','Verification code')}"><span class="xs mut3">${esc(String(seed))}</span></div>`}
  const n=m.length;let d='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m[r][c])d+=`M${c} ${r}h1v1h-1z`;
  return `<div class="qr"><svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${T('رمز QR للتحقق','QR code for verification')}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg></div>`;
}
const logoImg=(h,mode)=>{const st=h?` style="height:${h}px"`:'';const alt=T('إيجاري','Ejari');
  if(mode==='dark')return `<img class="brandlogo lg-only-d"${st} src="${LOGO_D}" alt="${alt}">`;
  return `<img class="brandlogo lg-l"${st} src="${LOGO_L}" alt="${alt}"><img class="brandlogo lg-d"${st} src="${LOGO_D}" alt="" aria-hidden="true">`};
