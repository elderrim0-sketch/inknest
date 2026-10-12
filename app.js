/* InkNest — offline-first notebook studio. No trackers, servers, or dependencies. */
'use strict';
const $ = id => document.getElementById(id);
const PAGE_W = 960, PAGE_H = 1248, DB_NAME = 'inknest-notes-v1';
const state = {
  notebooks: [], activeId: null, activePageId: null, recentOnly: false, tool: 'pen',
  ink: '#25344e', width: 3, zoom: 55, zoomManual: false, cover: 'blue',
  editingId: null, selectedText: null, textPoint: null, menuId: null,
  undo: new Map(), redo: new Map(), drawing: null, activePointer: null,
  lastPenAt: 0, selectedPenOnly: false
};
const canvas = $('drawCanvas'), ctx = canvas.getContext('2d', { alpha: false });
const imageCache = new Map();
let db = null, saveTimer = null, toastTimer = null, saving = Promise.resolve(), contextActions = [];
const uid = () => (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));
const pageTemplate = () => ({id:uid(), paper:'#fffefa', pattern:'grid', strokes:[], texts:[], images:[]});
const notebookTemplate = (title, subject, color, emoji) => ({id:uid(), title, subject, cover:color, emoji, updatedAt:Date.now(), pages:[pageTemplate()]});
const notebook = () => state.notebooks.find(x => x.id === state.activeId);
const page = () => notebook()?.pages.find(x=>x.id===state.activePageId);
const esc = s=>String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg><use href="#i-${name}"/></svg>`;
const deep = val => JSON.parse(JSON.stringify(val));
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2700);}

function openDB() {
  return new Promise(resolve=>{
    try {
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>req.result.createObjectStore('state');
      req.onsuccess=()=>{db=req.result;resolve();};
      req.onerror=()=>resolve();
    }catch(_){resolve();}
  });
}
function dbRead(){
  return new Promise(resolve=>{
    if(!db){try{return resolve(JSON.parse(localStorage.getItem(DB_NAME)||'null'));}catch(_){return resolve(null);}}
    try {
      const tx=db.transaction('state','readonly');
      const r=tx.objectStore('state').get('workspace');
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null);
    }catch(_){resolve(null);}
  });
}
function dbWrite(data){
  return new Promise((resolve,reject)=>{
    if(!db){try{localStorage.setItem(DB_NAME,JSON.stringify(data));resolve();}catch(e){reject(e);}return;}
    try{
      const tx=db.transaction('state','readwrite');
      tx.objectStore('state').put(data,'workspace');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    }catch(e){reject(e);}
  });
}
function touch(){const n=notebook();if(n)n.updatedAt=Date.now();queueSave();}
function queueSave(){
  $('saveStatus').innerHTML='<span class="save-dot"></span> Saving…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveNow,350);
}
function saveNow(){
  clearTimeout(saveTimer);
  const data={version:1,notebooks:deep(state.notebooks),activeId:state.activeId};
  saving=saving.catch(()=>{}).then(()=>dbWrite(data)).then(()=>{
    $('saveStatus').innerHTML='<span class="save-dot"></span> Saved on device';
  }).catch(err=>{console.error('Save failed',err);$('saveStatus').textContent='⚠ Save failed';toast('Storage is full or blocked. Export a backup now.');});
  return saving;
}
function currentPageIndex(){return notebook()?.pages.findIndex(p=>p.id===state.activePageId)??-1;}
function pageUndoBucket(){return state.undo.get(state.activePageId)||[];}
function checkpoint(){
  const p=page();if(!p)return;
  const stack=pageUndoBucket();
  stack.push(deep({strokes:p.strokes,texts:p.texts,images:p.images,paper:p.paper,pattern:p.pattern}));
  if(stack.length>35)stack.shift();
  state.undo.set(p.id,stack);state.redo.set(p.id,[]);updateUndoButtons();
}
function snapshot(p){return deep({strokes:p.strokes,texts:p.texts,images:p.images,paper:p.paper,pattern:p.pattern});}
function restore(p,s){Object.assign(p,s);renderPaperUI();renderCanvas();renderThumbnails();touch();}
function undo(){
  const p=page(), arr=pageUndoBucket();if(!p||!arr.length)return;
  const r=state.redo.get(p.id)||[];r.push(snapshot(p));state.redo.set(p.id,r);
  restore(p,arr.pop());updateUndoButtons();
}
function redo(){
  const p=page(),r=state.redo.get(state.activePageId)||[];if(!p||!r.length)return;
  const a=pageUndoBucket();a.push(snapshot(p));state.undo.set(p.id,a);
  restore(p,r.pop());updateUndoButtons();
}
function updateUndoButtons(){$('undoBtn').disabled=!pageUndoBucket().length;$('redoBtn').disabled=!(state.redo.get(state.activePageId)||[]).length;}

function showLibrary(){
  state.activeId=null;state.activePageId=null;
  $('editor').classList.add('hidden');$('library').classList.remove('hidden');
  $('backLibrary').classList.add('hidden');$('breadcrumb').innerHTML='<span class="crumb-label">My library</span><span class="crumb-chevron"> / </span><strong>Notebooks</strong>';
  $('sidebar').classList.remove('open');$('pageDrawer').classList.add('hidden');$('paperPopover').classList.add('hidden');
  renderLibrary();saveNow();
}
function openNotebook(id, pageId){
  const n=state.notebooks.find(n=>n.id===id);if(!n)return;
  state.activeId=id;state.activePageId=pageId && n.pages.some(p=>p.id===pageId) ? pageId : n.pages[0].id;
  n.updatedAt=Date.now();
  $('library').classList.add('hidden');$('editor').classList.remove('hidden');$('backLibrary').classList.remove('hidden');
  $('sidebar').classList.remove('open');$('paperPopover').classList.add('hidden');$('pageDrawer').classList.add('hidden');
  $('breadcrumb').innerHTML='<span class="crumb-label">My library</span><span class="crumb-chevron"> / </span><strong>'+esc(n.title)+'</strong>';
  state.zoomManual=false;
  updateEditor();requestAnimationFrame(()=>{fitPage();renderCanvas();});queueSave();
}
function relativeTime(ts){
  const d=Date.now()-ts;if(d<60000)return 'Just now';if(d<3600000)return Math.floor(d/60000)+' min ago';
  if(d<86400000)return Math.floor(d/3600000)+' hr ago';if(d<604800000)return Math.floor(d/86400000)+' days ago';
  return new Date(ts).toLocaleDateString(undefined,{day:'numeric',month:'short'});
}
function renderLibrary(){
  const list=$('notebookGrid');list.textContent='';
  $('sideCount').textContent=state.notebooks.length;$('notebookCount').textContent=state.notebooks.length;
  $('libraryTitle').firstChild.nodeValue=state.recentOnly?'Recently opened ':'Your notebooks ';
  $('librarySubtitle').textContent=state.recentOnly?'Pick up right where you left off.':"A home for everything you're learning.";
  $('navRecent').classList.toggle('active',state.recentOnly);$('navAll').classList.toggle('active',!state.recentOnly);
  const q=$('searchInput').value.trim().toLowerCase();
  let filtered=[...state.notebooks].filter(n=>(n.title+' '+(n.subject||'')).toLowerCase().includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(state.recentOnly)filtered=filtered.slice(0,12);
  $('emptyState').classList.toggle('hidden',filtered.length>0);
  $('emptyState').querySelector('h3').textContent=q?'No notebooks found.':'Fresh page, fresh possibilities.';
  $('emptyState').querySelector('p').textContent=q?'Try another search term.':'Your first notebook is waiting to be created.';
  for(const n of filtered){
    const card=document.createElement('article');card.className='notebook-card';card.tabIndex=0;
    card.setAttribute('aria-label','Open '+n.title);
    card.innerHTML=`<div class="cover ${['blue','lilac','rose','mint','yellow','peach'].includes(n.cover)?n.cover:'blue'}"><div class="cover-icon">${esc(n.emoji||'📘')}</div><div class="cover-title">${esc(n.title)}</div><div class="cover-badge">${n.pages.length} ${n.pages.length===1?'page':'pages'}</div></div><div class="card-details"><div style="min-width:0"><h3>${esc(n.title)}</h3><p>${esc(n.subject||'Notebook')} · ${relativeTime(n.updatedAt)}</p></div><button class="card-more" aria-label="Options for ${esc(n.title)}">${icon('ellipsis')}</button></div>`;
    card.onclick=()=>openNotebook(n.id);
    card.onkeydown=e=>{if(e.key==='Enter'){openNotebook(n.id);}};
    card.querySelector('.card-more').onclick=e=>{e.stopPropagation();showContext(e.currentTarget,[
      {label:'✏️ Rename',fn:()=>showNotebookModal(n.id)},
      {label:'▢ Duplicate',fn:()=>duplicateNotebook(n.id)},
      {label:'🗑 Delete notebook',danger:true,fn:()=>deleteNotebook(n.id)}
    ]);};
    list.append(card);
  }
}
function showContext(anchor,items){
  const m=$('contextMenu');m.textContent='';contextActions=items;
  items.forEach(item=>{const b=document.createElement('button');b.textContent=item.label;if(item.danger)b.classList.add('danger');
    b.onclick=()=>{m.classList.add('hidden');item.fn();};m.append(b);});
  m.classList.remove('hidden');
  const r=anchor.getBoundingClientRect();
  m.style.top=Math.min(innerHeight-(m.offsetHeight||150)-10,r.bottom+5)+'px';
  m.style.left=Math.max(8,Math.min(innerWidth-190,r.left-130))+'px';
}
function showNotebookModal(id=null){
  state.editingId=id;const n=state.notebooks.find(n=>n.id===id);
  $('notebookDialogTitle').textContent=n?'Edit your notebook ✎':'A new notebook ✨';
  $('notebookSubmit').innerHTML=(n?'Save changes ':'Create notebook ')+icon('chevron');
  $('notebookName').value=n?.title||'';$('notebookSubject').value=n?.subject||'';
  $('notebookEmoji').value=n?.emoji||'📘';state.cover=n?.cover||'blue';
  document.querySelectorAll('[data-cover]').forEach(b=>b.classList.toggle('chosen',b.dataset.cover===state.cover));
  $('notebookDialog').showModal();setTimeout(()=>$('notebookName').focus(),50);
}
function duplicateNotebook(id){
  const n=state.notebooks.find(n=>n.id===id);if(!n)return;
  const copy=deep(n);copy.id=uid();copy.title+=' (copy)';copy.updatedAt=Date.now();
  copy.pages=copy.pages.map(p=>({...p,id:uid()}));state.notebooks.unshift(copy);saveNow();renderLibrary();toast('Notebook duplicated!');
}
function deleteNotebook(id){
  const n=state.notebooks.find(n=>n.id===id);if(!n)return;
  if(!confirm(`Delete "${n.title}" and all its pages? This cannot be undone.`))return;
  state.notebooks=state.notebooks.filter(n=>n.id!==id);
  if(state.activeId===id)showLibrary();else {renderLibrary();saveNow();}
  toast('Notebook deleted');
}
function updateEditor(){
  const n=notebook(),p=page();if(!n||!p)return;
  $('editorEmoji').textContent=n.emoji;$('editorTitle').textContent=n.title;
  const ix=currentPageIndex();
  $('editorSubtitle').textContent=(n.subject?n.subject+' · ':'')+'Page '+(ix+1)+' of '+n.pages.length;
  $('pageLabel').textContent=(ix+1)+' / '+n.pages.length;
  $('prevPage').disabled=ix===0;
  $('nextPage').disabled=ix>=n.pages.length-1;
  renderPaperUI();updateUndoButtons();renderCanvas();renderThumbnails();
}
function changePage(index){
  const n=notebook();if(!n ||index<0||index>=n.pages.length)return;
  state.activePageId=n.pages[index].id;updateEditor();queueSave();$('canvasArea').scrollTo({top:0,left:0,behavior:'instant'});
}
function addPage(){
  const n=notebook(),p=page();if(!n)return;
  const next=pageTemplate();if(p){next.paper=p.paper;next.pattern=p.pattern;}
  n.pages.splice(currentPageIndex()+1,0,next);
  state.activePageId=next.id;updateEditor();touch();toast('New page added');
}
function deletePage(id){
  const n=notebook();if(!n||n.pages.length<=1){toast('Keep at least one page in each notebook');return;}
  if(!confirm('Delete this page? This cannot be undone.'))return;
  const ix=n.pages.findIndex(p=>p.id===id);n.pages.splice(ix,1);
  state.undo.delete(id);state.redo.delete(id);
  if(state.activePageId===id)state.activePageId=n.pages[Math.max(0,ix-1)].id;
  updateEditor();touch();
}
function duplicatePage(){
  const n=notebook(),p=page();if(!n||!p)return;
  const newPage={...deep(p),id:uid()};
  n.pages.splice(currentPageIndex()+1,0,newPage);
  state.activePageId=newPage.id;updateEditor();touch();toast('Page duplicated');
}
function renderThumbnails(){
  if($('pageDrawer').classList.contains('hidden'))return;
  const n=notebook();if(!n)return;
  const list=$('pageThumbnails');list.textContent='';
  n.pages.forEach((p,i)=>{
    const wrapper=document.createElement('button');wrapper.className='page-thumb'+(p.id===state.activePageId?' selected':'');
    wrapper.innerHTML=`<canvas width="192" height="250"></canvas><span>Page ${i+1}</span><button class="remove-page" title="Delete page">×</button>`;
    // Nested buttons are not valid HTML, so detach delete control into a sibling overlay.
    const remove=wrapper.querySelector('.remove-page');remove.remove();
    wrapper.onclick=()=>changePage(i);drawPage(wrapper.querySelector('canvas').getContext('2d'),p,.2);
    const outer=document.createElement('div');outer.style.position='relative';outer.append(wrapper);
    const del=document.createElement('button');del.className='remove-page';del.textContent='×';del.title='Delete page';
    del.style.cssText='position:absolute;right:-3px;top:-2px;border:0;border-radius:50%;width:19px;height:19px;background:#fff;color:#bd5c6c;box-shadow:0 2px 8px #0002;z-index:1;';
    del.onclick=()=>deletePage(p.id);outer.append(del);list.append(outer);
  });
}
function fitPage(){
  if(state.zoomManual)return;
  const a=$('canvasArea');
  const z=Math.min((a.clientWidth-74)/PAGE_W,(a.clientHeight-45)/PAGE_H,.9);
  state.zoom=Math.round(Math.max(.3,z)*100);
  setZoom();
}
function setZoom(){
  $('pageHolder').style.setProperty('--zoom',state.zoom/100);
  $('zoomLabel').textContent=state.zoom+'%';
}
function cssLuminance(hex){
  const rgb=hex.match(/\w\w/g)?.map(s=>parseInt(s,16))||[255,255,255];
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}
function drawBackground(target,p,scale){
  const dark=cssLuminance(p.paper)<125, w=PAGE_W*scale,h=PAGE_H*scale;
  target.fillStyle=p.paper;target.fillRect(0,0,w,h);
  target.strokeStyle=dark?'rgba(191,210,239,.17)':'rgba(72,114,170,.125)';
  target.fillStyle=dark?'rgba(191,210,239,.25)':'rgba(72,114,170,.22)';
  target.lineWidth=Math.max(.45,scale*.8);
  if(p.pattern==='grid'){
    target.beginPath();for(let x=0;x<=PAGE_W;x+=32){target.moveTo(x*scale,0);target.lineTo(x*scale,h);}
    for(let y=0;y<=PAGE_H;y+=32){target.moveTo(0,y*scale);target.lineTo(w,y*scale);}target.stroke();
  }else if(p.pattern==='lines'){
    target.beginPath();for(let y=65;y<PAGE_H;y+=38){target.moveTo(0,y*scale);target.lineTo(w,y*scale);}target.stroke();
    target.strokeStyle=dark?'rgba(230,130,150,.22)':'rgba(231,137,153,.26)';
    target.beginPath();target.moveTo(80*scale,0);target.lineTo(80*scale,h);target.stroke();
  }else if(p.pattern==='dots'){
    for(let y=28;y<PAGE_H;y+=30)for(let x=29;x<PAGE_W;x+=30){
      target.beginPath();target.arc(x*scale,y*scale,Math.max(.55,scale*1.5),0,Math.PI*2);target.fill();
    }
  }
}
function drawStroke(c,s,scale=1){
  if(!s?.pts?.length)return;
  const pts=s.pts; c.save();c.globalAlpha=s.tool==='highlighter'?.31:1;c.lineCap='round';c.lineJoin='round';c.strokeStyle=s.color;
  c.lineWidth=(s.tool==='highlighter'?Math.max(19,s.width*5):s.width)*scale;
  c.beginPath();
  if(pts.length===1){c.moveTo(pts[0][0]*scale,pts[0][1]*scale);c.lineTo(pts[0][0]*scale+.05,pts[0][1]*scale+.05);}
  else{c.moveTo(pts[0][0]*scale,pts[0][1]*scale);for(let i=1;i<pts.length-1;i++){
    const p=pts[i],q=pts[i+1];c.quadraticCurveTo(p[0]*scale,p[1]*scale,(p[0]+q[0])/2*scale,(p[1]+q[1])/2*scale);
  }const last=pts[pts.length-1];c.lineTo(last[0]*scale,last[1]*scale);}
  c.stroke();c.restore();
}
function textLineParts(c,text,maxWidth){
  const out=[];for(const line of text.split('\n')){
    if(!line){out.push('');continue;}
    let current='';
    for(const word of line.split(/\s+/)){
      if(!current){current=word;continue;}
      if(c.measureText(current+' '+word).width>maxWidth){out.push(current);current=word;}else current+=' '+word;
    }out.push(current);
  }return out;
}
function textBounds(c,t,scale=1){
  c.font=`600 ${t.size*scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const lines=textLineParts(c,t.content,(PAGE_W-t.x-35)*scale);
  return {lines,height:lines.length*t.size*1.36,width:Math.max(1,...lines.map(x=>c.measureText(x).width))};
}
function drawText(c,t,scale=1){
  c.save();c.font=`600 ${t.size*scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
  c.fillStyle=t.color;c.textBaseline='top';const {lines}=textBounds(c,t,scale);
  lines.forEach((line,i)=>c.fillText(line,t.x*scale,(t.y+i*t.size*1.36)*scale));
  c.restore();
}
function getImage(src){
  if(imageCache.has(src))return imageCache.get(src);
  const im=new Image();imageCache.set(src,im);im.onload=()=>{if(page())renderCanvas();};im.src=src;return im;
}
function drawPage(c,p,scale=1){
  c.save();drawBackground(c,p,scale);
  for(const im of (p.images||[])){const img=getImage(im.src);if(img.complete&&img.naturalWidth)c.drawImage(img,im.x*scale,im.y*scale,im.w*scale,im.h*scale);}
  for(const stroke of p.strokes)drawStroke(c,stroke,scale);
  for(const t of (p.texts||[]))drawText(c,t,scale);
  c.restore();
}
function renderCanvas(){
  const p=page();if(!p)return;
  ctx.clearRect(0,0,PAGE_W,PAGE_H);drawPage(ctx,p,1);
  if(state.drawing && state.drawing.pageId===p.id &&state.drawing.stroke)drawStroke(ctx,state.drawing.stroke,1);
}
function positionFromEvent(e){
  const r=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(PAGE_W,(e.clientX-r.left)*PAGE_W/r.width)),y:Math.max(0,Math.min(PAGE_H,(e.clientY-r.top)*PAGE_H/r.height))};
}
function distSegment(x,y,a,b){
  const vx=b[0]-a[0],vy=b[1]-a[1];const len=vx*vx+vy*vy;
  if(!len)return Math.hypot(x-a[0],y-a[1]);
  const t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/len));
  return Math.hypot(x-a[0]-t*vx,y-a[1]-t*vy);
}
function eraseAt(x,y){
  const p=page();if(!p)return false;
  for(let i=p.strokes.length-1;i>=0;i--){
    const s=p.strokes[i],r=Math.max(20,s.width*2.5);
    for(let j=0;j<s.pts.length;j++){
      if(distSegment(x,y,s.pts[j],s.pts[Math.min(j+1,s.pts.length-1)])<r){
        p.strokes.splice(i,1);return true;
      }
    }
  }return false;
}
function findTextAt(x,y){
  const p=page();if(!p)return null;
  for(let i=(p.texts||[]).length-1;i>=0;i--){const t=p.texts[i],b=textBounds(ctx,t);
    if(x>=t.x-10&&x<=t.x+b.width+10&&y>=t.y-10&&y<=t.y+b.height+10)return t;
  }return null;
}
function onPointerDown(e){
  const p=page();if(!p||!e.isPrimary&&e.pointerType==='touch')return;
  if(e.pointerType==='pen')state.lastPenAt=Date.now();
  if(e.pointerType==='touch'&&(state.selectedPenOnly||Date.now()-state.lastPenAt<850))return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const pos=positionFromEvent(e);
  if(state.tool==='text'){
    const existing=findTextAt(pos.x,pos.y);state.selectedText=existing?.id||null;state.textPoint=pos;
    $('textDialogTitle').textContent=existing?'Edit your text':'Add beautiful text';
    $('textContent').value=existing?.content||'';$('textSize').value=String(existing?.size||28);
    $('textColor').value=existing?.color||state.ink;
    $('textDialog').showModal();setTimeout(()=>$('textContent').focus(),80);return;
  }
  state.activePointer=e.pointerId;
  if(state.tool==='eraser'){checkpoint();state.drawing={pageId:p.id,erase:true,changed:eraseAt(pos.x,pos.y)};renderCanvas();return;}
  const stroke={tool:state.tool,color:state.ink,width:state.width,pts:[[pos.x,pos.y,e.pressure||.5]]};
  state.drawing={pageId:p.id,stroke};renderCanvas();
}
function onPointerMove(e){
  if(state.activePointer!==e.pointerId||!state.drawing)return;
  e.preventDefault();const points=e.getCoalescedEvents?.()||[e];
  for(const ev of points){
    const pos=positionFromEvent(ev);
    if(state.drawing.erase){state.drawing.changed=eraseAt(pos.x,pos.y)||state.drawing.changed;}
    else{
      const pts=state.drawing.stroke.pts,last=pts[pts.length-1];
      if(Math.hypot(last[0]-pos.x,last[1]-pos.y)>1.1)pts.push([pos.x,pos.y,ev.pressure||.5]);
    }
  }
  renderCanvas();
}
function onPointerUp(e){
  if(state.activePointer!==e.pointerId)return;
  e.preventDefault();
  const d=state.drawing,p=page();
  if(p&&d?.stroke){
    checkpoint();
    if(d.stroke.pts.length===1)d.stroke.pts.push([...d.stroke.pts[0]]);
    p.strokes.push(d.stroke);
    touch();
  }else if(p&&d?.erase){if(d.changed)touch();else{
    // Avoid an undo entry for an eraser gesture that hit nothing.
    const bucket=pageUndoBucket();bucket.pop();updateUndoButtons();
  }}
  state.drawing=null;state.activePointer=null;renderCanvas();
}
function setTool(tool){
  state.tool=tool;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  canvas.style.cursor=tool==='text'?'text':tool==='eraser'?'cell':'crosshair';
}
function renderPaperUI(){
  const p=page();if(!p)return;
  document.querySelectorAll('[data-pattern]').forEach(b=>b.classList.toggle('selected',b.dataset.pattern===p.pattern));
  document.querySelectorAll('[data-paper]').forEach(b=>b.classList.toggle('selected',b.dataset.paper.toLowerCase()===p.paper.toLowerCase()));
  $('customPaper').value=p.paper;
}
function updatePaper(prop,value){
  const n=notebook(),p=page();if(!n||!p)return;
  checkpoint();
  const list=$('applyAllPaper').checked?n.pages:[p];
  for(const item of list)item[prop]=value;
  renderCanvas();renderPaperUI();renderThumbnails();touch();
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const safeName=s=>String(s||'Notebook').replace(/[\\/:*?"<>|]/g,'-').slice(0,85);
async function exportBackup(){
  await saveNow();const data={app:'InkNest',formatVersion:1,exportedAt:new Date().toISOString(),notebooks:state.notebooks};
  downloadBlob(new Blob([JSON.stringify(data)],{type:'application/json'}),'InkNest-backup-'+new Date().toISOString().slice(0,10)+'.json');toast('Backup exported. Keep this file safe.');
}
function importBackup(file){
  if(!file)return;
  const r=new FileReader();r.onload=()=>{
    try{
      const data=JSON.parse(r.result);
      if(!Array.isArray(data.notebooks)||data.notebooks.length>5000)throw Error('Invalid backup file');
      const items=data.notebooks.map(n=>{
        if(typeof n.title!=='string'||!Array.isArray(n.pages)||n.pages.length>20000)throw Error('Invalid notebook');
        const copy=deep(n);copy.id=uid();copy.updatedAt=Date.now();
        copy.pages=copy.pages.map(p=>({
          id:uid(),paper:/^#[0-9a-f]{6}$/i.test(p.paper)?p.paper:'#fffefa',
          pattern:['blank','grid','lines','dots'].includes(p.pattern)?p.pattern:'grid',
          strokes:Array.isArray(p.strokes)?p.strokes:[],texts:Array.isArray(p.texts)?p.texts:[],images:Array.isArray(p.images)?p.images:[]
        }));
        if(!copy.pages.length)copy.pages=[pageTemplate()];
        copy.cover=['blue','lilac','rose','mint','yellow','peach'].includes(n.cover)?n.cover:'blue';return copy;
      });
      state.notebooks.push(...items);renderLibrary();saveNow();toast(`Imported ${items.length} notebook(s)!`);
    }catch(err){console.error(err);toast('Could not import: invalid InkNest backup');}
  };r.readAsText(file);
}
function canvasJPEG(p){
  const c=document.createElement('canvas');c.width=PAGE_W;c.height=PAGE_H;
  drawPage(c.getContext('2d',{alpha:false}),p,1);
  return atob(c.toDataURL('image/jpeg',.86).split(',')[1]);
}
function makePDF(n){
  const objects=[null,null];let index=3;const pageIds=[];
  for(const p of n.pages){
    const pg=index++,content=index++,img=index++;pageIds.push(pg);
    const jpeg=canvasJPEG(p);
    const instruction='q\n'+PAGE_W+' 0 0 '+PAGE_H+' 0 0 cm\n/Im0 Do\nQ\n';
    objects[pg-1]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`;
    objects[content-1]=`<< /Length ${instruction.length} >>\nstream\n${instruction}endstream`;
    objects[img-1]=`<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${jpeg}\nendstream`;
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]='<< /Type /Pages /Count '+pageIds.length+' /Kids ['+pageIds.map(i=>i+' 0 R').join(' ')+'] >>';
  let pdf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const out=new Uint8Array(pdf.length);for(let i=0;i<pdf.length;i++)out[i]=pdf.charCodeAt(i)&255;
  return new Blob([out],{type:'application/pdf'});
}
async function exportPDF(){
  const n=notebook();if(!n)return;
  toast('Preparing your PDF…');
  await new Promise(r=>setTimeout(r,50));
  try{const blob=makePDF(n);downloadBlob(blob,safeName(n.title)+'.pdf');toast(`Exported ${n.pages.length} page(s) as PDF`);}
  catch(err){console.error(err);toast('PDF export failed. Try exporting a backup.');}
}
function exportPNG(){
  const p=page(),n=notebook();if(!p||!n)return;
  const c=document.createElement('canvas');c.width=PAGE_W;c.height=PAGE_H;
  drawPage(c.getContext('2d',{alpha:false}),p,1);
  c.toBlob(blob=>{if(blob)downloadBlob(blob,safeName(n.title)+'-page-'+(currentPageIndex()+1)+'.png');},'image/png');
}
async function insertImage(file){
  if(!file||!file.type.startsWith('image/'))return;
  const bmp=new Image();
  bmp.onload=()=>{
    const scale=Math.min(1,1300/Math.max(bmp.width,bmp.height));
    const small=document.createElement('canvas');small.width=Math.round(bmp.width*scale);small.height=Math.round(bmp.height*scale);
    small.getContext('2d').drawImage(bmp,0,0,small.width,small.height);
    const src=small.toDataURL('image/jpeg',.82), p=page();if(!p)return;
    const k=Math.min(1,670/small.width,650/small.height);
    const w=small.width*k,h=small.height*k;
    checkpoint();p.images.push({id:uid(),src,x:Math.max(20,(PAGE_W-w)/2),y:Math.max(60,(PAGE_H-h)/3),w,h});
    renderCanvas();touch();toast('Image added to this page');
  };
  bmp.src=URL.createObjectURL(file);
}
function installExtraImageTool(){
  const btn=document.createElement('button');btn.className='tool';btn.title='Insert photo';btn.innerHTML=icon('image');
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;
  btn.onclick=()=>input.click();input.onchange=()=>{insertImage(input.files[0]);input.value='';};
  document.querySelector('.tools-group').append(btn);document.body.append(input);
}
function bind(){
  ['newNotebookSide','newNotebookMain','newNotebookEmpty'].forEach(id=>$(id).onclick=()=>showNotebookModal());
  $('notebookForm').onsubmit=e=>{
    e.preventDefault();const title=$('notebookName').value.trim();if(!title)return;
    const subject=$('notebookSubject').value.trim(),emoji=$('notebookEmoji').value;
    if(state.editingId){const n=state.notebooks.find(n=>n.id===state.editingId);if(n){Object.assign(n,{title,subject,emoji,cover:state.cover});touch();renderLibrary();if(state.activeId===n.id)updateEditor();}}
    else{const n=notebookTemplate(title,subject,state.cover,emoji);state.notebooks.unshift(n);saveNow();openNotebook(n.id);toast('Your new notebook is ready!');}
    $('notebookDialog').close();
  };
  document.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>{state.cover=b.dataset.cover;document.querySelectorAll('[data-cover]').forEach(x=>x.classList.toggle('chosen',x===b));});
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('navAll').onclick=()=>{state.recentOnly=false;showLibrary();};
  $('navRecent').onclick=()=>{state.recentOnly=true;showLibrary();};
  $('searchInput').oninput=renderLibrary;
  $('backLibrary').onclick=showLibrary;
  $('mobileMenu').onclick=()=>$('sidebar').classList.toggle('open');
  $('backupSide').onclick=exportBackup;
  $('topMore').onclick=e=>{
    const options=[{label:'＋ New notebook',fn:()=>showNotebookModal()},{label:'↓ Export all notebooks (backup)',fn:exportBackup},
      {label:'↑ Import InkNest backup',fn:()=>$('importFile').click()}];
    if(notebook())options.unshift({label:'▢ Duplicate current page',fn:duplicatePage},{label:'↓ Export page as PNG',fn:exportPNG});
    showContext(e.currentTarget,options);
  };
  $('importFile').onchange=e=>{importBackup(e.target.files[0]);e.target.value='';};
  window.addEventListener('pointerdown',e=>{if(!e.target.closest('#contextMenu')&&!e.target.closest('.card-more')&&!e.target.closest('#topMore'))$('contextMenu').classList.add('hidden');});
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{
    state.ink=b.dataset.color;document.querySelectorAll('.ink-dot').forEach(x=>x.classList.toggle('selected',x===b));$('customInk').value=state.ink;
    if(state.tool==='eraser')setTool('pen');
  });
  $('customInk').oninput=e=>{state.ink=e.target.value;document.querySelectorAll('.ink-dot').forEach(x=>x.classList.remove('selected'));if(state.tool==='eraser')setTool('pen');};
  $('strokeSize').oninput=e=>{state.width=Number(e.target.value);$('strokeSizeOutput').textContent=state.width;};
  $('undoBtn').onclick=undo;$('redoBtn').onclick=redo;
  $('prevPage').onclick=()=>changePage(currentPageIndex()-1);
  $('nextPage').onclick=()=>changePage(currentPageIndex()+1);
  $('addPage').onclick=$('addPageDrawer').onclick=addPage;
  $('pagesToggle').onclick=()=>{
    $('pageDrawer').classList.toggle('hidden');$('paperPopover').classList.add('hidden');renderThumbnails();
  };
  $('closePages').onclick=()=>$('pageDrawer').classList.add('hidden');
  $('paperToggle').onclick=()=>{$('paperPopover').classList.toggle('hidden');$('pageDrawer').classList.add('hidden');renderPaperUI();};
  $('closePaper').onclick=()=>$('paperPopover').classList.add('hidden');
  document.querySelectorAll('[data-pattern]').forEach(b=>b.onclick=()=>updatePaper('pattern',b.dataset.pattern));
  document.querySelectorAll('[data-paper]').forEach(b=>b.onclick=()=>updatePaper('paper',b.dataset.paper));
  $('customPaper').onchange=e=>updatePaper('paper',e.target.value);
  $('exportPdf').onclick=exportPDF;
  $('zoomIn').onclick=()=>{state.zoomManual=true;state.zoom=Math.min(160,state.zoom+10);setZoom();};
  $('zoomOut').onclick=()=>{state.zoomManual=true;state.zoom=Math.max(25,state.zoom-10);setZoom();};
  $('pencilOnly').onchange=e=>{state.selectedPenOnly=e.target.checked;canvas.style.touchAction=e.target.checked?'pan-x pan-y':'none';toast(e.target.checked?'Pencil-only drawing enabled':'Finger drawing enabled');};
  $('textForm').onsubmit=e=>{
    e.preventDefault();const value=$('textContent').value.trim(),p=page();if(!p)return;
    const old=p.texts.find(t=>t.id===state.selectedText);if(value){
      checkpoint();
      if(old)Object.assign(old,{content:value,size:Number($('textSize').value),color:$('textColor').value});
      else p.texts.push({id:uid(),x:state.textPoint?.x||85,y:state.textPoint?.y||110,content:value,size:Number($('textSize').value),color:$('textColor').value});
      touch();renderCanvas();toast(old?'Text updated':'Neat text added');
    }else if(old){checkpoint();p.texts=p.texts.filter(t=>t.id!==old.id);touch();renderCanvas();toast('Text removed');}
    $('textDialog').close();
  };
  canvas.addEventListener('pointerdown',onPointerDown);
  canvas.addEventListener('pointermove',onPointerMove);
  canvas.addEventListener('pointerup',onPointerUp);
  canvas.addEventListener('pointercancel',onPointerUp);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
  });
  window.addEventListener('resize',()=>{if(notebook())fitPage();});
  window.addEventListener('pagehide',()=>{if(saveTimer)saveNow();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saveTimer)saveNow();});
  installExtraImageTool();
}
async function init(){
  bind();await openDB();
  const data=await dbRead();
  if(data&&Array.isArray(data.notebooks)){
    state.notebooks=data.notebooks.map(n=>({...n,pages:Array.isArray(n.pages)&&n.pages.length?n.pages.map(p=>({...p,strokes:p.strokes||[],texts:p.texts||[],images:p.images||[]})):[pageTemplate()]}));
  }else{
    state.notebooks=[
      notebookTemplate('My first notebook','Start here','blue','✨'),
      notebookTemplate('Ideas & doodles','Creative space','lilac','🎨')
    ];
    const p=state.notebooks[0].pages[0];
    p.texts.push({id:uid(),x:92,y:116,content:'Welcome to InkNest! ✨',size:43,color:'#446ea8'},
      {id:uid(),x:93,y:194,content:'Your own little space to think, draw and learn.\n\nTry writing with your Apple Pencil, or tap T for neat text.\n\nUse Paper to switch between grid, lined, dotted and blank pages.\n\nTap + Add page whenever you need more room.\n\nEverything saves automatically on this device. ♡',size:24,color:'#647895'});
    await saveNow();
  }
  renderLibrary();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init().catch(err=>{console.error(err);toast('Could not open your notebooks. Please refresh.');});
