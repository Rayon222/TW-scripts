(() => {
"use strict";

const APP_ID = "rayon-fake-planner-v3-1";
document.getElementById(APP_ID)?.remove();

const gd = window.game_data || {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const pad = n => String(n).padStart(2,"0");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const coord = s => String(s||"").match(/\b\d{1,3}\|\d{1,3}\b/)?.[0] || "";
const xy = c => c.split("|").map(Number);
const distance = (a,b) => {
  const [ax,ay]=xy(a), [bx,by]=xy(b);
  return Math.hypot(ax-bx, ay-by);
};
const fmt = ts => {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtInput = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const parseHM = v => {
  const m = String(v||"").match(/^(\d{1,2}):(\d{2})$/);
  return m ? (+m[1]*60 + +m[2]) : NaN;
};
const isBlocked = (ts,a,b) => {
  const d=new Date(ts), m=d.getHours()*60+d.getMinutes();
  if(a===b) return false;
  return a<b ? (m>=a && m<b) : (m>=a || m<b);
};
const num = s => Number(String(s||"").replace(/[^\d]/g,"")) || 0;
const shuffle = a => {
  const x=[...a];
  for(let i=x.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [x[i],x[j]]=[x[j],x[i]];
  }
  return x;
};

let unitInfo = {};
let groups = [];
let villages = [];
let plan = [];
let drag = null;

const panel = document.createElement("div");
panel.id = APP_ID;
panel.innerHTML = `
<style>
#${APP_ID}{position:fixed;z-index:99999;top:20px;left:20px;width:min(1260px,calc(100vw - 40px));max-height:94vh;overflow:auto;background:#f5f8fb;color:#17232d;border:1px solid #6f8798;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.45);font:15px/1.42 Arial,sans-serif}
#${APP_ID} *{box-sizing:border-box}
#${APP_ID} .head{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px;padding:13px 15px;background:#17374d;color:#fff;cursor:move;user-select:none}
#${APP_ID} .title{font-size:21px;font-weight:800;flex:1}
#${APP_ID} .body{padding:15px}
#${APP_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#${APP_ID} .card{background:#fff;border:1px solid #c7d4dd;border-radius:11px;padding:14px}
#${APP_ID} h2{margin:0 0 11px;color:#0b609d;font-size:18px}
#${APP_ID} label{display:block;margin:8px 0 5px;font-weight:700;color:#344c5d}
#${APP_ID} input,#${APP_ID} textarea{width:100%;padding:9px 10px;border:1px solid #8ca1af;border-radius:7px;background:#fff;color:#111;font-size:15px}
#${APP_ID} textarea{min-height:145px;resize:vertical;font-family:monospace}
#${APP_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#${APP_ID} .btn{border:1px solid #456579;border-radius:8px;background:#e8eef3;color:#173042;padding:9px 14px;font-weight:800;cursor:pointer}
#${APP_ID} .primary{background:#0b73c7;color:#fff;border-color:#075b9e}
#${APP_ID} .danger{background:#9c3030;color:#fff;border-color:#7f2222}
#${APP_ID} .good{background:#16813a;color:#fff;border-color:#10662d}
#${APP_ID} .actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
#${APP_ID} .info{padding:10px;border:1px solid #b8c8d2;border-radius:8px;background:#eef4f8;margin-top:9px}
#${APP_ID} .ok{color:#12652a}.bad{color:#a21d1d}
#${APP_ID} .groups{max-height:220px;overflow:auto;border:1px solid #b9c7d1;border-radius:8px;padding:8px;background:#f9fbfd}
#${APP_ID} .g{display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #e1e8ed}
#${APP_ID} .g input{width:auto}
#${APP_ID} .modes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#${APP_ID} .mode{border:1px solid #9db0bd;border-radius:9px;padding:10px;background:#f8fbfd}
#${APP_ID} .mode input{width:auto;margin-right:7px}
#${APP_ID} .small{font-size:12px;color:#5b7181}
#${APP_ID} .tableWrap{overflow:auto;max-height:440px}
#${APP_ID} table{width:100%;border-collapse:collapse;font-size:12px}
#${APP_ID} th,#${APP_ID} td{padding:7px;border-bottom:1px solid #d5dfe6;text-align:left;white-space:nowrap}
#${APP_ID} th{position:sticky;top:0;background:#e7f0f6;z-index:2}
#${APP_ID} .warn{background:#fff4dd;border-color:#e2bf72}
@media(max-width:850px){#${APP_ID}{left:7px!important;top:7px!important;width:calc(100vw - 14px)!important}#${APP_ID} .grid,#${APP_ID} .row,#${APP_ID} .modes{grid-template-columns:1fr}}
</style>
<div class="head" id="rfpHead">
 <div class="title">🎭 Rayon Fake Planner v3.1</div>
 <button class="btn" id="rfpMin">Sbalit</button>
 <button class="btn danger" id="rfpClose">Zavřít</button>
</div>
<div class="body" id="rfpBody">
 <div class="grid">
  <section class="card">
   <h2>1. Skupiny a zdrojové vesnice</h2>
   <div class="row">
    <input id="rfpGroupSearch" placeholder="Hledat skupinu…">
    <div class="actions" style="margin:0">
     <button class="btn" id="rfpAll">Vše</button>
     <button class="btn" id="rfpNone">Nic</button>
    </div>
   </div>
   <div id="rfpGroups" class="groups">Načítám skupiny…</div>
   <button class="btn primary" id="rfpLoadGroups" style="margin-top:9px">NAČÍST VYBRANÉ SKUPINY</button>
   <div id="rfpVillageInfo" class="info">Zatím nejsou načtené vesnice.</div>

   <h2 style="margin-top:16px">2. Cíle</h2>
   <label>Jedna souřadnice na řádek</label>
   <textarea id="rfpTargets" placeholder="500|500&#10;501|500&#10;502|501"></textarea>
  </section>

  <section class="card">
   <h2>3. Časové podmínky</h2>
   <div class="row">
    <div><label>Dopad od</label><input id="rfpFrom" type="datetime-local"></div>
    <div><label>Dopad do</label><input id="rfpTo" type="datetime-local"></div>
   </div>
   <div class="row">
    <div><label>Neposílat od</label><input id="rfpNightFrom" type="time" value="00:00"></div>
    <div><label>Neposílat do</label><input id="rfpNightTo" type="time" value="07:00"></div>
   </div>
   <div class="row">
    <div><label>Vyřadit vzdálenost ≤ polí</label><input id="rfpMinDistance" type="number" min="0" value="10"></div>
    <div><label>Min. rozestup dopadů (ms)</label><input id="rfpSpacing" type="number" min="0" value="250"></div>
   </div>
   <div class="info warn">Výchozí nastavení automaticky vyřadí všechny faky vzdálené 10 polí a méně.</div>

   <h2 style="margin-top:16px">4. Typ faku</h2>
   <div class="modes">
    <label class="mode"><input type="radio" name="rfpMode" value="limit" checked><b>Automatický zelený</b><div class="small">1 % bodů vesnice; pouze špeh, beranidlo, lehká a katapult.</div></label>
    <label class="mode"><input type="radio" name="rfpMode" value="strong"><b>Silný adaptivní</b><div class="small">Až 300 seker + 200 lehké + 100 katapultů podle dostupnosti.</div></label>
   </div>
   <label>Faků z jedné zdrojové vesnice</label>
   <input id="rfpPerVillage" type="number" min="1" value="1">
  </section>
 </div>

 <div class="actions">
  <button class="btn primary" id="rfpBuild">VYPOČÍTAT GLOBÁLNÍ PLÁN</button>
  <button class="btn" id="rfpCopy">KOPÍROVAT BB-CODE</button>
  <button class="btn" id="rfpCsv">STÁHNOUT CSV</button>
 </div>
 <div id="rfpStatus" class="info">Připraveno.</div>

 <section class="card" style="margin-top:14px">
  <h2>Výsledný plán</h2>
  <div class="tableWrap"><table>
   <thead><tr><th>#</th><th>Zdroj</th><th>Body</th><th>Cíl</th><th>Vzd.</th><th>Armáda</th><th>Odeslat</th><th>Dopad</th><th>Stav</th><th>Akce</th></tr></thead>
   <tbody id="rfpResults"></tbody>
  </table></div>
 </section>
</div>`;
document.body.appendChild(panel);

const el = id => panel.querySelector(id);
const setStatus = (t,bad=false) => {
 const x=el("#rfpStatus"); x.textContent=t; x.className=`info ${bad?"bad":"ok"}`;
};

try{
 const p=JSON.parse(localStorage.getItem("rfp_v31_pos")||"null");
 if(p?.left) panel.style.left=p.left;
 if(p?.top) panel.style.top=p.top;
}catch{}
el("#rfpHead").addEventListener("mousedown",e=>{
 if(e.target.closest("button")) return;
 const r=panel.getBoundingClientRect();
 drag={dx:e.clientX-r.left,dy:e.clientY-r.top};
});
document.addEventListener("mousemove",e=>{
 if(!drag)return;
 panel.style.left=Math.max(0,Math.min(innerWidth-panel.offsetWidth,e.clientX-drag.dx))+"px";
 panel.style.top=Math.max(0,Math.min(innerHeight-70,e.clientY-drag.dy))+"px";
});
document.addEventListener("mouseup",()=>{
 if(!drag)return;
 localStorage.setItem("rfp_v31_pos",JSON.stringify({left:panel.style.left,top:panel.style.top}));
 drag=null;
});
el("#rfpClose").onclick=()=>panel.remove();
el("#rfpMin").onclick=()=>{
 const b=el("#rfpBody"), hidden=b.style.display==="none";
 b.style.display=hidden?"block":"none";
 el("#rfpMin").textContent=hidden?"Sbalit":"Rozbalit";
};

el("#rfpFrom").value=fmtInput(Date.now()+3600000);
el("#rfpTo").value=fmtInput(Date.now()+7200000);

async function getText(url){
 const r=await fetch(url,{credentials:"same-origin",cache:"no-store"});
 if(!r.ok) throw new Error(`HTTP ${r.status}`);
 return r.text();
}

async function loadUnitInfo(){
 const xml=await getText("/interface.php?func=get_unit_info");
 const doc=new DOMParser().parseFromString(xml,"text/xml");
 for(const n of [...doc.documentElement.children]){
  unitInfo[n.tagName]={
   speed:Number(n.querySelector("speed")?.textContent||0),
   pop:Number(n.querySelector("population")?.textContent||1)
  };
 }
}

function validGroupName(name){
 name=String(name||"").replace(/\s+/g," ").trim();
 return name&&!/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(name);
}

function addGroupsFromDoc(doc,map){
 doc.querySelectorAll('a[href*="group="]').forEach(a=>{
  const href=a.getAttribute("href")||"";
  const id=href.match(/[?&]group=(\d+)/)?.[1];
  const name=a.textContent.replace(/\s+/g," ").trim();
  if(id&&validGroupName(name)) map.set(String(id),name);
 });
 doc.querySelectorAll('select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]').forEach(o=>{
  const raw=String(o.value||"");
  const id=raw.match(/[?&]group=(\d+)/)?.[1]||raw.match(/^(\d+)$/)?.[1]||o.dataset.groupId||o.dataset.id;
  const name=o.textContent.replace(/\s+/g," ").trim();
  if(id&&/^\d+$/.test(String(id))&&validGroupName(name)) map.set(String(id),name);
 });
 doc.querySelectorAll("[data-group-id],[data-group]").forEach(node=>{
  const id=node.dataset.groupId||node.dataset.group;
  const name=node.textContent.replace(/\s+/g," ").trim();
  if(id&&/^\d+$/.test(String(id))&&validGroupName(name)) map.set(String(id),name);
 });
}

async function initGroups(){
 setStatus("Načítám skupiny…");
 const map=new Map([["0","Všechny vesnice"]]);
 addGroupsFromDoc(document,map);

 const urls=[
  "/game.php?screen=groups",
  "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
  "/game.php?screen=overview_villages&mode=combined"
 ];
 for(const url of urls){
  try{
   const html=await getText(url);
   addGroupsFromDoc(new DOMParser().parseFromString(html,"text/html"),map);
  }catch(e){console.warn("Načtení skupin:",url,e);}
 }

 try{
  const r=await fetch("/game.php?screen=groups&ajax=load_group_menu",{
   credentials:"same-origin",
   cache:"no-store",
   headers:{"TribalWars-Ajax":"1"}
  });
  const txt=await r.text();
  try{
   const data=JSON.parse(txt);
   const walk=o=>{
    if(!o||typeof o!=="object") return;
    if(Array.isArray(o)){o.forEach(walk);return;}
    const id=o.group_id??o.id??o.value;
    const name=o.name??o.label??o.text;
    if(id!==undefined&&/^\d+$/.test(String(id))&&validGroupName(name)){
     map.set(String(id),String(name).trim());
    }
    Object.values(o).forEach(walk);
   };
   walk(data);
  }catch(e){
   addGroupsFromDoc(new DOMParser().parseFromString(txt,"text/html"),map);
  }
 }catch(e){console.warn("AJAX skupiny:",e);}

 groups=[...map.entries()]
  .map(([id,name])=>({id,name}))
  .filter(g=>g.id==="0"||validGroupName(g.name))
  .sort((a,b)=>a.id==="0"?-1:b.id==="0"?1:a.name.localeCompare(b.name,"cs",{sensitivity:"base"}));

 renderGroups();
 setStatus(`Načteno skupin: ${groups.length}. Vyber jednu nebo více skupin.`);
}

function renderGroups(){
 const q=el("#rfpGroupSearch").value.trim().toLowerCase();
 el("#rfpGroups").innerHTML=groups.filter(g=>g.name.toLowerCase().includes(q)).map(g=>
  `<label class="g"><input type="checkbox" value="${esc(g.id)}"><span>${esc(g.name)}</span></label>`
 ).join("") || "Nenalezena žádná skupina.";
}
el("#rfpGroupSearch").oninput=renderGroups;
el("#rfpAll").onclick=()=>$$('#rfpGroups input[type="checkbox"]',panel).forEach(x=>x.checked=true);
el("#rfpNone").onclick=()=>$$('#rfpGroups input[type="checkbox"]',panel).forEach(x=>x.checked=false);

function parsePoints(row){
 const explicit=row.querySelector(".points,td.points");
 if(explicit) return num(explicit.textContent);
 const vals=[...row.cells].map(c=>num(c.textContent)).filter(n=>n>0&&n<1000000);
 return vals.length ? Math.max(...vals) : 0;
}
function parseVillageRows(doc){
 const out=[],seen=new Set();
 for(const row of $$("tr",doc)){
  const c=coord(row.textContent);
  if(!c||seen.has(c)) continue;
  const link=row.querySelector('a[href*="village="]');
  const id=link ? new URL(link.href,location.href).searchParams.get("village") : "";
  if(!id) continue;
  seen.add(c);
  out.push({id,coord:c,name:(link.textContent||c).trim(),points:parsePoints(row),army:{}});
 }
 return out;
}
function parseArmyRows(doc){
 const map=new Map();
 for(const row of $$("tr",doc)){
  const c=coord(row.textContent);
  if(!c) continue;
  const army={};
  for(const u of ["spear","sword","axe","spy","light","heavy","ram","catapult"]){
   const cell=row.querySelector(`[data-unit="${u}"],td.unit-item-${u},td[class*="${u}"]`);
   if(cell) army[u]=num(cell.textContent);
  }
  const icons=$$('img[src*="unit_"]',row);
  for(const icon of icons){
   const m=icon.src.match(/unit_(spear|sword|axe|spy|light|heavy|ram|catapult)/);
   if(!m) continue;
   const cell=icon.closest("td");
   army[m[1]]=num(cell?.nextElementSibling?.textContent||cell?.textContent);
  }
  if(Object.keys(army).length) map.set(c,army);
 }
 return map;
}

async function loadOneGroup(groupId){
 const base=`/game.php?village=${encodeURIComponent(gd.village?.id||"")}&screen=overview_villages&group=${encodeURIComponent(groupId)}&page=-1`;
 const [combined,units]=await Promise.all([
  getText(base+"&mode=combined"),
  getText(base+"&mode=units&type=home")
 ]);
 const d1=new DOMParser().parseFromString(combined,"text/html");
 const d2=new DOMParser().parseFromString(units,"text/html");
 const vs=parseVillageRows(d1);
 const am=parseArmyRows(d2);
 for(const v of vs) v.army=am.get(v.coord)||{};
 return vs;
}

async function loadSelectedGroups(){
 const ids=$$('#rfpGroups input:checked',panel).map(x=>x.value);
 if(!ids.length){setStatus("Vyber alespoň jednu skupinu.",true);return;}
 const all=[];
 for(let i=0;i<ids.length;i++){
  setStatus(`Načítám skupinu ${i+1}/${ids.length}…`);
  try{all.push(...await loadOneGroup(ids[i]));}
  catch(e){console.error(e);}
  await sleep(100);
 }
 const byId=new Map();
 for(const v of all){
  if(!byId.has(v.id)) byId.set(v.id,v);
  else if(Object.keys(v.army||{}).length) byId.get(v.id).army=v.army;
 }
 villages=[...byId.values()];
 const armyLoaded=villages.filter(v=>Object.values(v.army||{}).some(n=>n>0)).length;
 el("#rfpVillageInfo").innerHTML=`Načteno <b>${villages.length}</b> vesnic; armáda rozpoznána u <b>${armyLoaded}</b>.`;
 setStatus(`Skupiny načteny: ${villages.length} vesnic.`);
}
el("#rfpLoadGroups").onclick=()=>loadSelectedGroups().catch(e=>setStatus(e.message,true));

function limitComp(v){
 const a=v.army||{}, needPop=Math.ceil((v.points||0)*0.01);
 if(!needPop) return null;
 const order=["spy","ram","light","catapult"];
 const comp={spy:0,ram:0,light:0,catapult:0};
 let remain=needPop;
 for(const u of order){
  const pop=Math.max(1,unitInfo[u]?.pop||1);
  const use=Math.min(a[u]||0,Math.ceil(remain/pop));
  comp[u]=use;
  remain-=use*pop;
  if(remain<=0)break;
 }
 return remain<=0 ? comp : null;
}
function strongComp(v){
 const a=v.army||{};
 const c={axe:Math.min(300,a.axe||0),light:Math.min(200,a.light||0),catapult:Math.min(100,a.catapult||0)};
 return Object.values(c).some(n=>n>0)?c:null;
}
function slowest(comp){
 const arr=Object.entries(comp||{}).filter(([,n])=>n>0).map(([u])=>({u,s:Number(unitInfo[u]?.speed||0)})).filter(x=>x.s>0);
 if(!arr.length) return null;
 return arr.reduce((a,b)=>a.s>=b.s?a:b);
}
function compText(c){
 const L={spy:"špeh",ram:"ber",light:"LJ",catapult:"kat",axe:"sek"};
 return Object.entries(c||{}).filter(([,n])=>n>0).map(([u,n])=>`${n} ${L[u]}`).join(" + ");
}
function findTiming(v,target,slow,from,to,nf,nt,spacing,seed){
 const d=distance(v.coord,target);
 const travel=d*slow.s*60000;
 const span=to-from;
 const attempts=Math.max(80,Math.min(600,Math.ceil(span/Math.max(1000,spacing||1000))));
 const start=(seed*7919)%attempts;
 for(let k=0;k<attempts;k++){
  const i=(k+start)%attempts;
  const arrival=from+(attempts===1?0:(span*i/(attempts-1)));
  const send=arrival-travel;
  if(!isBlocked(send,nf,nt)) return {arrival,send,distance:d};
 }
 return null;
}

async function buildPlan(){
 if(!Object.keys(unitInfo).length) await loadUnitInfo();
 const targets=[...new Set(el("#rfpTargets").value.split(/\s+/).map(coord).filter(Boolean))];
 const from=new Date(el("#rfpFrom").value).getTime(), to=new Date(el("#rfpTo").value).getTime();
 const nf=parseHM(el("#rfpNightFrom").value), nt=parseHM(el("#rfpNightTo").value);
 const minD=Math.max(0,Number(el("#rfpMinDistance").value)||0);
 const spacing=Math.max(0,Number(el("#rfpSpacing").value)||0);
 const per=Math.max(1,Math.floor(Number(el("#rfpPerVillage").value)||1));
 const mode=panel.querySelector('input[name="rfpMode"]:checked').value;
 if(!villages.length)return setStatus("Nejdřív načti skupiny.",true);
 if(!targets.length)return setStatus("Zadej alespoň jeden cíl.",true);
 if(!(to>from))return setStatus("Dopad do musí být později než Dopad od.",true);

 const targetUse=Object.fromEntries(targets.map(t=>[t,0]));
 plan=[];
 const jobs=[];
 for(const v of shuffle(villages)) for(let n=0;n<per;n++) jobs.push({v,copy:n});
 let seq=0;

 for(const job of jobs){
  const comp=mode==="strong"?strongComp(job.v):limitComp(job.v);
  if(!comp){
   plan.push({...job,target:"-",comp:null,status:mode==="strong"?"Chybí povolené jednotky":"Nesplní 1% limit",send:null,arrival:null,distance:null});
   continue;
  }
  const slow=slowest(comp);
  if(!slow){
   plan.push({...job,target:"-",comp,status:"Nelze určit rychlost jednotek",send:null,arrival:null,distance:null});
   continue;
  }

  const valid=[];
  for(const t of shuffle(targets)){
   const d=distance(job.v.coord,t);
   if(d<=minD) continue;
   const timing=findTiming(job.v,t,slow,from,to,nf,nt,spacing,seq++);
   if(timing) valid.push({target:t,...timing});
  }
  if(!valid.length){
   plan.push({...job,target:"-",comp,slow,status:`Žádná platná kombinace nad ${minD} polí mimo noc`,send:null,arrival:null,distance:null});
   continue;
  }
  valid.sort((a,b)=>{
   const bal=targetUse[a.target]-targetUse[b.target];
   return bal!==0 ? bal : Math.random()-.5;
  });
  const pick=valid[0];
  targetUse[pick.target]++;
  plan.push({...job,comp,slow,...pick,status:"OK"});
 }

 plan.sort((a,b)=>(a.send??Infinity)-(b.send??Infinity));
 render();
 const ok=plan.filter(x=>x.send).length;
 setStatus(`Hotovo: ${ok}/${plan.length} faků. Vzdálenosti ≤ ${minD} polí byly vyřazeny.`,ok!==plan.length);
}

function sendUrl(r){
 const [x,y]=r.target.split("|");
 const q=new URLSearchParams({village:r.v.id,screen:"place",x,y});
 for(const [u,n] of Object.entries(r.comp||{}))if(n>0)q.set(u,String(n));
 return `/game.php?${q.toString()}`;
}
function render(){
 el("#rfpResults").innerHTML=plan.map((r,i)=>`
 <tr>
  <td>${i+1}</td><td>${esc(r.v.name)} (${r.v.coord})</td><td>${r.v.points||"?"}</td>
  <td>${esc(r.target)}</td><td>${r.distance==null?"-":r.distance.toFixed(1)}</td>
  <td>${r.comp?esc(compText(r.comp)):"-"}</td><td>${r.send?fmt(r.send):"-"}</td>
  <td>${r.arrival?fmt(r.arrival):"-"}</td><td class="${r.status==="OK"?"ok":"bad"}">${esc(r.status)}</td>
  <td>${r.send?`<a class="btn good" target="_blank" href="${esc(sendUrl(r))}">Otevřít</a>`:"-"}</td>
 </tr>`).join("");
}
function bbcode(){
 return plan.filter(r=>r.send).map((r,i)=>`${i+1}. [coord]${r.v.coord}[/coord] → [coord]${r.target}[/coord] | ${compText(r.comp)} | ${r.distance.toFixed(1)} polí | odeslat [b]${fmt(r.send)}[/b] | dopad ${fmt(r.arrival)}`).join("\n");
}
el("#rfpBuild").onclick=()=>buildPlan().catch(e=>{console.error(e);setStatus(e.message,true);});
el("#rfpCopy").onclick=async()=>{await navigator.clipboard.writeText(bbcode());setStatus("BB-Code zkopírován.");};
el("#rfpCsv").onclick=()=>{
 const rows=[["source","points","target","distance","army","send","arrival","status"],...plan.map(r=>[r.v.coord,r.v.points,r.target,r.distance??"",compText(r.comp),r.send?fmt(r.send):"",r.arrival?fmt(r.arrival):"",r.status])];
 const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
 const a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 a.download="rayon_fake_plan_v3_1.csv";
 a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

(async()=>{
 try{await loadUnitInfo();await initGroups();setStatus("Připraveno. Vyber skupiny a načti je.");}
 catch(e){console.error(e);setStatus("Spuštění selhalo: "+e.message,true);}
})();
})();