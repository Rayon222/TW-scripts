(() => {
  "use strict";

  const POPUP_NAME = "RayonTrainCatcherV54";
  const APP_ID = "rayon-train-catcher-v54";
  const STORAGE_KEY = "rayonTrainCatcherV54";

  // Launcher: open a persistent control window. The game stays in the original tab.
  if (!window.name || window.name !== POPUP_NAME) {
    const popup = window.open("", POPUP_NAME, "width=1120,height=760,resizable=yes,scrollbars=yes");
    if (!popup) {
      alert("Prohlížeč zablokoval ovládací okno. Povol vyskakovací okna pro Tribal Wars a spusť skript znovu.");
      return;
    }
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Rayon Train Catcher v5.4</title></head><body></body></html>`);
    popup.document.close();
    popup.name = POPUP_NAME;
    popup.opener = window;
    popup.focus();

    // Execute this same source inside the popup.
    const source = `(${arguments.callee.toString()})();`;
    popup.eval(source);
    return;
  }

  const gameWin = () => {
    if (!window.opener || window.opener.closed) throw new Error("Herní okno bylo zavřeno.");
    return window.opener;
  };
  const gameDoc = () => gameWin().document;

  document.getElementById(APP_ID)?.remove();

  const UNIT_LABELS = {
    spear: "Kopiník", sword: "Meč", axe: "Sekera", archer: "Luk",
    spy: "Špeh", light: "Lehká jízda", marcher: "Jízdní luk",
    heavy: "Těžká jízda", ram: "Beranidlo", catapult: "Katapult",
    knight: "Paladin", snob: "Šlechtic"
  };
  const UNIT_ORDER = ["spy", "spear", "sword", "axe", "archer", "light", "marcher", "heavy", "ram", "catapult", "knight", "snob"];

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const pad = (n, l=2) => String(n).padStart(l, "0");
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => [...r.querySelectorAll(s)];
  const coordFrom = (s) => String(s || "").match(/(\d{1,3})\|(\d{1,3})/)?.[0] || "";

  // Server clock is read directly from the game and advanced using performance.now().
  let serverBaseEpoch = 0;
  let perfBase = performance.now();

  const parseServerClock = () => {
    const d = qs("#serverDate", gameDoc())?.textContent?.trim() || "";
    const t = qs("#serverTime", gameDoc())?.textContent?.trim() || "";
    const dm = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    const tm = t.match(/(\d{1,2}):(\d{2}):(\d{2})(?::|\.)(\d{1,3})|(\d{1,2}):(\d{2}):(\d{2})/);
    if (!dm || !tm) return false;

    let h, m, s, ms;
    if (tm[1] !== undefined) {
      h=+tm[1]; m=+tm[2]; s=+tm[3]; ms=+(tm[4] || "0").padEnd(3,"0");
    } else {
      h=+tm[5]; m=+tm[6]; s=+tm[7]; ms=0;
    }
    serverBaseEpoch = Date.UTC(+dm[3], +dm[2]-1, +dm[1], h, m, s, ms);
    perfBase = performance.now();
    return true;
  };
  const serverNow = () => serverBaseEpoch + (performance.now() - perfBase);
  const formatClock = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(),3)}`;
  };
  const formatFull = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)}.${d.getUTCFullYear()} ${formatClock(ts)}`;
  };
  const formatDuration = (ms) => {
    const sign = ms < 0 ? "-" : "";
    let n = Math.abs(Math.round(ms));
    const h=Math.floor(n/3600000); n%=3600000;
    const m=Math.floor(n/60000); n%=60000;
    const s=Math.floor(n/1000);
    return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(n%1000,3)}`;
  };
  const parseArrival = (text) => {
    const s = String(text || "").replace(/\s+/g," ").trim();
    const full = s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\D+(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
    if (full) {
      const y=+full[3]<100?2000 + +full[3]:+full[3];
      return Date.UTC(y,+full[2]-1,+full[1],+full[4],+full[5],+full[6],+(full[7]||"0").padEnd(3,"0"));
    }
    const tm=s.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
    if (!tm) return NaN;
    const base=new Date(serverNow());
    let result=Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),base.getUTCDate(),+tm[1],+tm[2],+tm[3],+(tm[4]||"0").padEnd(3,"0"));
    if (result < serverNow()-3600000) result += 86400000;
    return result;
  };
  const currentVillage = () => {
    const gw=gameWin(), gd=gw.game_data;
    return {
      id:String(gd?.village?.id || new URLSearchParams(gw.location.search).get("village") || ""),
      coord:gd?.village?.coord || coordFrom(qs("#menu_row2",gameDoc())?.textContent),
      name:gd?.village?.name || ""
    };
  };
  const distance = (a,b) => {
    const x=coordFrom(a).split("|").map(Number), y=coordFrom(b).split("|").map(Number);
    return x.length===2&&y.length===2 ? Math.hypot(x[0]-y[0],x[1]-y[1]) : NaN;
  };

  const app=document.createElement("div");
  app.id=APP_ID;
  app.innerHTML=`
  <style>
    :root{color-scheme:dark}
    body{margin:0;background:#0b1117;color:#e7edf5;font:14px Arial,sans-serif}
    #${APP_ID}{min-height:100vh;background:linear-gradient(145deg,#0a1117,#111b24);padding:14px;box-sizing:border-box}
    #${APP_ID} *{box-sizing:border-box}
    .head{display:flex;align-items:center;gap:14px;padding:12px 16px;border:1px solid #384957;border-radius:12px;background:#101922}
    .title{font-size:20px;font-weight:800;flex:1}.server{text-align:right}.server small{color:#61e76a}.clock{font:800 28px monospace}
    button,input{font:inherit}.btn{border:1px solid #425567;border-radius:8px;background:#162431;color:#fff;padding:10px 14px;cursor:pointer}
    .btn:hover{filter:brightness(1.15)}.blue{background:#0966c9}.orange{background:#e87800}.purple{background:#6f22b6}.green{background:#167f31}
    .grid{display:grid;grid-template-columns:1.05fr 1.25fr .95fr;gap:12px;margin-top:12px}
    .card{border:1px solid #344757;border-radius:12px;background:#111b24;padding:12px;min-width:0}
    .card h2{margin:0 0 12px;font-size:17px}.blueText{color:#3aa0ff}.greenText{color:#66e86c}.orangeText{color:#ff9d21}.purpleText{color:#bd71ff}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.grow{flex:1}
    input[type=number]{width:76px;height:36px;background:#0a1219;color:#fff;border:1px solid #4d6578;border-radius:7px;text-align:center;font-weight:bold}
    .trainList{margin-top:10px;max-height:380px;overflow:auto}.train{display:block;padding:12px;border:1px solid #285f91;background:#0d3152;border-radius:9px;margin-bottom:8px}
    .units{display:grid;grid-template-columns:1fr 1fr;gap:8px}.unit{display:grid;grid-template-columns:1fr 72px;align-items:center;gap:8px;padding:9px;border:1px solid #265f36;border-radius:8px;background:#10251a}
    .unit span{font-weight:bold}.unit input{width:72px;border-color:#2f8e49}
    .action{padding:12px;border-radius:10px;border:1px solid #5a4630;background:#17130d;margin-bottom:10px;text-align:center}
    .bigTime{font:800 34px monospace;margin:8px 0}.exact{font:700 19px monospace;color:#dce4ec}.main{width:100%;font-size:20px;font-weight:800;padding:13px}
    .status{margin-top:12px;padding:12px;border:1px solid #365063;border-radius:10px;background:#0e1820}
    .bottom{display:grid;grid-template-columns:1.3fr 1fr;gap:12px;margin-top:12px}.history{width:100%;border-collapse:collapse}.history th,.history td{padding:7px;border-bottom:1px solid #293b49;text-align:left}
    .hint{color:#aebdca;font-size:12px}.state{font-size:20px;font-weight:800;color:#65e76d}
    @media(max-width:900px){.grid{grid-template-columns:1fr}.bottom{grid-template-columns:1fr}.units{grid-template-columns:1fr}}
  </style>
  <div class="head">
    <div class="title">🎯 RAYON TRAIN CATCHER v5.4 · <span id="village">---</span></div>
    <div class="server"><small>SERVEROVÝ ČAS</small><div id="clock" class="clock">--:--:--.---</div></div>
    <button id="focusGame" class="btn">HRA</button>
    <button id="close" class="btn">✕</button>
  </div>

  <div class="grid">
    <section class="card">
      <h2 class="blueText">1. VLAK</h2>
      <button id="load" class="btn blue" style="width:100%">↻ NAČÍST AUTOMATICKY</button>
      <div class="row" style="margin-top:10px"><span>Mezera vlaku</span><input id="gap" type="number" value="1800" min="100" step="100"><span>ms</span></div>
      <div id="trains" class="trainList"><div class="hint">Načítám útoky z herního okna…</div></div>
    </section>

    <section class="card">
      <h2 class="greenText">2. JEDNOTKY</h2>
      <div id="units" class="units"></div>
      <div class="row" style="margin-top:10px"><span>Návrat před útokem</span><input id="before" type="number" value="250" min="0" step="10"><span>ms</span></div>
      <div id="slowest" class="status hint">Vyber jednotky.</div>
    </section>

    <section>
      <div class="action">
        <h2 class="orangeText">3. ODESLAT</h2>
        <div class="hint">ODESLAT ZA</div><div id="sendCountdown" class="bigTime orangeText">PŘIPRAVENO</div>
        <div class="hint">PŘESNÝ SERVEROVÝ ČAS ODESLÁNÍ</div><div id="sendExact" class="exact">--:--:--.---</div>
        <button id="prepareSend" class="btn orange main">PŘIPRAVIT ODESLÁNÍ</button>
      </div>
      <div class="action">
        <h2 class="purpleText">4. NÁVRAT</h2>
        <div class="hint">NÁVRAT ZA</div><div id="returnCountdown" class="bigTime purpleText">--:--:--.---</div>
        <div class="hint">PŘESNÝ SERVEROVÝ ČAS NÁVRATU</div><div id="returnExact" class="exact">--:--:--.---</div>
        <button id="prepareReturn" class="btn purple main" disabled>PŘIPRAVIT NÁVRAT</button>
      </div>
    </section>
  </div>

  <div id="status" class="status">Spouštím…</div>

  <div class="bottom">
    <section class="card"><h2>🏆 VÝSLEDKY</h2><table class="history"><thead><tr><th>Vlak / útok</th><th>Dopad</th><th>Stav</th></tr></thead><tbody id="history"></tbody></table></section>
    <section class="card"><h2>◎ STAV</h2><div id="state" class="state">PŘIPRAVEN</div><p id="stateText" class="hint">Ovládací okno zůstane otevřené. Herní stránka se mění v původním tabu.</p><div id="resultButtons" class="row" style="display:none"><button id="caught" class="btn green grow">✓ CHYCEN</button><button id="missed" class="btn grow">✗ NECHYCEN</button></div></section>
  </div>`;
  document.body.appendChild(app);

  const $=s=>qs(s,app);
  let attacks=[],trains=[],units=[],selectedKey="",active=null,timer=null,lastGameHref="";

  const status=(t,err=false)=>{ $("#status").textContent=t; $("#status").style.borderColor=err?"#a83d3d":"#365063"; };
  const state=(title,text)=>{ $("#state").textContent=title; $("#stateText").textContent=text; };
  const focusGame=()=>{ try{gameWin().focus();}catch{} };

  const syncClock=()=>{
    try {
      if (!serverBaseEpoch || gameWin().location.href!==lastGameHref) {
        lastGameHref=gameWin().location.href;
        parseServerClock();
        $("#village").textContent=currentVillage().coord || "---";
      }
      $("#clock").textContent=formatClock(serverNow());
    } catch(e) { $("#clock").textContent="HRA ODPOJENA"; }
  };
  setInterval(syncClock,31); syncClock();
  setInterval(()=>{ try{parseServerClock();}catch{} },10000);

  const loadUnits=async()=>{
    const parser=new DOMParser();
    const gw=gameWin();
    const [cfgText,unitText]=await Promise.all([
      gw.fetch("/interface.php?func=get_config",{credentials:"same-origin"}).then(r=>r.text()),
      gw.fetch("/interface.php?func=get_unit_info",{credentials:"same-origin"}).then(r=>r.text())
    ]);
    const cfg=parser.parseFromString(cfgText,"text/xml"), ud=parser.parseFromString(unitText,"text/xml");
    const worldSpeed=Number(cfg.querySelector("unit_speed")?.textContent||1);
    units=[...ud.documentElement.children].map(n=>({id:n.tagName,speed:Number(n.querySelector("speed")?.textContent||0)/worldSpeed}))
      .filter(u=>u.speed>0&&UNIT_ORDER.includes(u.id)).sort((a,b)=>UNIT_ORDER.indexOf(a.id)-UNIT_ORDER.indexOf(b.id));
    $("#units").innerHTML=units.map(u=>`<label class="unit"><span>${esc(UNIT_LABELS[u.id]||u.id)}</span><input data-unit="${u.id}" type="number" min="0" value="${u.id==="spy"?5:0}"></label>`).join("");
    qsa("[data-unit]",app).forEach(i=>i.addEventListener("input",updateSlowest));
    updateSlowest();
  };
  const selectedUnits=()=>units.map(u=>({...u,count:Math.max(0,Math.floor(Number(qs(`[data-unit="${u.id}"]`,app)?.value||0)))})).filter(u=>u.count>0);
  const selectedAttack=()=>attacks.find(a=>a.key===selectedKey);
  const updateSlowest=()=>{
    const chosen=selectedUnits(), a=selectedAttack();
    if(!chosen.length){$("#slowest").textContent="Vyber alespoň jednu jednotku.";return null;}
    const slow=chosen.reduce((x,y)=>x.speed>=y.speed?x:y);
    const dist=a?.originCoord?distance(currentVillage().coord,a.originCoord):NaN;
    const travel=Number.isFinite(dist)?dist*slow.speed*60000:NaN;
    $("#slowest").textContent=`Nejpomalejší jednotka: ${UNIT_LABELS[slow.id]||slow.id} (${slow.speed} min/pole)`+(Number.isFinite(travel)?` · cesta ${formatDuration(travel)}`:"");
    return {slow,travel};
  };

  const rowLooksAttack=row=>{
    const txt=(row.textContent||"").toLowerCase(), html=row.innerHTML.toLowerCase();
    return /útok|utok|attack/.test(txt+" "+html)&&(row.querySelector('a[href*="info_command"],a[href*="command"],.timer,[data-endtime]')||coordFrom(txt));
  };
  const arrivalFromRow=row=>{
    const timer=qs("[data-endtime]",row), end=Number(timer?.dataset?.endtime||0);
    if(end>1e12)return end;if(end>1e9)return end*1000;
    for(const c of [timer?.title,row.title,qsa("[title]",row).map(x=>x.title).join(" "),row.textContent]){const p=parseArrival(c);if(Number.isFinite(p))return p;}
    return NaN;
  };
  const detailLink=row=>{const a=qs('a[href*="info_command"],a[href*="command_id"],a[href*="id="]',row);return a?new URL(a.getAttribute("href"),gameWin().location.href).href:"";};
  const fetchOrigin=async(url,target)=>{
    if(!url)return "";
    try{const html=await gameWin().fetch(url,{credentials:"same-origin"}).then(r=>r.text());const d=new DOMParser().parseFromString(html,"text/html");const cs=[...new Set(d.body.textContent.match(/\d{1,3}\|\d{1,3}/g)||[])];return cs.find(c=>c!==target)||cs[0]||"";}catch{return "";}
  };
  const group=()=>{
    const gap=Math.max(100,Number($("#gap").value)||1800);trains=[];
    for(const a of attacks){const last=trains.at(-1),same=!last||!last.originCoord||!a.originCoord||last.originCoord===a.originCoord;
      if(!last||!same||a.arrival-last.attacks.at(-1).arrival>gap)trains.push({index:trains.length+1,originCoord:a.originCoord,attacks:[a]});else last.attacks.push(a);}
  };
  const loadAttacks=async()=>{
    parseServerClock();
    const gd=gameDoc(), target=currentVillage().coord;
    status("Načítám příchozí útoky z herního okna…");
    const rows=qsa("tr",gd).filter(rowLooksAttack);
    const found=rows.map((r,i)=>{const arrival=arrivalFromRow(r),url=detailLink(r),coords=[...new Set((r.textContent||"").match(/\d{1,3}\|\d{1,3}/g)||[])];return{key:url||`${arrival}-${i}`,arrival,detailUrl:url,originCoord:coords.find(c=>c!==target)||"",result:""};})
      .filter(a=>Number.isFinite(a.arrival)&&a.arrival>serverNow()-5000).sort((a,b)=>a.arrival-b.arrival);
    if(!found.length){attacks=[];trains=[];render();status("V herním okně nejsou viditelné příchozí útoky. Otevři přehled napadené vesnice a klikni Načíst.",true);return;}
    await Promise.all(found.map(async a=>{if(!a.originCoord)a.originCoord=await fetchOrigin(a.detailUrl,target);}));
    attacks=found;group();if(!attacks.some(a=>a.key===selectedKey))selectedKey=attacks[0].key;render();updateSlowest();
    status(`Nalezeno ${attacks.length} útoků v ${trains.length} vlaku/vlacích.`);
  };
  const render=()=>{
    $("#trains").innerHTML=trains.length?trains.map(t=>t.attacks.map((a,i)=>`<label class="train"><input type="radio" name="attack" value="${esc(a.key)}" ${a.key===selectedKey?"checked":""}> <b>Vlak ${t.index} · útok ${i+1}/${t.attacks.length}</b><br><span class="hint">${formatFull(a.arrival)} · z ${esc(a.originCoord||"?")}</span></label>`).join("")).join(""):`<div class="hint">Žádné útoky.</div>`;
    qsa('input[name="attack"]',app).forEach(r=>r.onchange=()=>{selectedKey=r.value;updateSlowest();renderHistory();});
    renderHistory();
  };
  const renderHistory=()=>{
    const all=trains.flatMap(t=>t.attacks.map((a,i)=>({t:t.index,n:i+1,a})));
    $("#history").innerHTML=all.length?all.map(x=>`<tr><td>Vlak ${x.t}/${x.n}</td><td>${formatClock(x.a.arrival)}</td><td>${x.a.result==="caught"?"✅ chycen":x.a.result==="missed"?"❌ nechycen":x.a.key===selectedKey?"▶ vybrán":"⏳ čeká"}</td></tr>`).join(""):`<tr><td colspan="3">Bez výsledků.</td></tr>`;
  };

  const waitForGameLoad=(callback)=>{
    let last="";
    const id=setInterval(()=>{
      try{
        const href=gameWin().location.href;
        if(href!==last){last=href;return;}
        if(gameDoc().readyState==="complete"){clearInterval(id);parseServerClock();callback();}
      }catch{}
    },150);
  };
  const findButton=(words)=>{
    return qsa('button,input[type="submit"],input[type="button"],a',gameDoc()).find(el=>{
      const txt=`${el.textContent||""} ${el.value||""} ${el.title||""}`.toLowerCase();
      return el.offsetParent!==null&&words.some(w=>txt.includes(w));
    });
  };
  const highlight=el=>{
    if(!el)return false;
    el.style.setProperty("outline","5px solid #ff7a00","important");el.style.setProperty("box-shadow","0 0 22px #ff7a00","important");
    el.scrollIntoView({block:"center"});el.focus();focusGame();return true;
  };
  const fillCourtyard=(attack)=>{
    const chosen=selectedUnits();
    for(const u of chosen){const input=qs(`input[name="${CSS.escape(u.id)}"]`,gameDoc());if(input)input.value=String(u.count);}
    const [x,y]=attack.originCoord.split("|");
    const xi=qs('input[name="x"]',gameDoc()), yi=qs('input[name="y"]',gameDoc());
    if(xi&&yi){xi.value=x;yi.value=y;}
    const btn=findButton(["zaútočit","zautocit","attack"]);
    if(btn)highlight(btn);
  };

  const prepareSend=()=>{
    const attack=selectedAttack(), info=updateSlowest();
    if(!attack)return status("Vyber útok.",true);
    if(!attack.originCoord)return status("Neznám původ útoku.",true);
    if(!info||!Number.isFinite(info.travel))return status("Nelze vypočítat cestu.",true);

    // The send time cannot be known exactly until the real manual send occurs.
    // We therefore prepare the courtyard and record the exact moment with a manual confirmation button.
    active={attack,travel:info.travel,targetReturn:attack.arrival-Math.max(0,Number($("#before").value)||0),actualSend:null,cancelAt:null};
    $("#sendCountdown").textContent="RUČNĚ";
    $("#sendExact").textContent="potvrď po odeslání";
    state("NÁDVOŘÍ","Hra se přepíná do nádvoří. Panel zůstává otevřený v tomto okně.");
    const v=currentVillage(), [x,y]=attack.originCoord.split("|");
    gameWin().location.href=`/game.php?village=${encodeURIComponent(v.id)}&screen=place&x=${x}&y=${y}`;
    waitForGameLoad(()=>{
      fillCourtyard(attack);
      $("#prepareSend").textContent="ODESLÁNO – ZAZNAMENAT ČAS";
      $("#prepareSend").onclick=recordSent;
      status("Nádvoří je připravené v herním tabu. Odešli ručně Enterem a hned klikni zde na ODESLÁNO.");
    });
  };
  const recordSent=()=>{
    if(!active)return;
    active.actualSend=serverNow();
    active.cancelAt=Math.round((active.targetReturn+active.actualSend)/2);
    const outward=active.cancelAt-active.actualSend;
    if(outward<=0)return status("Na tento útok je už pozdě.",true);
    if(outward>=active.travel)return status("Příkaz by došel do cíle dříve než zrušení. Vyber pozdější útok nebo pomalejší jednotku.",true);
    $("#sendExact").textContent=formatClock(active.actualSend);
    $("#returnExact").textContent=formatClock(active.cancelAt);
    $("#prepareReturn").disabled=false;
    $("#prepareSend").disabled=true;
    state("ČEKÁM NA NÁVRAT",`Přesný návrat: ${formatClock(active.cancelAt)}`);
    startTimers();
  };
  const startTimers=()=>{
    clearInterval(timer);
    timer=setInterval(()=>{
      if(!active?.cancelAt)return;
      const rem=active.cancelAt-serverNow();
      $("#returnCountdown").textContent=rem>0?formatDuration(rem):"ENTER";
      if(rem<=1500&&rem>-10000){
        $("#prepareReturn").classList.add("purple");
      }
    },31);
  };
  const prepareReturn=()=>{
    if(!active)return;
    const v=currentVillage();
    gameWin().location.href=`/game.php?village=${encodeURIComponent(v.id)}&screen=overview`;
    state("NÁVRAT","Hledám skutečné tlačítko Zrušit v herním tabu.");
    waitForGameLoad(()=>{
      const cancel=findButton(["zrušit","zrusit","cancel"]);
      if(cancel){
        highlight(cancel);
        status("Tlačítko ZRUŠIT je zvýrazněné v herním tabu. Potvrď ho ručně Enterem.");
        $("#resultButtons").style.display="flex";
      } else status("Tlačítko ZRUŠIT jsem nenašel. Otevři odchozí příkazy v herním tabu.",true);
    });
  };
  const finish=result=>{
    if(!active)return;
    active.attack.result=result;
    const flat=trains.flatMap(t=>t.attacks), idx=flat.indexOf(active.attack);
    renderHistory();
    clearInterval(timer);
    $("#resultButtons").style.display="none";
    $("#prepareSend").disabled=false;$("#prepareSend").textContent="PŘIPRAVIT ODESLÁNÍ";$("#prepareSend").onclick=prepareSend;
    $("#prepareReturn").disabled=true;
    $("#sendCountdown").textContent="PŘIPRAVENO";$("#sendExact").textContent="--:--:--.---";
    $("#returnCountdown").textContent="--:--:--.---";$("#returnExact").textContent="--:--:--.---";
    const next=flat[idx+1];
    if(result==="missed"&&next){
      selectedKey=next.key;active=null;render();updateSlowest();
      state("DALŠÍ POKUS","Předvybral jsem následující útok a ponechal stejné jednotky.");
      status("Nechycen. Další útok byl automaticky vybrán a časy se přepočítají při novém odeslání.");
    } else {
      active=null;state(result==="caught"?"CHYCEN":"HOTOVO",result==="caught"?"Vlak byl označen jako chycen.":"Další útok není dostupný.");
    }
  };

  $("#load").onclick=()=>loadAttacks().catch(e=>status(e.message,true));
  $("#gap").onchange=()=>{group();render();};
  $("#focusGame").onclick=focusGame;
  $("#close").onclick=()=>window.close();
  $("#prepareSend").onclick=prepareSend;
  $("#prepareReturn").onclick=prepareReturn;
  $("#caught").onclick=()=>finish("caught");
  $("#missed").onclick=()=>finish("missed");

  (async()=>{
    try{
      parseServerClock();
      await loadUnits();
      await loadAttacks();
      state("PŘIPRAVEN","Ovládací panel zůstává v tomto okně; herní tab se může přepínat.");
    }catch(e){status(`Spuštění selhalo: ${e.message}`,true);console.error("[Rayon v5.4]",e);}
  })();
})();