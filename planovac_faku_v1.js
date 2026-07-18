(() => {
  "use strict";

  const APP_ID = "rayon-fake-planner-v1";
  document.getElementById(APP_ID)?.remove();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const coord = (s) => String(s || "").match(/\b\d{1,3}\|\d{1,3}\b/)?.[0] || "";
  const toXY = (c) => c.split("|").map(Number);
  const distance = (a, b) => {
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    return Math.hypot(ax - bx, ay - by);
  };
  const gameData = window.game_data || {};

  const currentScreen = gameData.screen || new URLSearchParams(location.search).get("screen") || "";
  if (currentScreen !== "overview_villages") {
    const villageId = gameData.village?.id || new URLSearchParams(location.search).get("village") || "";
    if (confirm("Planner potřebuje Přehled vesnic. Přepnout tam? Po načtení spusť skript znovu.")) {
      location.href = `/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=combined`;
    }
    return;
  }

  const formatDateTime = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const formatInput = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const parseHM = (value) => {
    const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const isBlocked = (ts, fromMin, toMin) => {
    if (fromMin === toMin) return false;
    const d = new Date(ts);
    const m = d.getHours() * 60 + d.getMinutes();
    return fromMin < toMin ? (m >= fromMin && m < toMin) : (m >= fromMin || m < toMin);
  };
  const seededRandom = (seed) => {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  };

  function readVillages() {
    const rows = $$("tr").filter((row) => coord(row.textContent));
    const seen = new Set();
    const villages = [];
    for (const row of rows) {
      const c = coord(row.textContent);
      if (!c || seen.has(c)) continue;
      const link = row.querySelector('a[href*="village="]');
      const id = link ? new URL(link.href, location.href).searchParams.get("village") : "";
      const name = (row.querySelector(".quickedit-label")?.textContent || link?.textContent || c).trim();
      seen.add(c);
      villages.push({ id, coord: c, name });
    }
    return villages;
  }

  function readGroups() {
    const select = $("#group_select") || $('select[name="group"]') || $('select[id*="group"]');
    if (!select) return [];
    return [...select.options].map((o) => ({ value: o.value, text: o.textContent.trim(), selected: o.selected }));
  }

  const panel = document.createElement("div");
  panel.id = APP_ID;
  panel.innerHTML = `
  <style>
    #${APP_ID}{position:fixed;z-index:99999;top:24px;left:50%;transform:translateX(-50%);width:min(1200px,96vw);max-height:92vh;overflow:auto;background:#101820;color:#edf4f8;border:1px solid #41596a;border-radius:14px;box-shadow:0 18px 60px #000b;font:14px Arial,sans-serif}
    #${APP_ID} *{box-sizing:border-box}
    #${APP_ID} .head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;padding:14px 16px;background:#0b1218;border-bottom:1px solid #344958}
    #${APP_ID} h1{font-size:20px;margin:0;flex:1}
    #${APP_ID} .body{padding:14px}
    #${APP_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    #${APP_ID} .card{background:#17232d;border:1px solid #344b5c;border-radius:11px;padding:12px}
    #${APP_ID} h2{font-size:16px;margin:0 0 10px;color:#5eb2ff}
    #${APP_ID} label{display:block;margin:8px 0 4px;color:#c4d1da}
    #${APP_ID} input,#${APP_ID} textarea,#${APP_ID} select{width:100%;background:#0c141b;color:#fff;border:1px solid #456073;border-radius:7px;padding:9px}
    #${APP_ID} textarea{min-height:125px;resize:vertical;font-family:monospace}
    #${APP_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #${APP_ID} .units{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    #${APP_ID} .btn{border:1px solid #4c6578;border-radius:8px;background:#1a2a37;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
    #${APP_ID} .primary{background:#0873d1}
    #${APP_ID} .danger{background:#8c2b2b}
    #${APP_ID} .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
    #${APP_ID} .info{padding:10px;border:1px solid #355166;border-radius:8px;background:#0d1922;margin-top:10px}
    #${APP_ID} table{width:100%;border-collapse:collapse;font-size:12px}
    #${APP_ID} th,#${APP_ID} td{padding:7px;border-bottom:1px solid #2e4352;text-align:left;white-space:nowrap}
    #${APP_ID} .tableWrap{overflow:auto;max-height:420px}
    #${APP_ID} .bad{color:#ff7777}.ok{color:#70e589}
    #${APP_ID} .hint{font-size:12px;color:#9fb0bc}
    @media(max-width:800px){#${APP_ID} .grid{grid-template-columns:1fr}#${APP_ID} .units{grid-template-columns:1fr 1fr}}
  </style>
  <div class="head">
    <h1>🎭 Rayon Fake Planner v1</h1>
    <button class="btn danger" id="rfpClose">Zavřít</button>
  </div>
  <div class="body">
    <div class="grid">
      <section class="card">
        <h2>1. Zdrojové vesnice</h2>
        <label>Skupina</label>
        <select id="rfpGroup"></select>
        <div id="rfpVillageInfo" class="info"></div>
        <div class="hint">Skupinu vyber v herním přehledu. Skript používá všechny vesnice viditelné v aktuálně zobrazené skupině.</div>

        <h2 style="margin-top:14px">2. Cíle</h2>
        <label>Jedna souřadnice na řádek</label>
        <textarea id="rfpTargets" placeholder="500|500\n501|500\n502|501"></textarea>
      </section>

      <section class="card">
        <h2>3. Okno dopadu</h2>
        <div class="row">
          <div><label>Dopad od</label><input id="rfpArrivalFrom" type="datetime-local"></div>
          <div><label>Dopad do</label><input id="rfpArrivalTo" type="datetime-local"></div>
        </div>

        <h2 style="margin-top:14px">4. Neposílat v noci</h2>
        <div class="row">
          <div><label>Blokace od</label><input id="rfpNightFrom" type="time" value="00:00"></div>
          <div><label>Blokace do</label><input id="rfpNightTo" type="time" value="07:00"></div>
        </div>

        <h2 style="margin-top:14px">5. Složení faku</h2>
        <div class="units">
          <div><label>Kopiník</label><input id="u_spear" type="number" min="0" value="0"></div>
          <div><label>Meč</label><input id="u_sword" type="number" min="0" value="0"></div>
          <div><label>Sekera</label><input id="u_axe" type="number" min="0" value="1"></div>
          <div><label>Špeh</label><input id="u_spy" type="number" min="0" value="0"></div>
          <div><label>Lehká</label><input id="u_light" type="number" min="0" value="0"></div>
          <div><label>Těžká</label><input id="u_heavy" type="number" min="0" value="0"></div>
          <div><label>Beranidlo</label><input id="u_ram" type="number" min="0" value="0"></div>
          <div><label>Katapult</label><input id="u_catapult" type="number" min="0" value="0"></div>
        </div>

        <div class="row" style="margin-top:10px">
          <div><label>Faků na zdrojovou vesnici</label><input id="rfpPerVillage" type="number" min="1" value="1"></div>
          <div><label>Min. rozestup odeslání z jedné vesnice (s)</label><input id="rfpMinSendGap" type="number" min="0" value="3"></div>
        </div>
        <div class="row">
          <div><label>Rozložení dopadů</label><select id="rfpDistribution"><option value="even">Rovnoměrné</option><option value="random">Náhodné</option></select></div>
          <div><label>Náhodný seed</label><input id="rfpSeed" type="number" value="12345"></div>
        </div>
      </section>
    </div>

    <div class="actions">
      <button id="rfpBuild" class="btn primary">VYPOČÍTAT PLÁN</button>
      <button id="rfpCopy" class="btn">KOPÍROVAT BB-CODE</button>
      <button id="rfpCsv" class="btn">STÁHNOUT CSV</button>
    </div>

    <div id="rfpStatus" class="info">Připraveno.</div>
    <div class="card" style="margin-top:12px">
      <h2>Výsledný plán</h2>
      <div class="tableWrap">
        <table>
          <thead><tr><th>#</th><th>Zdroj</th><th>Cíl</th><th>Odeslat</th><th>Dopad</th><th>Nejpomalejší</th><th>Akce</th></tr></thead>
          <tbody id="rfpResults"></tbody>
        </table>
      </div>
    </div>
  </div>`;
  document.body.appendChild(panel);

  const P = (s) => $(s, panel);
  const groups = readGroups();
  P("#rfpGroup").innerHTML = groups.length
    ? groups.map((g) => `<option value="${esc(g.value)}" ${g.selected ? "selected" : ""}>${esc(g.text)}</option>`).join("")
    : `<option value="">Aktuálně zobrazená skupina</option>`;

  const now = Date.now();
  P("#rfpArrivalFrom").value = formatInput(now + 3600000);
  P("#rfpArrivalTo").value = formatInput(now + 7200000);

  let plan = [];
  let unitInfo = {};

  function saveSettings() {
    const ids = ["rfpTargets","rfpArrivalFrom","rfpArrivalTo","rfpNightFrom","rfpNightTo","rfpPerVillage","rfpMinSendGap","rfpDistribution","rfpSeed","u_spear","u_sword","u_axe","u_spy","u_light","u_heavy","u_ram","u_catapult"];
    const data = Object.fromEntries(ids.map((id) => [id, P(`#${id}`).value]));
    localStorage.setItem("rayonFakePlannerV1", JSON.stringify(data));
  }

  function loadSettings() {
    try {
      const data = JSON.parse(localStorage.getItem("rayonFakePlannerV1") || "null");
      if (!data) return;
      for (const [id, value] of Object.entries(data)) {
        const el = P(`#${id}`);
        if (el) el.value = value;
      }
    } catch {}
  }
  loadSettings();

  async function loadUnitInfo() {
    const xml = await fetch("/interface.php?func=get_unit_info", { credentials: "same-origin" }).then((r) => r.text());
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    for (const node of [...doc.documentElement.children]) {
      unitInfo[node.tagName] = Number(node.querySelector("speed")?.textContent || 0);
    }
  }

  function selectedComposition() {
    const ids = ["spear","sword","axe","spy","light","heavy","ram","catapult"];
    return ids.map((id) => ({ id, count: Math.max(0, Math.floor(Number(P(`#u_${id}`).value) || 0)), speed: unitInfo[id] || 0 }))
      .filter((x) => x.count > 0);
  }

  function selectedSlowest() {
    const chosen = selectedComposition();
    if (!chosen.length) return null;
    return chosen.reduce((a, b) => a.speed >= b.speed ? a : b);
  }

  function setStatus(text, bad = false) {
    const el = P("#rfpStatus");
    el.textContent = text;
    el.className = `info ${bad ? "bad" : "ok"}`;
  }

  function refreshVillageInfo() {
    const villages = readVillages();
    P("#rfpVillageInfo").innerHTML = `Na aktuální stránce nalezeno <b>${villages.length}</b> vesnic.`;
  }
  refreshVillageInfo();

  function buildArrivalSlots(count, from, to, mode, seed) {
    if (count <= 1) return [from];
    if (mode === "random") {
      const rnd = seededRandom(seed);
      return Array.from({ length: count }, () => from + Math.floor(rnd() * (to - from))).sort((a, b) => a - b);
    }
    const step = (to - from) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(from + i * step));
  }

  async function buildPlan() {
    saveSettings();
    if (!Object.keys(unitInfo).length) await loadUnitInfo();

    const villages = readVillages();
    const targets = [...new Set(P("#rfpTargets").value.split(/\s+/).map(coord).filter(Boolean))];
    const from = new Date(P("#rfpArrivalFrom").value).getTime();
    const to = new Date(P("#rfpArrivalTo").value).getTime();
    const nightFrom = parseHM(P("#rfpNightFrom").value);
    const nightTo = parseHM(P("#rfpNightTo").value);
    const perVillage = Math.max(1, Math.floor(Number(P("#rfpPerVillage").value) || 1));
    const minSendGap = Math.max(0, Number(P("#rfpMinSendGap").value) || 0) * 1000;
    const distribution = P("#rfpDistribution").value;
    const seed = Number(P("#rfpSeed").value) || 1;
    const slowest = selectedSlowest();

    if (!villages.length) return setStatus("Nebyla nalezena žádná zdrojová vesnice.", true);
    if (!targets.length) return setStatus("Zadej alespoň jeden cíl.", true);
    if (!(to > from)) return setStatus("Čas Dopad do musí být později než Dopad od.", true);
    if (!slowest) return setStatus("Zadej alespoň jednu jednotku.", true);

    const total = villages.length * perVillage;
    const slots = buildArrivalSlots(total, from, to, distribution, seed);
    const lastSendByVillage = new Map();
    plan = [];

    let seq = 0;
    for (const village of villages) {
      for (let n = 0; n < perVillage; n++) {
        const target = targets[seq % targets.length];
        const travelMs = distance(village.coord, target) * slowest.speed * 60000;
        let arrival = slots[seq];
        let send = arrival - travelMs;
        let attempts = 0;
        const previousSend = lastSendByVillage.get(village.coord) ?? -Infinity;

        while ((isBlocked(send, nightFrom, nightTo) || send - previousSend < minSendGap) && attempts < 10000) {
          arrival += 1000;
          if (arrival > to) break;
          send = arrival - travelMs;
          attempts++;
        }

        if (arrival > to || isBlocked(send, nightFrom, nightTo) || send - previousSend < minSendGap) {
          plan.push({ village, target, send: null, arrival: null, slowest, reason: "Nenalezen povolený čas" });
        } else {
          plan.push({ village, target, send, arrival, slowest, reason: "" });
          lastSendByVillage.set(village.coord, send);
        }
        seq++;
      }
    }

    plan.sort((a, b) => (a.send ?? Infinity) - (b.send ?? Infinity));
    renderPlan();
    const valid = plan.filter((x) => x.send).length;
    setStatus(`Hotovo: ${valid} naplánovaných faků, ${plan.length - valid} bez vhodného času.`, plan.length !== valid);
  }

  function sendUrl(row) {
    const [x, y] = row.target.split("|");
    const params = new URLSearchParams({
      village: row.village.id || gameData.village?.id || "",
      screen: "place",
      x, y
    });
    for (const unit of selectedComposition()) params.set(unit.id, String(unit.count));
    return `/game.php?${params.toString()}`;
  }

  function renderPlan() {
    P("#rfpResults").innerHTML = plan.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(r.village.name)} (${r.village.coord})</td>
        <td>${r.target}</td>
        <td>${r.send ? formatDateTime(r.send) : `<span class="bad">${esc(r.reason)}</span>`}</td>
        <td>${r.arrival ? formatDateTime(r.arrival) : "-"}</td>
        <td>${esc(r.slowest.id)}</td>
        <td>${r.send ? `<a class="btn" target="_blank" href="${esc(sendUrl(r))}">Otevřít</a>` : "-"}</td>
      </tr>`).join("");
  }

  function bbcode() {
    return plan.filter((r) => r.send).map((r, i) =>
      `${i + 1}. [coord]${r.village.coord}[/coord] → [coord]${r.target}[/coord] | odeslat [b]${formatDateTime(r.send)}[/b] | dopad ${formatDateTime(r.arrival)}`
    ).join("\n");
  }

  P("#rfpClose").onclick = () => panel.remove();
  P("#rfpBuild").onclick = () => buildPlan().catch((e) => setStatus(e.message, true));
  P("#rfpCopy").onclick = async () => {
    await navigator.clipboard.writeText(bbcode());
    setStatus("BB-Code byl zkopírován.");
  };
  P("#rfpCsv").onclick = () => {
    const rows = [["source","target","send","arrival","slowest_unit"], ...plan.filter((r) => r.send).map((r) => [r.village.coord, r.target, formatDateTime(r.send), formatDateTime(r.arrival), r.slowest.id])];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fake_plan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
})();
