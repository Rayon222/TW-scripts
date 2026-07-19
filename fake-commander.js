javascript:(async()=>{"use strict";
const APP_ID="fake-commander-2";
const VERSION="2.2.0";
const STORAGE_KEY="fake_commander_2_settings";
const POS_KEY="fake_commander_2_position";

if(document.getElementById(APP_ID)){document.getElementById(APP_ID).remove();}

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uniqBy=(arr,keyFn)=>{const m=new Map();for(const x of arr)m.set(keyFn(x),x);return [...m.values()]};
const coordRE=/\b(\d{3})\|(\d{3})\b/g;
const num=v=>Number(String(v??"").replace(/[^\d.-]/g,""))||0;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const pad=n=>String(n).padStart(2,"0");
const formatDate=t=>{const d=new Date(t);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`};
const parseDateTime=v=>{const t=new Date(v).getTime();return Number.isFinite(t)?t:NaN};
const parseTime=v=>{const m=/^(\d{1,2}):(\d{2})$/.exec(v||"");return m?clamp(+m[1],0,23)*60+clamp(+m[2],0,59):null};
const minuteOfDay=t=>{const d=new Date(t);return d.getHours()*60+d.getMinutes()};
const inBlocked=t=>{
  if(!state.settings.blockEnabled)return false;
  const a=parseTime(state.settings.blockFrom),b=parseTime(state.settings.blockTo);
  if(a==null||b==null||a===b)return false;
  const m=minuteOfDay(t);
  return a<b ? m>=a&&m<b : m>=a||m<b;
};
const parseCoords=text=>{
  const out=[]; let m; coordRE.lastIndex=0;
  while((m=coordRE.exec(text||"")))out.push(`${m[1]}|${m[2]}`);
  return [...new Set(out)];
};
const distance=(a,b)=>{
  const [x1,y1]=a.split("|").map(Number),[x2,y2]=b.split("|").map(Number);
  return Math.hypot(x2-x1,y2-y1);
};
const gameBase=()=>location.origin;
const gameVillageId=()=>window.game_data?.village?.id||new URLSearchParams(location.search).get("village")||"";
const worldSpeed=()=>Number(window.game_data?.speed)||1;
const unitSpeed=()=>Number(window.game_data?.unit_speed)||1;
const unitMinutes={spear:18,sword:22,axe:18,archer:18,spy:9,light:10,marcher:10,heavy:11,ram:30,catapult:30,snob:35};
const unitPop={axe:1,spy:2,light:4,ram:5,catapult:8};
const autoFakeUnits=["axe","light","spy","ram","catapult"];

const defaults={
  groups:[],
  targetsText:"",
  arrivalFrom:"",
  arrivalTo:"",
  blockEnabled:true,
  blockFrom:"00:00",
  blockTo:"07:00",
  maxPerSource:1,
  minDistance:0,
  maxDistance:999,
  distribution:"balanced",
  fakeType:"auto1pct",
  customUnit:"ram",
  customAmount:1,
  randomSeconds:0
};
const saved=(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}catch{return {}}})();
const state={settings:{...defaults,...saved},groups:[],villages:[],plan:[],loading:false};

function saveSettings(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state.settings));
}
function toast(msg,type="info"){
  const el=document.createElement("div");
  el.className=`fc-toast ${type}`;
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.classList.add("show"),10);
  setTimeout(()=>{el.classList.remove("show");setTimeout(()=>el.remove(),250)},3200);
}
function style(){
  const st=document.createElement("style");
  st.textContent=`
#${APP_ID}{position:fixed;z-index:99999;top:70px;left:70px;width:min(980px,calc(100vw - 30px));max-height:calc(100vh - 90px);background:#f4ead7;border:2px solid #6c4e2f;border-radius:12px;box-shadow:0 15px 45px #0008;font:13px Arial;color:#2d241c;overflow:hidden}
#${APP_ID} *{box-sizing:border-box}
#${APP_ID} .fc-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(#7b5b38,#4d351f);color:#fff;cursor:move}
#${APP_ID} .fc-title{font-size:17px;font-weight:700}
#${APP_ID} .fc-actions{display:flex;gap:7px}
#${APP_ID} button,#${APP_ID} select,#${APP_ID} input,#${APP_ID} textarea{font:inherit}
#${APP_ID} button{border:1px solid #705131;border-radius:6px;background:#e7d6b9;padding:7px 10px;cursor:pointer}
#${APP_ID} button:hover{filter:brightness(.96)}
#${APP_ID} button.primary{background:#6f4d2b;color:#fff;border-color:#4d341d}
#${APP_ID} button.danger{background:#8d3e32;color:#fff}
#${APP_ID} .fc-body{padding:12px;overflow:auto;max-height:calc(100vh - 145px)}
#${APP_ID} .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:10px}
#${APP_ID} .card{grid-column:span 12;background:#fffaf0;border:1px solid #c9b38d;border-radius:9px;padding:11px}
#${APP_ID} .half{grid-column:span 6}
#${APP_ID} .third{grid-column:span 4}
#${APP_ID} h3{margin:0 0 9px;font-size:14px;color:#5b3d21}
#${APP_ID} label{display:block;font-weight:700;margin:7px 0 4px}
#${APP_ID} input,#${APP_ID} select,#${APP_ID} textarea{width:100%;border:1px solid #aa9472;border-radius:5px;background:white;padding:7px}
#${APP_ID} textarea{min-height:105px;resize:vertical}
#${APP_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#${APP_ID} .group-list{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;max-height:130px;overflow:auto;border:1px solid #c9b38d;background:#fff;padding:7px;border-radius:5px}
#${APP_ID} .group-list label{margin:0;font-weight:400;display:flex;align-items:center;gap:5px}
#${APP_ID} .group-list input{width:auto}
#${APP_ID} .toolbar{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
#${APP_ID} .status{padding:8px;background:#eee1cb;border-radius:6px;margin-top:8px}
#${APP_ID} table{width:100%;border-collapse:collapse;background:#fff;font-size:12px}
#${APP_ID} th,#${APP_ID} td{border:1px solid #c8b690;padding:5px;text-align:left;vertical-align:top}
#${APP_ID} th{background:#e9dac0;position:sticky;top:0}
#${APP_ID} .table-wrap{max-height:330px;overflow:auto;border-radius:6px}
#${APP_ID} .muted{color:#776957;font-size:12px}
#${APP_ID} .ok{color:#176b2c;font-weight:700}
#${APP_ID} .bad{color:#9b241e;font-weight:700}
.fc-toast{position:fixed;z-index:100000;right:20px;bottom:20px;max-width:420px;padding:10px 14px;border-radius:7px;background:#333;color:white;opacity:0;transform:translateY(15px);transition:.2s}
.fc-toast.show{opacity:1;transform:none}.fc-toast.error{background:#962f28}.fc-toast.success{background:#27723b}
@media(max-width:760px){#${APP_ID}{left:8px!important;top:8px!important;width:calc(100vw - 16px)}#${APP_ID} .half,#${APP_ID} .third{grid-column:span 12}#${APP_ID} .group-list{grid-template-columns:1fr 1fr}}
`;
  document.head.appendChild(st);
}

function autoOnePercentComposition(village){
  // Herní 1% fake: maximální populace útoku = floor(body vesnice / 100).
  // Rozdělení probíhá rovnoměrně podle POPULACE mezi sekery, lehkou jízdu,
  // špehy, beranidla a katapulty, vždy nejvýše do dostupného počtu jednotek.
  const budget=Math.max(1,Math.floor(Number(village.points||0)/100));
  const available={};
  for(const u of autoFakeUnits)available[u]=Math.max(0,Number(village.units?.[u]||0));

  const result={axe:0,light:0,spy:0,ram:0,catapult:0};
  let remaining=budget;
  let active=autoFakeUnits.filter(u=>available[u]>0);

  // Water-filling: každá aktivní jednotka dostane podobný díl populačního rozpočtu.
  while(remaining>0&&active.length){
    let changed=false;
    const share=Math.max(1,Math.floor(remaining/active.length));
    for(const u of [...active]){
      const w=unitPop[u];
      const maxByBudget=Math.floor(Math.min(share,remaining)/w);
      const canTake=Math.min(available[u]-result[u],maxByBudget);
      if(canTake>0){
        result[u]+=canTake;
        remaining-=canTake*w;
        changed=true;
      }
      if(result[u]>=available[u]||remaining<w)active=active.filter(x=>x!==u);
      if(remaining<=0)break;
    }
    if(!changed)break;
  }

  // Doplnění zbytku od nejmenší populační jednotky bez překročení 1 %.
  for(const u of [...autoFakeUnits].sort((a,b)=>unitPop[a]-unitPop[b])){
    const w=unitPop[u];
    const canTake=Math.min(available[u]-result[u],Math.floor(remaining/w));
    if(canTake>0){result[u]+=canTake;remaining-=canTake*w}
  }

  const composition=Object.fromEntries(Object.entries(result).filter(([,a])=>a>0));
  const usedPopulation=Object.entries(composition).reduce((s,[u,a])=>s+a*unitPop[u],0);
  return {composition,budget,usedPopulation};
}
function unitComposition(village){
  const t=state.settings.fakeType;
  if(t==="auto1pct")return autoOnePercentComposition(village);
  if(t==="ram")return {composition:{ram:1},budget:5,usedPopulation:5};
  if(t==="catapult")return {composition:{catapult:1},budget:8,usedPopulation:8};
  if(t==="spy")return {composition:{spy:1},budget:2,usedPopulation:2};
  if(t==="noble")return {composition:{snob:1},budget:100,usedPopulation:100};
  const u=state.settings.customUnit||"ram";
  const amount=clamp(Number(state.settings.customAmount)||1,1,99999);
  return {composition:{[u]:amount},budget:amount*(unitPop[u]||1),usedPopulation:amount*(unitPop[u]||1)};
}
function slowestUnit(comp){
  return Object.keys(comp).sort((a,b)=>(unitMinutes[b]||999)-(unitMinutes[a]||999))[0];
}
function travelMs(source,target,unit){
  const mins=(unitMinutes[unit]||30)*distance(source,target)/(worldSpeed()*unitSpeed());
  return mins*60*1000;
}
function arrivalCandidates(from,to){
  const step=1000;
  const out=[];
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return out;
  const span=to-from;
  if(span<=180000){
    for(let t=from;t<=to;t+=step)out.push(t);
  }else{
    const count=180;
    for(let i=0;i<=count;i++)out.push(Math.round(from+span*(i/count)));
  }
  return out;
}
function shuffled(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

async function fetchText(url){
  const r=await fetch(url,{credentials:"same-origin"});
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${url}`);
  return await r.text();
}
function parseGroups(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const groups=[];
  $$('a[href*="group="]',doc).forEach(a=>{
    const u=new URL(a.href,location.href);
    const id=u.searchParams.get("group");
    const name=a.textContent.trim();
    if(id&&name&&!/^\d+$/.test(name))groups.push({id,name});
  });
  $$('option[value]',doc).forEach(o=>{
    if(/^\d+$/.test(o.value)&&o.textContent.trim())groups.push({id:o.value,name:o.textContent.trim()});
  });
  return uniqBy(groups,g=>g.id);
}
function parseVillageRows(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const out=[];
  $$("tr",doc).forEach(tr=>{
    const text=tr.textContent||"";
    const c=parseCoords(text)[0];
    if(!c)return;
    const links=$$('a[href*="village="]',tr);
    let id="";
    for(const a of links){
      const v=new URL(a.href,location.href).searchParams.get("village");
      if(v&&/^\d+$/.test(v)){id=v;break}
    }
    if(!id)return;
    const unitCell=u=>num($(`[data-unit="${u}"]`,tr)?.textContent||$(`td.unit-item-${u}`,tr)?.textContent||0);
    const units={};
    Object.keys(unitMinutes).forEach(u=>units[u]=unitCell(u));

    // Body vesnice: preferujeme buňku s class obsahující "points".
    // Fallback bere první rozumnou hodnotu 100–200000 z řádku, která není ID ani souřadnice.
    let points=num($('td[class*="points"],span[class*="points"],[data-field="points"]',tr)?.textContent||0);
    if(!points){
      const numbers=(text.match(/\b\d{3,6}\b/g)||[]).map(Number)
        .filter(n=>n>=100&&n<=200000&&String(n)!==String(id)&&!c.split("|").includes(String(n)));
      points=numbers.length?Math.max(...numbers):0;
    }
    out.push({id,coord:c,points,units});
  });
  return uniqBy(out,v=>v.coord);
}
async function loadGroups(){
  setBusy(true,"Načítám skupiny…");
  try{
    const village=gameVillageId();
    const urls=[
      `${gameBase()}/game.php?village=${village}&screen=overview_villages&mode=combined`,
      `${gameBase()}/game.php?village=${village}&screen=overview_villages`
    ];
    let groups=[];
    for(const u of urls){
      try{groups=parseGroups(await fetchText(u));if(groups.length)break}catch{}
    }
    state.groups=groups;
    renderGroups();
    toast(`Načteno skupin: ${groups.length}`,"success");
  }catch(e){toast(e.message,"error")}finally{setBusy(false)}
}
async function loadVillages(){
  const selected=$$('input[name="fcGroup"]:checked').map(x=>x.value);
  if(!selected.length){toast("Vyber alespoň jednu skupinu.","error");return}
  setBusy(true,"Načítám vesnice ze skupin…");
  try{
    const village=gameVillageId();
    const all=[];
    for(const group of selected){
      const url=`${gameBase()}/game.php?village=${village}&screen=overview_villages&mode=units&type=complete&group=${encodeURIComponent(group)}&page=-1`;
      const html=await fetchText(url);
      all.push(...parseVillageRows(html));
      await sleep(120);
    }
    state.villages=uniqBy(all,v=>v.coord);
    state.settings.groups=selected;
    saveSettings();
    renderVillageStatus();
    toast(`Načteno vesnic: ${state.villages.length}`,"success");
  }catch(e){toast(e.message,"error")}finally{setBusy(false)}
}
function buildPlan(){
  syncSettings();
  const targets=parseCoords(state.settings.targetsText);
  const from=parseDateTime(state.settings.arrivalFrom);
  const to=parseDateTime(state.settings.arrivalTo);
  if(!state.villages.length){toast("Nejdříve načti zdrojové vesnice.","error");return}
  if(!targets.length){toast("Vlož cílové souřadnice.","error");return}
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from){toast("Zkontroluj interval dopadů.","error");return}
  const maxPerSource=clamp(Number(state.settings.maxPerSource)||1,1,5);
  const now=Date.now()+3000;
  const candidates=arrivalCandidates(from,to);
  const used=new Map();
  const targetCount=new Map();
  const sources=state.settings.distribution==="random"?shuffled(state.villages):[...state.villages];
  const pairs=[];
  for(const source of sources){
    for(const target of targets){
      const d=distance(source.coord,target);
      if(d>=Number(state.settings.minDistance||0)&&d<=Number(state.settings.maxDistance||999)){
        pairs.push({source,target,d});
      }
    }
  }
  if(state.settings.distribution==="nearest")pairs.sort((a,b)=>a.d-b.d);
  if(state.settings.distribution==="balanced")pairs.sort((a,b)=>(targetCount.get(a.target)||0)-(targetCount.get(b.target)||0)||a.d-b.d);
  if(state.settings.distribution==="random"){const x=shuffled(pairs);pairs.length=0;pairs.push(...x)}
  const plan=[];
  for(const p of pairs){
    const count=used.get(p.source.coord)||0;
    if(count>=maxPerSource)continue;

    const allocation=unitComposition(p.source);
    const comp=allocation.composition;
    if(!Object.keys(comp).length)continue;
    const slow=slowestUnit(comp);

    let times=state.settings.distribution==="random"?shuffled(candidates):candidates;
    let chosen=null;
    for(const arrival0 of times){
      const jitter=(Number(state.settings.randomSeconds)||0)*1000;
      const arrival=arrival0+(jitter?Math.round((Math.random()*2-1)*jitter):0);
      if(arrival<from||arrival>to)continue;
      const send=arrival-travelMs(p.source.coord,p.target,slow);
      if(send<=now||inBlocked(send))continue;
      chosen={arrival,send};break;
    }
    if(!chosen)continue;
    plan.push({...p,...chosen,composition:{...comp},unit:slow,status:"OK",fakeBudget:allocation.budget,usedPopulation:allocation.usedPopulation});
    used.set(p.source.coord,count+1);
    targetCount.set(p.target,(targetCount.get(p.target)||0)+1);
    if([...used.values()].reduce((a,b)=>a+b,0)>=state.villages.length*maxPerSource)break;
  }
  state.plan=plan.sort((a,b)=>a.send-b.send);
  renderPlan();
  if(!plan.length)toast("Nevznikl žádný platný útok. Rozšiř interval dopadů nebo zkontroluj noční blokaci.","error");
  else toast(`Plán vytvořen: ${plan.length} útoků`,"success");
}
function commandUrl(row){
  const [x,y]=row.target.split("|");
  const p=new URLSearchParams({village:row.source.id,screen:"place",target:row.target,x,y});
  Object.entries(row.composition).forEach(([u,a])=>p.set(u,a));
  return `${gameBase()}/game.php?${p.toString()}`;
}
function durationText(ms){
  const total=Math.max(0,Math.round(ms/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function bbcode(){
  if(!state.plan.length)return "";

  const targets=[...new Set(state.plan.map(r=>r.target))];
  const groups=state.settings.groups
    .map(id=>state.groups.find(g=>g.id===id)?.name||id)
    .join(", ");

  const unitLabel=state.settings.fakeType==="auto1pct"
    ?"Automaticky max. 1 % bodů: sekery, lehká, špeh, beranidla, katapulty"
    :state.settings.fakeType;

  const distributionLabels={
    balanced:"Rovnoměrně na cíle",
    nearest:"Nejbližší cíle",
    random:"Náhodně"
  };

  const lines=[
    `[b]Útok[/b]`,
    `[b]Dopad:[/b] ${state.settings.arrivalFrom} – ${state.settings.arrivalTo}`,
    `[b]Cíle:[/b] ${targets.map(c=>`[coord]${c}[/coord]`).join(", ")}`,
    `[b]Jednotka:[/b] ${unitLabel}`,
    `[b]Režim výběru:[/b] ${distributionLabels[state.settings.distribution]||state.settings.distribution}`,
    `[b]Skupina:[/b] ${groups||"-"}`,
    ``,
    `[table]`,
    `[**]Zdroj[||]Cíl[||]Vzd.[||]Doba[||]Čas odeslání[||]Jednotky[||]Akce[/**]`
  ];

  for(const r of state.plan){
    const source=`[coord]${r.source.coord}[/coord]`;
    const target=`[coord]${r.target}[/coord]`;
    const dist=r.d.toFixed(2);
    const duration=durationText(r.arrival-r.send);
    const send=formatDate(r.send);
    const units=Object.entries(r.composition)
      .map(([u,a])=>`[unit]${u}[/unit] ${a}`)
      .join(" ");
    const link=`[url=${commandUrl(r)}][b][color=#3333dd]ODESLAT[/color][/b][/url]`;

    lines.push(
      `[*]${source}[|]${target}[|]${dist}[|]${duration}[|]${send}[|]${units}[|]${link}`
    );
  }

  lines.push(`[/table]`);
  return lines.join("\n");
}
function csv(){
  const h=["source","points","target","distance","send","arrival","population_limit","population_used","units","url"];
  const rows=state.plan.map(r=>[r.source.coord,r.source.points||0,r.target,r.d.toFixed(2),formatDate(r.send),formatDate(r.arrival),r.fakeBudget||"",r.usedPopulation||"",Object.entries(r.composition).map(([u,a])=>`${u}:${a}`).join(" "),commandUrl(r)]);
  return [h,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
}
function download(name,text,type="text/plain"){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type}));
  a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);toast("Zkopírováno.","success")}
  catch{const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();toast("Zkopírováno.","success")}
}
function syncSettings(){
  const g=id=>$(id)?.value;
  state.settings.targetsText=g("#fcTargets")||"";
  state.settings.arrivalFrom=g("#fcArrivalFrom")||"";
  state.settings.arrivalTo=g("#fcArrivalTo")||"";
  state.settings.blockEnabled=$("#fcBlockEnabled").checked;
  state.settings.blockFrom=g("#fcBlockFrom")||"00:00";
  state.settings.blockTo=g("#fcBlockTo")||"07:00";
  state.settings.maxPerSource=clamp(Number(g("#fcMaxPerSource"))||1,1,5);
  state.settings.minDistance=Math.max(0,Number(g("#fcMinDistance"))||0);
  state.settings.maxDistance=Math.max(state.settings.minDistance,Number(g("#fcMaxDistance"))||999);
  state.settings.distribution=g("#fcDistribution")||"balanced";
  state.settings.fakeType=g("#fcFakeType")||"ram";
  state.settings.customUnit=g("#fcCustomUnit")||"ram";
  state.settings.customAmount=clamp(Number(g("#fcCustomAmount"))||1,1,99999);
  state.settings.randomSeconds=clamp(Number(g("#fcRandomSeconds"))||0,0,3600);
  saveSettings();
}
function setBusy(v,msg=""){
  state.loading=v;
  const s=$("#fcStatus");if(s)s.textContent=msg||(v?"Pracuji…":"Připraveno");
  $$(`#${APP_ID} button`).forEach(b=>b.disabled=v);
}
function renderGroups(){
  const box=$("#fcGroups");
  if(!box)return;
  if(!state.groups.length){box.innerHTML='<span class="muted">Skupiny zatím nejsou načtené.</span>';return}
  box.innerHTML=state.groups.map(g=>`<label><input type="checkbox" name="fcGroup" value="${esc(g.id)}" ${state.settings.groups.includes(g.id)?"checked":""}> ${esc(g.name)}</label>`).join("");
}
function renderVillageStatus(){
  const x=$("#fcVillageStatus");
  if(x){
    const withPoints=state.villages.filter(v=>v.points>0).length;
    x.innerHTML=`<b>${state.villages.length}</b> unikátních zdrojových vesnic · body načteny u <b>${withPoints}</b>.`;
  }
}
function renderPlan(){
  const tbody=$("#fcPlanBody");
  const summary=$("#fcSummary");
  if(!tbody||!summary)return;
  const used=new Map();
  state.plan.forEach(r=>used.set(r.source.coord,(used.get(r.source.coord)||0)+1));
  summary.innerHTML=`Útoky: <b>${state.plan.length}</b> · zdroje použité: <b>${used.size}</b> · cíle: <b>${new Set(state.plan.map(r=>r.target)).size}</b>`;
  const preview=$("#fcBBPreview");if(preview)preview.value=state.plan.length?bbcode():"";
  tbody.innerHTML=state.plan.map((r,i)=>`<tr>
<td>${i+1}</td><td><b>${esc(r.source.coord)}</b><div class="muted">body ${esc(r.source.points||"?")} · ID ${esc(r.source.id)}</div></td>
<td>${esc(r.target)}</td><td>${r.d.toFixed(2)}</td><td>${esc(formatDate(r.send))}</td><td>${esc(formatDate(r.arrival))}</td>
<td>${esc(Object.entries(r.composition).map(([u,a])=>`${u}:${a}`).join(" "))}<div class="muted">pop. ${esc(r.usedPopulation||"?")} / ${esc(r.fakeBudget||"?")}</div></td>
<td><a href="${esc(commandUrl(r))}" target="_blank"><b>ODESLAT</b></a></td></tr>`).join("");
}
function mount(){
  style();
  const now=new Date(Date.now()+3600000);
  const later=new Date(Date.now()+6*3600000);
  const localInput=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)};
  if(!state.settings.arrivalFrom)state.settings.arrivalFrom=localInput(now);
  if(!state.settings.arrivalTo)state.settings.arrivalTo=localInput(later);
  const el=document.createElement("div");el.id=APP_ID;
  el.innerHTML=`<div class="fc-head"><div class="fc-title">⚔️ Fake Commander ${VERSION}</div><div class="fc-actions"><button id="fcMin">–</button><button id="fcClose" class="danger">×</button></div></div>
<div class="fc-body"><div class="grid">
<div class="card half"><h3>1. Výběr skupin</h3><div id="fcGroups" class="group-list"></div><div class="toolbar"><button id="fcLoadGroups">Načíst skupiny</button><button id="fcLoadVillages" class="primary">Načíst vesnice z vybraných skupin</button></div><div id="fcVillageStatus" class="status">Zatím nebyly načteny zdrojové vesnice.</div></div>
<div class="card half"><h3>2. Cíle</h3><label>Souřadnice cílů</label><textarea id="fcTargets" placeholder="500|500&#10;501|501">${esc(state.settings.targetsText)}</textarea><div class="muted">Přijímá text, BBCode i seznam souřadnic.</div></div>
<div class="card third"><h3>3. Čas dopadu</h3><label>Dopad od</label><input id="fcArrivalFrom" type="datetime-local" value="${esc(state.settings.arrivalFrom)}"><label>Dopad do</label><input id="fcArrivalTo" type="datetime-local" value="${esc(state.settings.arrivalTo)}"><label>Náhodné rozhození ± sekund</label><input id="fcRandomSeconds" type="number" min="0" max="3600" value="${esc(state.settings.randomSeconds)}"></div>
<div class="card third"><h3>4. Neodesílat v noci</h3><label><input id="fcBlockEnabled" type="checkbox" style="width:auto" ${state.settings.blockEnabled?"checked":""}> Aktivní</label><div class="row"><div><label>Od</label><input id="fcBlockFrom" type="time" value="${esc(state.settings.blockFrom)}"></div><div><label>Do</label><input id="fcBlockTo" type="time" value="${esc(state.settings.blockTo)}"></div></div><div class="muted">Kontroluje čas odeslání, nikoli čas dopadu.</div></div>
<div class="card third"><h3>5. Limity a rozdělení</h3><label>Max. útoků z jedné vesnice</label><select id="fcMaxPerSource">${[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(state.settings.maxPerSource)===n?"selected":""}>${n}</option>`).join("")}</select><div class="row"><div><label>Min. vzdálenost</label><input id="fcMinDistance" type="number" min="0" value="${esc(state.settings.minDistance)}"></div><div><label>Max. vzdálenost</label><input id="fcMaxDistance" type="number" min="0" value="${esc(state.settings.maxDistance)}"></div></div><label>Rozdělení</label><select id="fcDistribution"><option value="balanced">Rovnoměrně na cíle</option><option value="nearest">Nejbližší cíle</option><option value="random">Náhodně</option></select></div>
<div class="card half"><h3>6. Typ faku</h3><label>Šablona</label><select id="fcFakeType"><option value="auto1pct">Automaticky max. 1 % bodů</option><option value="ram">1 beranidlo</option><option value="catapult">1 katapult</option><option value="spy">1 špeh</option><option value="noble">1 šlechtic</option><option value="custom">Vlastní jednotka</option></select><div class="row"><div><label>Vlastní jednotka</label><select id="fcCustomUnit">${Object.keys(unitMinutes).map(u=>`<option value="${u}">${u}</option>`).join("")}</select></div><div><label>Počet</label><input id="fcCustomAmount" type="number" min="1" value="${esc(state.settings.customAmount)}"></div></div></div>
<div class="card half"><h3>7. Vytvoření plánu</h3><div class="toolbar"><button id="fcBuild" class="primary">Vytvořit plán faků</button><button id="fcCopy">Kopírovat BBCode tabulku</button><button id="fcShowBB">Zobrazit BBCode</button><button id="fcCsv">Stáhnout CSV</button><button id="fcClear">Vymazat plán</button></div><div id="fcStatus" class="status">Připraveno</div><div id="fcSummary" class="status">Útoky: 0</div></div>
<div class="card"><h3>BBCode výstup</h3><textarea id="fcBBPreview" readonly style="min-height:130px" placeholder="Po vytvoření plánu klikni na Zobrazit BBCode."></textarea></div><div class="card"><h3>Plán</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Zdroj</th><th>Cíl</th><th>Vzd.</th><th>Odeslat</th><th>Dopad</th><th>Jednotky</th><th>Akce</th></tr></thead><tbody id="fcPlanBody"></tbody></table></div></div>
</div></div>`;
  document.body.appendChild(el);
  $("#fcDistribution").value=state.settings.distribution;
  $("#fcFakeType").value=state.settings.fakeType;
  $("#fcCustomUnit").value=state.settings.customUnit;
  renderGroups();renderVillageStatus();renderPlan();

  $("#fcLoadGroups").onclick=loadGroups;
  $("#fcLoadVillages").onclick=loadVillages;
  $("#fcBuild").onclick=buildPlan;
  $("#fcCopy").onclick=()=>copyText(bbcode());
  $("#fcShowBB").onclick=()=>{$("#fcBBPreview").value=bbcode();};
  $("#fcCsv").onclick=()=>download("fake_commander_plan.csv",csv(),"text/csv");
  $("#fcClear").onclick=()=>{state.plan=[];renderPlan()};
  $("#fcClose").onclick=()=>el.remove();
  $("#fcMin").onclick=()=>{$(".fc-body",el).hidden=!$(".fc-body",el).hidden};
  el.addEventListener("change",syncSettings);
  el.addEventListener("input",e=>{if(e.target.matches("input,textarea,select"))syncSettings()});

  const head=$(".fc-head",el);let drag=null;
  head.addEventListener("mousedown",e=>{if(e.target.closest("button"))return;const r=el.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top};e.preventDefault()});
  window.addEventListener("mousemove",e=>{if(!drag)return;el.style.left=`${clamp(e.clientX-drag.x,0,innerWidth-el.offsetWidth)}px`;el.style.top=`${clamp(e.clientY-drag.y,0,innerHeight-40)}px`});
  window.addEventListener("mouseup",()=>{if(drag){localStorage.setItem(POS_KEY,JSON.stringify({left:el.style.left,top:el.style.top}));drag=null}});
  try{const p=JSON.parse(localStorage.getItem(POS_KEY)||"{}");if(p.left)el.style.left=p.left;if(p.top)el.style.top=p.top}catch{}
}
mount();
})();