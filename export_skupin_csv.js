
(async()=>{
if(document.getElementById("mkcsv"))return;
const P=new DOMParser();
const get=u=>fetch(u,{credentials:"same-origin"}).then(r=>r.text());
const c=s=>String(s||"").replace(/\s+/g," ").trim();
const coord=t=>(String(t).match(/(\d{1,3}\|\d{1,3})/)||[])[1];

const box=document.createElement("div");
box.id="mkcsv";
box.style="position:fixed;top:5%;left:50%;transform:translateX(-50%);z-index:99999;background:#f4e4bc;border:3px solid #7d510f;padding:12px;width:500px";
box.innerHTML=`<b>Export skupin do CSV</b><br><select id=g multiple size=12 style="width:100%"></select><br><button id=a>Vše</button> <button id=e>Exportovat do CSV</button> <button id=x>Zavřít</button><div id=m></div>`;
document.body.append(box);
const $=s=>box.querySelector(s);
$("#x").onclick=()=>box.remove();

const groups=new Map();
function add(doc){
doc.querySelectorAll('a[href*="group="]').forEach(a=>{
let id=(a.href.match(/group=(\d+)/)||[])[1];
let n=c(a.textContent);
if(id&&n)groups.set(id,n);
});
}
for(const u of ["/game.php?screen=groups","/game.php?screen=overview_villages&mode=combined"]){
try{add(P.parseFromString(await get(u),"text/html"));}catch(e){}
}
$("#g").innerHTML=[...groups].sort((a,b)=>a[1].localeCompare(b[1])).map(([i,n])=>`<option value="${i}">${n}</option>`).join("");
$("#a").onclick=()=>[...$("#g").options].forEach(o=>o.selected=true);

$("#e").onclick=async()=>{
let rows=[["Skupina","ID vesnice","Nazev","Souradnice"]];
for(const o of [...$("#g").selectedOptions]){
$("#m").textContent="Načítám "+o.textContent;
let html=await get(`/game.php?screen=overview_villages&mode=combined&group=${o.value}&page=-1`);
let doc=P.parseFromString(html,"text/html");
let seen=new Set();
doc.querySelectorAll("tr").forEach(tr=>{
let cd=coord(tr.textContent);
if(!cd)return;
let links=[...tr.querySelectorAll('a[href*="village="]')];
let a=links.find(l=>c(l.textContent).includes(cd));
if(!a)return;
let id=(a.href.match(/village=(\d+)/)||[])[1];
if(!id||seen.has(id))return;
seen.add(id);
let name=c(a.textContent).replace(cd,"").replace(/[()\-–]/g,"").trim();
if(/hlavn/i.test(name))name="";
rows.push([o.textContent,id,name,cd]);
});
}
let csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
let blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
let a=document.createElement("a");
a.href=URL.createObjectURL(blob);
a.download="export_skupin.csv";
a.click();
URL.revokeObjectURL(a.href);
$("#m").textContent=`Hotovo (${rows.length-1} vesnic).`;
};
})();
