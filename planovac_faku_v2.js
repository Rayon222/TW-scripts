(() => {
"use strict";

const APP_ID = "rayon-fake-planner-v2";
document.getElementById(APP_ID)?.remove();

const gd = window.game_data || {};
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const pad = (n,l=2) => String(n).padStart(l,"0");
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
const isBlocked = (ts, a, b) => {
  const d = new Date(ts), m=d.getHours()*60+d.getMinutes();
  if (a===b) return false;
  return a<b ? (m>=a && m<b) : (m>=a || m<b);
};
const numberFrom = s => Number(String(s||"").replace(/[^\d]/g,"")) || 0;
const baseUrl = () => `/game.php?village=${encodeURIComponent(gd.village?.id || "")}&screen=overview_villages&mode=combined`;

let unitInfo = {};
let groups = [];
let villages = [];
let plan = [];
let selectedGroup = "";
let drag = null;

const panel = document.createElement("div");
panel.id = APP_ID;
panel.innerHTML = `
<style>
#${APP_ID}{
  position:fixed; z-index:99999; top:24px; left:24px;
  width:min(1220px,calc(100vw - 48px)); max-height:92vh; overflow:auto;
  background:#f4f7fa; color:#15212b; border:1px solid #6d8293;
  border-radius:14px; box-shadow:0 18px 60px rgba(0,0,0,.45);
  font:16px/1.4 Arial,sans-serif;
}
#${APP_ID} *{box-sizing:border-box}
#${APP_ID} .head{
  position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px;
  padding:14px 16px; background:#183347; color:white; border-bottom:1px solid #102534;
  cursor:move; user-select:none;
}
#${APP_ID} .title{font-size:21px;font-weight:800;flex:1}
#${APP_ID} .body{padding:16px}
#${APP_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#${APP_ID} .card{background:#fff;border:1px solid #c7d3dc;border-radius:11px;padding:14px}
#${APP_ID} h2{margin:0 0 12px;font-size:18px;color:#0b5e9b}
#${APP_ID} label{display:block;margin:9px 0 5px;font-weight:700;color:#334a5b}
#${APP_ID} input,#${APP_ID} textarea,#${APP_ID} select{
  width:100%; background:#fff; color:#111; border:1px solid #879dab;
  border-radius:7px; padding:10px; font-size:16px;
}
#${APP_ID} textarea{min-height:140px;resize:vertical;font-family:monospace}
#${APP_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#${APP_ID} .btn{
  border:1px solid #456579;border-radius:8px;background:#e8eef3;color:#173042;
  padding:10px 15px;font-weight:800;font-size:15px;cursor:pointer;
}
#${APP_ID} .btn:hover{filter:brightness(.96)}
#${APP_ID} .primary{background:#0b73c7;color:#fff;border-color:#075b9e}
#${APP_ID} .danger{background:#9c3030;color:#fff;border-color:#7f2222}
#${APP_ID} .good{background:#16813a;color:#fff;border-color:#10662d}
#${APP_ID} .actions{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0}
#${APP_ID} .info{padding:11px;border:1px solid #b8c7d1;border-radius:8px;background:#eef4f8;margin-top:10px}
#${APP_ID} .ok{color:#12652a}.bad{color:#a21d1d}
#${APP_ID} .modes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#${APP_ID} .mode{border:1px solid #9db0bd;border-radius:9px;padding:11px;background:#f8fbfd}
#${APP_ID} .mode input{width:auto;margin-right:8px}
#${APP_ID} .tableWrap{overflow:auto;max-height:430px}
#${APP_ID} table{width:100%;border-collapse:collapse;font-size:13px}
#${APP_ID} th,#${APP_ID} td{padding:8px;border-bottom:1px solid #d4dde3;text-align:left;white-space:nowrap}
#${APP_ID} th{position:sticky;top:0;background:#e8f0f5;z-index:1}
#${APP_ID} .small{font-size:13px;color:#5d7080}
#${APP_ID} .badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#dceaf5;font-size:12px;font-weight:700}
#${APP_ID} .close{cursor:pointer}
@media(max-width:850px){
  #${APP_ID}{left:8px!important;top:8px!important;width:calc(100vw - 16px)!important}
  #${APP_ID} .grid,#${APP_ID} .row,#${APP_ID} .modes{grid-template-columns:1fr}
}
</style>
<div class="head" id="rfpHead">
  <div class="title">🎭 Rayon Fake Planner v2</div>
  <button class="btn" id="rfpMin">Sbalit</button>
  <button class="btn danger close" id="rfpClose">Zavřít</button>
</div>
<div class="body" id="rfpBody">
  <div class="grid">
    <section class="card">
      <h2>1. Zdrojové vesnice</h2>
      <label>Skupina</label>
      <div class="row">
        <select id="rfpGroup"></select>
        <button class="btn" id="rfpLoadGroup">Načíst skupinu</button>
      </div>
      <div id="rfpVillageInfo" class="info">Načítám skupiny…</div>

      <h2 style="margin-top:16px">2. Cíle</h2>
      <label>Jedna souřadnice na řádek</label>
      <textarea id="rfpTargets" placeholder="500|500&#10;501|500&#10;502|501"></textarea>
    </section>

    <section class="card">
      <h2>3. Okno dopadu</h2>
      <div class="row">
        <div><label>Dopad od</label><input id="rfpFrom" type="datetime-local"></div>
        <div><label>Dopad do</label><input id="rfpTo" type="datetime-local"></div>
      </div>

      <h2 style="margin-top:16px">4. Noční blokace odesílání</h2>
      <div class="row">
        <div><label>Neposílat od</label><input id="rfpNightFrom" type="time" value="00:00"></div>
        <div><label>Neposílat do</label><input id="rfpNightTo" type="time" value="07:00"></div>
      </div>

      <h2 style="margin-top:16px">5. Typ faku</h2>
      <div class="modes">
        <label class="mode">
          <input type="radio" name="rfpMode" value="limit" checked>
          <b>Automatický zelený fak</b>
          <div class="small">Minimálně 1 % bodů vesnice. Pouze špeh, beranidlo, lehká a katapult.</div>
        </label>
        <label class="mode">
          <input type="radio" name="rfpMode" value="strong">
          <b>Silný adaptivní fak</b>
          <div class="small">Až 300 seker + 200 lehké + 100 katapultů podle dostupnosti.</div>
        </label>
      </div>

      <div class="row" style="margin-top:10px">
        <div><label>Faků na zdrojovou vesnici</label><input id="rfpPerVillage" type="number" min="1" value="1"></div>
        <div><label>Min. rozestup dopadů (ms)</label><input id="rfpSpacing" type="number" min="0" value="250"></div>
      </div>
    </section>
  </div>

  <div class="actions">
    <button class="btn primary" id="rfpBuild">VYPOČÍTAT PLÁN</button>
    <button class="btn" id="rfpCopy">KOPÍROVAT BB-CODE</button>
    <button class="btn" id="rfpCsv">STÁHNOUT CSV</button>
  </div>

  <div id="rfpStatus" class="info">Připraveno.</div>

  <section class="card" style="margin-top:14px">
    <h2>Výsledný plán</h2>
    <div class="tableWrap">
      <table>
        <thead><tr><th>#</th><th>Zdroj</th><th>Body</th><th>Cíl</th><th>Armáda</th><th>Odeslat</th><th>Dopad</th><th>Stav</th><th>Akce</th></tr></thead>
        <tbody id="rfpResults"></tbody>
      </table>
    </div>
  </section>
</div>`;
document.body.appendChild(panel);

const el = id => panel.querySelector(id);
const setStatus = (t,bad=false) => {
  const x=el("#rfpStatus"); x.textContent=t; x.className=`info ${bad?"bad":"ok"}`;
};

const savePos = () => localStorage.setItem("rfp_v2_pos", JSON.stringify({left:panel.style.left,top:panel.style.top}));
try{
  const p=JSON.parse(localStorage.getItem("rfp_v2_pos")||"null");
  if(p?.left) panel.style.left=p.left;
  if(p?.top) panel.style.top=p.top;
}catch{}

el("#rfpHead").addEventListener("mousedown", e => {
  if (e.target.closest("button")) return;
  const r=panel.getBoundingClientRect();
  drag={dx:e.clientX-r.left,dy:e.clientY-r.top};
});
document.addEventListener("mousemove", e => {
  if(!drag) return;
  const maxX=Math.max(0,innerWidth-panel.offsetWidth), maxY=Math.max(0,innerHeight-80);
  panel.style.left=Math.min(maxX,Math.max(0,e.clientX-drag.dx))+"px";
  panel.style.top=Math.min(maxY,Math.max(0,e.clientY-drag.dy))+"px";
});
document.addEventListener("mouseup",()=>{ if(drag){savePos();drag=null;} });

el("#rfpClose").onclick=()=>panel.remove();
el("#rfpMin").onclick=()=>{
  const body=el("#rfpBody");
  const hidden=body.style.display==="none";
  body.style.display=hidden?"block":"none";
  el("#rfpMin").textContent=hidden?"Sbalit":"Rozbalit";
};

el("#rfpFrom").value=fmtInput(Date.now()+3600000);
el("#rfpTo").value=fmtInput(Date.now()+7200000);

async function loadUnitInfo(){
  const xml=await fetch("/interface.php?func=get_unit_info",{credentials:"same-origin"}).then(r=>r.text());
  const doc=new DOMParser().parseFromString(xml,"text/xml");
  for(const n of [...doc.documentElement.children]){
    unitInfo[n.tagName]={
      speed:Number(n.querySelector("speed")?.textContent||0),
      pop:Number(n.querySelector("population")?.textContent||1)
    };
  }
}

function parseGroupsFromPage(){
  const select=$("#group_select") || $('select[name="group"]') || $('select[id*="group"]');
  if(!select) return [];
  return [...select.options].map(o=>({id:o.value,name:o.textContent.trim(),selected:o.selected}));
}

async function initGroups(){
  groups=parseGroupsFromPage();
  if(!groups.length){
    groups=[{id:"",name:"Aktuálně zobrazená skupina",selected:true}];
  }
  el("#rfpGroup").innerHTML=groups.map(g=>`<option value="${esc(g.id)}" ${g.selected?"selected":""}>${esc(g.name)}</option>`).join("");
  selectedGroup=el("#rfpGroup").value;
  await loadVillages(selectedGroup);
}

function parseVillages(doc){
  const rows=$$("tr",doc);
  const out=[],seen=new Set();
  for(const row of rows){
    const c=coord(row.textContent);
    if(!c||seen.has(c)) continue;
    const link=row.querySelector('a[href*="village="]');
    const id=link ? new URL(link.href,location.href).searchParams.get("village") : "";
    if(!id) continue;
    const name=(link.textContent||c).trim();
    const cells=[...row.cells];
    let points=0;
    for(const cell of cells){
      const n=numberFrom(cell.textContent);
      if(n>points && n<10000000) points=n;
    }
    seen.add(c);
    out.push({id,coord:c,name,points});
  }
  return out;
}

async function loadVillages(groupId){
  setStatus("Načítám vesnice ze skupiny…");
  let url=`${baseUrl()}&page=-1`;
  if(groupId!==""&&groupId!=null) url+=`&group=${encodeURIComponent(groupId)}`;
  const html=await fetch(url,{credentials:"same-origin"}).then(r=>{
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.text();
  });
  const doc=new DOMParser().parseFromString(html,"text/html");
  villages=parseVillages(doc);
  el("#rfpVillageInfo").innerHTML=`Načteno <b>${villages.length}</b> vesnic ze zvolené skupiny.`;
  setStatus(`Skupina načtena: ${villages.length} vesnic.`);
}

el("#rfpLoadGroup").onclick=()=>loadVillages(el("#rfpGroup").value).catch(e=>setStatus(e.message,true));

async function loadVillageArmy(v){
  const html=await fetch(`/game.php?village=${encodeURIComponent(v.id)}&screen=place`,{credentials:"same-origin"}).then(r=>r.text());
  const doc=new DOMParser().parseFromString(html,"text/html");
  const army={};
  for(const id of ["spy","ram","light","catapult","axe"]){
    const input=doc.querySelector(`input[name="${id}"]`);
    const all=input?.dataset?.allCount || input?.getAttribute("data-all-count");
    let n=numberFrom(all);
    if(!n){
      const text=input?.closest("td")?.textContent || "";
      const m=text.match(/\(([\d. ]+)\)/);
      n=numberFrom(m?.[1]);
    }
    army[id]=n;
  }
  return army;
}

function compositionText(c){
  const labels={spy:"špeh",ram:"ber",light:"LJ",catapult:"kat",axe:"sek"};
  return Object.entries(c).filter(([,n])=>n>0).map(([u,n])=>`${n} ${labels[u]}`).join(" + ");
}

function buildLimitFake(v,army){
  const targetPop=Math.ceil(v.points*0.01);
  const allowed=["spy","ram","light","catapult"];
  const comp={spy:0,ram:0,light:0,catapult:0};
  let remaining=targetPop;

  // Prefer spy, then ram, light, catapult while respecting availability.
  for(const u of allowed){
    const pop=Math.max(1,unitInfo[u]?.pop||1);
    const need=Math.ceil(remaining/pop);
    const use=Math.min(army[u]||0,need);
    comp[u]=use;
    remaining-=use*pop;
    if(remaining<=0) break;
  }
  return remaining<=0 ? comp : null;
}

function buildStrongFake(army){
  const comp={
    axe:Math.min(300,army.axe||0),
    light:Math.min(200,army.light||0),
    catapult:Math.min(100,army.catapult||0)
  };
  const total=comp.axe+comp.light+comp.catapult;
  return total>0 ? comp : null;
}

function slowestUnit(comp){
  return Object.entries(comp).filter(([,n])=>n>0).map(([u])=>({u,s:unitInfo[u]?.speed||0})).reduce((a,b)=>a.s>=b.s?a:b);
}

async function buildPlan(){
  if(!Object.keys(unitInfo).length) await loadUnitInfo();
  const targets=[...new Set(el("#rfpTargets").value.split(/\s+/).map(coord).filter(Boolean))];
  const from=new Date(el("#rfpFrom").value).getTime();
  const to=new Date(el("#rfpTo").value).getTime();
  const nf=parseHM(el("#rfpNightFrom").value), nt=parseHM(el("#rfpNightTo").value);
  const per=Math.max(1,Math.floor(Number(el("#rfpPerVillage").value)||1));
  const spacing=Math.max(0,Number(el("#rfpSpacing").value)||0);
  const mode=panel.querySelector('input[name="rfpMode"]:checked').value;

  if(!villages.length) return setStatus("Nejsou načtené žádné zdrojové vesnice.",true);
  if(!targets.length) return setStatus("Zadej alespoň jeden cíl.",true);
  if(!(to>from)) return setStatus("Čas Dopad do musí být později než Dopad od.",true);

  setStatus(`Načítám armády z ${villages.length} vesnic…`);
  const armies={};
  let done=0;
  const queue=[...villages];
  const workers=Array.from({length:Math.min(5,queue.length)},async()=>{
    while(queue.length){
      const v=queue.shift();
      try{armies[v.id]=await loadVillageArmy(v);}
      catch{armies[v.id]={};}
      done++; setStatus(`Načítám armády: ${done}/${villages.length}`);
      await sleep(80);
    }
  });
  await Promise.all(workers);

  const candidates=[];
  for(const v of villages){
    const comp=mode==="strong" ? buildStrongFake(armies[v.id]) : buildLimitFake(v,armies[v.id]);
    for(let i=0;i<per;i++) candidates.push({v,comp,target:targets[candidates.length%targets.length]});
  }

  const validBase=candidates.filter(x=>x.comp);
  const interval=validBase.length>1 ? Math.max(spacing,(to-from)/(validBase.length-1)) : 0;
  plan=[];

  for(let i=0;i<candidates.length;i++){
    const x=candidates[i];
    if(!x.comp){
      plan.push({...x,status:"Nedostatek povolených jednotek",send:null,arrival:null});
      continue;
    }
    const slow=slowestUnit(x.comp);
    let arrival=from + Math.min(i,Math.max(0,validBase.length-1))*interval;
    let send=arrival-distance(x.v.coord,x.target)*slow.s*60000;
    while(arrival<=to && isBlocked(send,nf,nt)){
      arrival+=Math.max(1000,spacing||1000);
      send=arrival-distance(x.v.coord,x.target)*slow.s*60000;
    }
    if(arrival>to){
      plan.push({...x,slow,status:"Nenalezen povolený čas",send:null,arrival:null});
    }else{
      plan.push({...x,slow,status:"OK",send,arrival});
    }
  }

  plan.sort((a,b)=>(a.send??Infinity)-(b.send??Infinity));
  renderPlan();
  const ok=plan.filter(x=>x.send).length;
  setStatus(`Hotovo: ${ok} faků naplánováno, ${plan.length-ok} vynecháno.`,plan.length-ok>0);
}

function sendUrl(r){
  const [x,y]=r.target.split("|");
  const q=new URLSearchParams({village:r.v.id,screen:"place",x,y});
  for(const [u,n] of Object.entries(r.comp||{})) if(n>0) q.set(u,String(n));
  return `/game.php?${q.toString()}`;
}

function renderPlan(){
  el("#rfpResults").innerHTML=plan.map((r,i)=>`
  <tr>
    <td>${i+1}</td>
    <td>${esc(r.v.name)} (${r.v.coord})</td>
    <td>${r.v.points||"?"}</td>
    <td>${r.target}</td>
    <td>${r.comp?esc(compositionText(r.comp)):"-"}</td>
    <td>${r.send?fmt(r.send):"-"}</td>
    <td>${r.arrival?fmt(r.arrival):"-"}</td>
    <td class="${r.status==="OK"?"ok":"bad"}">${esc(r.status)}</td>
    <td>${r.send?`<a class="btn good" target="_blank" href="${esc(sendUrl(r))}">Otevřít</a>`:"-"}</td>
  </tr>`).join("");
}

function bbcode(){
  return plan.filter(r=>r.send).map((r,i)=>
    `${i+1}. [coord]${r.v.coord}[/coord] → [coord]${r.target}[/coord] | ${compositionText(r.comp)} | odeslat [b]${fmt(r.send)}[/b] | dopad ${fmt(r.arrival)}`
  ).join("\n");
}

el("#rfpBuild").onclick=()=>buildPlan().catch(e=>{console.error(e);setStatus(e.message,true);});
el("#rfpCopy").onclick=async()=>{await navigator.clipboard.writeText(bbcode());setStatus("BB-Code zkopírován.");};
el("#rfpCsv").onclick=()=>{
  const rows=[["source","points","target","army","send","arrival","status"],...plan.map(r=>[r.v.coord,r.v.points,r.target,compositionText(r.comp||{}),r.send?fmt(r.send):"",r.arrival?fmt(r.arrival):"",r.status])];
  const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download="rayon_fake_plan_v2.csv";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

(async()=>{
  try{
    await loadUnitInfo();
    await initGroups();
  }catch(e){
    console.error(e);
    setStatus("Spuštění selhalo: "+e.message,true);
  }
})();
})();