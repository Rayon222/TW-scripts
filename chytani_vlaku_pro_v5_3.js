(() => {
  "use strict";

  const APP_ID = "rayon-train-catcher-v53";
  const STORAGE_KEY = "rayonTrainCatcherV53";
  document.getElementById(APP_ID)?.remove();

  const UNIT_LABELS = {
    spear: "Kopiník", sword: "Meč", axe: "Sekera", archer: "Luk",
    spy: "Špeh", light: "Lehká jízda", marcher: "Jízdní luk",
    heavy: "Těžká jízda", ram: "Beranidlo", catapult: "Katapult",
    knight: "Paladin", snob: "Šlechtic"
  };
  const UNIT_ORDER = ["spy", "spear", "sword", "axe", "archer", "light", "marcher", "heavy", "ram", "catapult", "knight", "snob"];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const coordFrom = (text) => String(text || "").match(/(\d{1,3})\|(\d{1,3})/)?.[0] || "";
  const currentVillage = () => {
    const gd = window.game_data;
    const id = gd?.village?.id ? String(gd.village.id) : new URLSearchParams(location.search).get("village") || "";
    const coord = gd?.village?.coord || coordFrom(qs("#menu_row2")?.textContent) || coordFrom(document.body.textContent);
    const name = gd?.village?.name || "";
    return { id, coord, name };
  };
  const serverOffset = (() => {
    const d = qs("#serverDate")?.textContent?.trim() || "";
    const t = qs("#serverTime")?.textContent?.trim() || "";
    const dm = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    const tm = t.match(/(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?/);
    if (!dm || !tm) return 0;
    const ts = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3], +(tm[4] || "0").padEnd(3, "0")).getTime();
    return ts - Date.now();
  })();
  const now = () => Date.now() + serverOffset;
  const formatClock = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  };
  const formatFull = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${formatClock(ts)}`;
  };
  const formatDuration = (ms) => {
    const sign = ms < 0 ? "-" : "";
    let n = Math.abs(Math.round(ms));
    const h = Math.floor(n / 3600000); n %= 3600000;
    const m = Math.floor(n / 60000); n %= 60000;
    const s = Math.floor(n / 1000);
    return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(n % 1000, 3)}`;
  };
  const parseArrivalText = (text) => {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    const full = s.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\D+(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
    if (full) {
      const year = +full[3] < 100 ? 2000 + +full[3] : +full[3];
      return new Date(year, +full[2] - 1, +full[1], +full[4], +full[5], +full[6], +(full[7] || "0").padEnd(3, "0")).getTime();
    }
    const time = s.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
    if (!time) return NaN;
    const base = new Date(now());
    const result = new Date(base.getFullYear(), base.getMonth(), base.getDate(), +time[1], +time[2], +time[3], +(time[4] || "0").padEnd(3, "0")).getTime();
    return result < now() - 3600000 ? result + 86400000 : result;
  };
  const distance = (a, b) => {
    const ac = coordFrom(a)?.split("|").map(Number);
    const bc = coordFrom(b)?.split("|").map(Number);
    return ac && bc ? Math.hypot(ac[0] - bc[0], ac[1] - bc[1]) : NaN;
  };

  const app = document.createElement("div");
  app.id = APP_ID;
  app.innerHTML = `
    <style>
      #${APP_ID}{position:fixed;left:18px;top:70px;width:620px;max-width:94vw;max-height:88vh;z-index:999999;
        background:#f3e4bd;color:#2b1b0b;border:2px solid #7d510f;border-radius:8px;box-shadow:0 8px 28px #0008;
        font:13px Arial,sans-serif;overflow:hidden}
      #${APP_ID} *{box-sizing:border-box}
      #${APP_ID} .rt-head{height:43px;background:#7d510f;color:#fff;display:flex;align-items:center;gap:10px;padding:7px 9px;
        cursor:move;user-select:none}
      #${APP_ID} .rt-title{font-weight:bold;font-size:15px;flex:1}
      #${APP_ID} .rt-clock{font:700 17px monospace;white-space:nowrap}
      #${APP_ID} button,#${APP_ID} input,#${APP_ID} select{font:13px Arial}
      #${APP_ID} button{cursor:pointer;border:1px solid #6e4610;border-radius:4px;padding:6px 9px;background:#e8d3a0;color:#261708}
      #${APP_ID} button.primary{background:#8d5d18;color:#fff;font-weight:bold}
      #${APP_ID} button.danger{background:#9f1e16;color:#fff;font-weight:bold}
      #${APP_ID} button.good{background:#2e721f;color:#fff;font-weight:bold}
      #${APP_ID} .rt-body{padding:9px;overflow:auto;max-height:calc(88vh - 43px)}
      #${APP_ID} .rt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      #${APP_ID} .card{background:#fff8e8;border:1px solid #b88b42;border-radius:6px;padding:8px}
      #${APP_ID} .card h3{font-size:13px;margin:0 0 6px;color:#5b390e}
      #${APP_ID} .train-list{max-height:138px;overflow:auto}
      #${APP_ID} .train{display:flex;gap:7px;align-items:flex-start;padding:5px;border-bottom:1px solid #ead7aa}
      #${APP_ID} .train:last-child{border-bottom:0}
      #${APP_ID} .unit-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
      #${APP_ID} .unit{display:grid;grid-template-columns:auto 1fr;gap:3px;align-items:center;background:#f8edcf;padding:4px;border-radius:4px}
      #${APP_ID} .unit input[type=number]{width:100%;min-width:0;padding:3px}
      #${APP_ID} .main-action{width:100%;height:58px;font-size:22px!important;margin-top:8px}
      #${APP_ID} .countdown{text-align:center;font:700 30px monospace;background:#171717;color:#fff;border-radius:6px;padding:8px;margin-top:8px}
      #${APP_ID} .status{margin-top:7px;padding:6px;border-radius:4px;background:#ead8ab;font-weight:bold;min-height:28px}
      #${APP_ID} .history{width:100%;border-collapse:collapse;font-size:12px}
      #${APP_ID} .history th,#${APP_ID} .history td{border-bottom:1px solid #dec28a;padding:4px;text-align:left}
      #${APP_ID} iframe{width:100%;height:285px;border:1px solid #906522;background:#fff;margin-top:8px;border-radius:5px}
      #${APP_ID}.minimized .rt-body{display:none}
      #${APP_ID} .small{font-size:11px;color:#6a512b}
      #${APP_ID} .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      #${APP_ID} .result-buttons{display:none;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
      @media(max-width:680px){#${APP_ID}{width:94vw}.rt-grid{grid-template-columns:1fr!important}.unit-grid{grid-template-columns:repeat(3,1fr)!important}}
    </style>
    <div class="rt-head" id="rtDrag">
      <div class="rt-title">Rayon Train Catcher v5.3 · <span id="rtVillage"></span></div>
      <div class="rt-clock" id="rtClock">--:--:--.---</div>
      <button id="rtMin" title="Minimalizovat">—</button>
      <button id="rtClose" title="Zavřít">✕</button>
    </div>
    <div class="rt-body">
      <div class="rt-grid">
        <section class="card">
          <h3>1. VLAK</h3>
          <div class="row">
            <button id="rtLoad" class="primary">Načíst automaticky</button>
            <label>Mezera vlaku <input id="rtGap" type="number" min="100" step="100" value="1800" style="width:72px"> ms</label>
          </div>
          <div id="rtTrains" class="train-list"><div class="small">Načítám příchozí útoky…</div></div>
        </section>
        <section class="card">
          <h3>2. JEDNOTKY</h3>
          <div id="rtUnits" class="unit-grid"></div>
          <div class="row" style="margin-top:6px">
            <label>Návrat před útokem <input id="rtBefore" type="number" min="0" step="10" value="250" style="width:70px"> ms</label>
          </div>
          <div id="rtSlowest" class="small" style="margin-top:5px">Vyber alespoň jednu jednotku.</div>
        </section>
      </div>

      <button id="rtSend" class="primary main-action">ODESLAT</button>
      <div id="rtCountdown" class="countdown">PŘIPRAVENO</div>
      <button id="rtReturn" class="danger main-action" style="display:none">NÁVRAT – PŘIPRAVIT ZRUŠENÍ</button>

      <div id="rtResult" class="result-buttons">
        <button id="rtCaught" class="good">✓ CHYCEN</button>
        <button id="rtMissed" class="danger">✗ NECHYCEN</button>
      </div>

      <div id="rtStatus" class="status">Spouštím…</div>

      <section class="card" style="margin-top:8px">
        <h3>VÝSLEDKY</h3>
        <table class="history">
          <thead><tr><th>Vlak / útok</th><th>Dopad</th><th>Stav</th></tr></thead>
          <tbody id="rtHistory"><tr><td colspan="3">Zatím bez výsledků.</td></tr></tbody>
        </table>
      </section>

      <iframe id="rtFrame" title="Herní nádvoří"></iframe>
    </div>
  `;
  document.body.appendChild(app);

  const $ = (s) => qs(s, app);
  let attacks = [];
  let trains = [];
  let units = [];
  let selectedAttackId = "";
  let active = null;
  let timerId = null;
  let frameWatcher = null;
  let drag = null;

  const status = (text, error = false) => {
    $("#rtStatus").textContent = text;
    $("#rtStatus").style.background = error ? "#f5c5bd" : "#ead8ab";
    $("#rtStatus").style.color = error ? "#8b160e" : "#2b1b0b";
  };
  const save = () => {
    const data = {
      left: app.style.left, top: app.style.top, gap: $("#rtGap").value, before: $("#rtBefore").value,
      selectedAttackId,
      counts: Object.fromEntries(units.map((u) => [u.id, Number($(`#rtCount_${u.id}`)?.value || 0)])),
      history: trains.flatMap((t) => t.attacks).filter((a) => a.result).map((a) => ({ key: a.key, result: a.result }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };
  const restoreBase = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (data.left) app.style.left = data.left;
      if (data.top) app.style.top = data.top;
      if (data.gap) $("#rtGap").value = data.gap;
      if (data.before) $("#rtBefore").value = data.before;
      selectedAttackId = data.selectedAttackId || "";
      return data;
    } catch { return {}; }
  };
  const restored = restoreBase();

  const showClock = () => { $("#rtClock").textContent = formatClock(now()); };
  setInterval(showClock, 31); showClock();
  $("#rtVillage").textContent = currentVillage().coord || "neznámá vesnice";

  const loadUnitInfo = async () => {
    const parser = new DOMParser();
    const [cfgText, unitText] = await Promise.all([
      fetch("/interface.php?func=get_config", { credentials: "same-origin" }).then((r) => r.text()),
      fetch("/interface.php?func=get_unit_info", { credentials: "same-origin" }).then((r) => r.text())
    ]);
    const cfg = parser.parseFromString(cfgText, "text/xml");
    const unitDoc = parser.parseFromString(unitText, "text/xml");
    const worldSpeed = Number(cfg.querySelector("unit_speed")?.textContent || 1);
    units = [...unitDoc.documentElement.children].map((node) => ({
      id: node.tagName,
      speed: Number(node.querySelector("speed")?.textContent || 0) / worldSpeed
    })).filter((u) => u.speed > 0 && UNIT_ORDER.includes(u.id))
      .sort((a, b) => UNIT_ORDER.indexOf(a.id) - UNIT_ORDER.indexOf(b.id));

    $("#rtUnits").innerHTML = units.map((u) => `
      <label class="unit">
        <span>${esc(UNIT_LABELS[u.id] || u.id)}</span>
        <input id="rtCount_${u.id}" type="number" min="0" step="1" value="${u.id === "spy" ? 5 : 0}" data-unit="${u.id}">
      </label>
    `).join("");

    for (const [id, count] of Object.entries(restored.counts || {})) {
      const input = $(`#rtCount_${CSS.escape(id)}`);
      if (input) input.value = String(count);
    }
    qsa("[data-unit]", app).forEach((input) => input.addEventListener("input", () => { updateSlowest(); save(); }));
    updateSlowest();
  };

  const selectedUnits = () => units.map((u) => ({
    ...u, count: Math.max(0, Math.floor(Number($(`#rtCount_${u.id}`)?.value || 0)))
  })).filter((u) => u.count > 0);

  const updateSlowest = () => {
    const chosen = selectedUnits();
    if (!chosen.length) {
      $("#rtSlowest").textContent = "Vyber alespoň jednu jednotku.";
      return null;
    }
    const slowest = chosen.reduce((a, b) => a.speed >= b.speed ? a : b);
    const attack = attacks.find((a) => a.key === selectedAttackId);
    const dist = attack?.originCoord ? distance(currentVillage().coord, attack.originCoord) : NaN;
    const travel = Number.isFinite(dist) ? dist * slowest.speed * 60000 : NaN;
    $("#rtSlowest").textContent =
      `Nejpomalejší: ${UNIT_LABELS[slowest.id] || slowest.id} (${slowest.speed} min/pole)` +
      (Number.isFinite(travel) ? ` · cesta ${formatDuration(travel)}` : "");
    return { slowest, travel };
  };

  const rowLooksLikeAttack = (row) => {
    const text = (row.textContent || "").toLowerCase();
    const html = row.innerHTML.toLowerCase();
    return /útok|utok|attack/.test(text + " " + html) &&
      (row.querySelector('a[href*="info_command"],a[href*="command"],.timer,[data-endtime]') || coordFrom(text));
  };
  const arrivalFromRow = (row) => {
    const timer = qs("[data-endtime]", row);
    const end = Number(timer?.dataset?.endtime || 0);
    if (end > 1e12) return end;
    if (end > 1e9) return end * 1000;
    const candidates = [
      timer?.getAttribute("title"), row.getAttribute("title"),
      qsa("[title]", row).map((x) => x.getAttribute("title")).join(" "),
      row.textContent
    ];
    for (const candidate of candidates) {
      const parsed = parseArrivalText(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  };
  const detailLinkFromRow = (row) => {
    const a = qs('a[href*="info_command"],a[href*="command_id"],a[href*="id="]', row);
    return a ? new URL(a.getAttribute("href"), location.href).href : "";
  };
  const fetchOrigin = async (url, targetCoord) => {
    if (!url) return "";
    try {
      const html = await fetch(url, { credentials: "same-origin" }).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, "text/html");
      const coords = [...new Set((doc.body.textContent.match(/\d{1,3}\|\d{1,3}/g) || []))];
      return coords.find((c) => c !== targetCoord) || coords[0] || "";
    } catch { return ""; }
  };

  const scanAttacks = async () => {
    status("Načítám příchozí útoky z napadené vesnice…");
    const target = currentVillage().coord;
    const rows = qsa("tr").filter(rowLooksLikeAttack);
    const found = rows.map((row, index) => {
      const arrival = arrivalFromRow(row);
      const detailUrl = detailLinkFromRow(row);
      const rowCoords = [...new Set(((row.textContent || "").match(/\d{1,3}\|\d{1,3}/g) || []))];
      const originCoord = rowCoords.find((c) => c !== target) || "";
      return {
        key: detailUrl || `${arrival}-${index}`,
        arrival, detailUrl, originCoord,
        label: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100)
      };
    }).filter((a) => Number.isFinite(a.arrival) && a.arrival > now() - 5000)
      .sort((a, b) => a.arrival - b.arrival);

    if (!found.length) {
      attacks = []; trains = [];
      renderTrains();
      status("Na této stránce jsem nenašel příchozí útoky. Otevři přehled příchozích příkazů napadené vesnice.", true);
      return;
    }

    await Promise.all(found.map(async (a) => {
      if (!a.originCoord) a.originCoord = await fetchOrigin(a.detailUrl, target);
    }));
    attacks = found;
    groupTrains();
    const oldResults = new Map((restored.history || []).map((r) => [r.key, r.result]));
    attacks.forEach((a) => { if (oldResults.has(a.key)) a.result = oldResults.get(a.key); });
    if (!attacks.some((a) => a.key === selectedAttackId)) selectedAttackId = attacks[0].key;
    renderTrains();
    updateSlowest();
    save();
    status(`Nalezeno ${attacks.length} útoků v ${trains.length} vlaku/vlacích.`);
  };

  const groupTrains = () => {
    const gap = Math.max(100, Number($("#rtGap").value) || 1800);
    trains = [];
    for (const attack of attacks) {
      const last = trains.at(-1);
      const sameOrigin = !last || !last.originCoord || !attack.originCoord || last.originCoord === attack.originCoord;
      if (!last || !sameOrigin || attack.arrival - last.attacks.at(-1).arrival > gap) {
        trains.push({ index: trains.length + 1, originCoord: attack.originCoord, attacks: [attack] });
      } else {
        last.attacks.push(attack);
      }
    }
  };

  const renderTrains = () => {
    if (!trains.length) {
      $("#rtTrains").innerHTML = `<div class="small">Žádný vlak nebyl načten.</div>`;
      renderHistory();
      return;
    }
    $("#rtTrains").innerHTML = trains.map((train) => train.attacks.map((attack, i) => `
      <label class="train">
        <input type="radio" name="rtAttack" value="${esc(attack.key)}" ${attack.key === selectedAttackId ? "checked" : ""}>
        <span><b>Vlak ${train.index} · útok ${i + 1}/${train.attacks.length}</b><br>
          ${esc(formatFull(attack.arrival))}${attack.originCoord ? ` · z ${esc(attack.originCoord)}` : " · původ nezjištěn"}
        </span>
      </label>
    `).join("")).join("");
    qsa('input[name="rtAttack"]', app).forEach((radio) => radio.addEventListener("change", () => {
      selectedAttackId = radio.value; updateSlowest(); save();
    }));
    renderHistory();
  };

  const attackPosition = (attack) => {
    for (const train of trains) {
      const index = train.attacks.indexOf(attack);
      if (index >= 0) return { train: train.index, attack: index + 1, total: train.attacks.length };
    }
    return { train: "?", attack: "?", total: "?" };
  };
  const renderHistory = () => {
    const all = trains.flatMap((train) => train.attacks.map((attack, i) => ({ train: train.index, n: i + 1, attack })));
    $("#rtHistory").innerHTML = all.length ? all.map(({ train, n, attack }) => `
      <tr><td>Vlak ${train} / ${n}</td><td>${esc(formatClock(attack.arrival))}</td>
      <td>${attack.result === "caught" ? "✅ chycen" : attack.result === "missed" ? "❌ nechycen" : attack.key === selectedAttackId ? "▶ vybrán" : "⏳"}</td></tr>
    `).join("") : `<tr><td colspan="3">Zatím bez výsledků.</td></tr>`;
  };

  const frame = () => $("#rtFrame");
  const frameDoc = () => { try { return frame().contentDocument; } catch { return null; } };
  const clearWatcher = () => { if (frameWatcher) clearInterval(frameWatcher); frameWatcher = null; };
  const highlightElement = (element) => {
    if (!element) return false;
    element.style.setProperty("outline", "5px solid #ff2b19", "important");
    element.style.setProperty("box-shadow", "0 0 18px #ff2b19", "important");
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.focus();
    return true;
  };
  const findActionButton = (doc, mode) => {
    const words = mode === "send"
      ? ["zaútočit", "zautocit", "odeslat", "potvrdit", "attack", "send", "confirm"]
      : ["zrušit", "zrusit", "cancel"];
    return qsa('button,input[type="submit"],input[type="button"],a', doc).find((el) => {
      const text = `${el.textContent || ""} ${el.value || ""} ${el.title || ""}`.toLowerCase();
      const visible = el.offsetParent !== null;
      return visible && words.some((w) => text.includes(w));
    });
  };
  const fillUnits = (doc, targetCoord) => {
    const chosen = selectedUnits();
    for (const u of chosen) {
      const input = qs(`input[name="${CSS.escape(u.id)}"]`, doc);
      if (input) input.value = String(u.count);
    }
    const m = coordFrom(targetCoord)?.split("|");
    const x = qs('input[name="x"]', doc), y = qs('input[name="y"]', doc);
    if (m && x && y) { x.value = m[0]; y.value = m[1]; }
  };
  const prepareSend = () => {
    const attack = attacks.find((a) => a.key === selectedAttackId);
    const chosen = selectedUnits();
    if (!attack) return status("Nejdříve vyber konkrétní útok.", true);
    if (!attack.originCoord) return status("Nepodařilo se zjistit souřadnice původu útoku.", true);
    if (!chosen.length) return status("Vyber alespoň jednu jednotku a zadej počet.", true);
    const speedInfo = updateSlowest();
    if (!speedInfo || !Number.isFinite(speedInfo.travel)) return status("Nelze vypočítat cestovní dobu.", true);

    active = {
      attack, chosen,
      targetReturn: attack.arrival - Math.max(0, Number($("#rtBefore").value) || 0),
      travel: speedInfo.travel,
      actualSend: null, cancelAt: null
    };
    const v = currentVillage();
    frame().src = `/game.php?village=${encodeURIComponent(v.id)}&screen=place&x=${attack.originCoord.split("|")[0]}&y=${attack.originCoord.split("|")[1]}`;
    frame().onload = () => {
      const doc = frameDoc();
      if (!doc) return;
      fillUnits(doc, attack.originCoord);
      const button = findActionButton(doc, "send");
      if (button) highlightElement(button);
      status("Nádvoří připraveno. Zkontroluj jednotky a cíl, potom odešli příkaz ručně a klikni ODESLÁNO.");
    };
    $("#rtSend").textContent = "ODESLÁNO – SPOČÍTAT NÁVRAT";
    $("#rtSend").onclick = recordSent;
    $("#rtCountdown").textContent = "ODESLAT RUČNĚ";
    save();
  };

  const recordSent = () => {
    if (!active) return status("Nejdříve připrav odeslání.", true);
    active.actualSend = now();
    active.cancelAt = Math.round((active.targetReturn + active.actualSend) / 2);
    const outward = active.cancelAt - active.actualSend;
    if (outward <= 0) return status("Na tento útok je už pozdě. Vyber pozdější útok.", true);
    if (outward >= active.travel) {
      status(`Příkaz by dorazil do cíle dříve, než jej máš zrušit. Potřebná doba ven: ${formatDuration(outward)}, cesta: ${formatDuration(active.travel)}.`, true);
      return;
    }
    $("#rtSend").style.display = "none";
    $("#rtReturn").style.display = "block";
    startCountdown();
    openOutgoingCommands();
    status(`Odeslání zaznamenáno. Návrat připravím v ${formatClock(active.cancelAt)}.`);
  };

  const openOutgoingCommands = () => {
    clearWatcher();
    const v = currentVillage();
    frame().src = `/game.php?village=${encodeURIComponent(v.id)}&screen=overview`;
    frameWatcher = setInterval(() => {
      const doc = frameDoc();
      if (!doc) return;
      const cancel = findActionButton(doc, "cancel");
      if (cancel && active && now() >= active.cancelAt - 1500) {
        highlightElement(cancel);
        try { frame().contentWindow.focus(); } catch {}
      }
    }, 250);
  };

  const startCountdown = () => {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!active?.cancelAt) return;
      const remaining = active.cancelAt - now();
      $("#rtCountdown").textContent = remaining > 0 ? formatDuration(remaining) : "NÁVRAT – ENTER";
      if (remaining <= 0) {
        $("#rtCountdown").style.background = "#9f1e16";
        const doc = frameDoc();
        const cancel = doc && findActionButton(doc, "cancel");
        if (cancel) {
          highlightElement(cancel);
          try { frame().contentWindow.focus(); } catch {}
          status("Tlačítko ZRUŠIT je zvýrazněné a má fokus. Potvrď ho ručně klávesou ENTER.");
        } else {
          status("Je čas na návrat, ale tlačítko ZRUŠIT zatím nevidím. Otevři odchozí příkazy v rámu.", true);
        }
      }
    }, 31);
  };

  const prepareReturn = () => {
    if (!active) return status("Není aktivní pokus.", true);
    const doc = frameDoc();
    const cancel = doc && findActionButton(doc, "cancel");
    if (cancel) {
      highlightElement(cancel);
      try { frame().contentWindow.focus(); } catch {}
      status("Zrušení je připravené. Potvrď skutečné herní tlačítko ručně klávesou ENTER.");
      $("#rtReturn").textContent = "NÁVRAT POTVRZEN – VYBER VÝSLEDEK";
      $("#rtResult").style.display = "grid";
    } else {
      openOutgoingCommands();
      status("Načítám odchozí příkazy a hledám tlačítko ZRUŠIT…");
    }
  };

  const finishResult = (result) => {
    if (!active?.attack) return;
    active.attack.result = result;
    const pos = attackPosition(active.attack);
    status(result === "caught"
      ? `Potvrzeno: vlak ${pos.train}, útok ${pos.attack}/${pos.total} byl CHYCEN.`
      : `Potvrzeno: vlak ${pos.train}, útok ${pos.attack}/${pos.total} nebyl chycen.`);
    renderHistory();
    save();
    clearInterval(timerId); clearWatcher();
    active = null;
    $("#rtCountdown").textContent = "PŘIPRAVENO";
    $("#rtCountdown").style.background = "#171717";
    $("#rtReturn").style.display = "none";
    $("#rtResult").style.display = "none";
    $("#rtSend").style.display = "block";
    $("#rtSend").textContent = "ODESLAT";
    $("#rtSend").onclick = prepareSend;
  };

  $("#rtLoad").onclick = () => scanAttacks().catch((e) => status(`Chyba načtení: ${e.message}`, true));
  $("#rtGap").onchange = () => { groupTrains(); renderTrains(); save(); };
  $("#rtBefore").onchange = save;
  $("#rtSend").onclick = prepareSend;
  $("#rtReturn").onclick = prepareReturn;
  $("#rtCaught").onclick = () => finishResult("caught");
  $("#rtMissed").onclick = () => finishResult("missed");
  $("#rtClose").onclick = () => { clearInterval(timerId); clearWatcher(); app.remove(); };
  $("#rtMin").onclick = () => app.classList.toggle("minimized");

  $("#rtDrag").addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    const rect = app.getBoundingClientRect();
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const left = Math.max(0, Math.min(innerWidth - app.offsetWidth, e.clientX - drag.dx));
    const top = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.dy));
    app.style.left = `${left}px`; app.style.top = `${top}px`;
  });
  document.addEventListener("mouseup", () => { if (drag) save(); drag = null; });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !active?.cancelAt || now() < active.cancelAt - 500) return;
    const doc = frameDoc();
    const cancel = doc && findActionButton(doc, "cancel");
    if (cancel) {
      highlightElement(cancel);
      try { frame().contentWindow.focus(); } catch {}
    }
  });

  (async () => {
    try {
      await loadUnitInfo();
      await scanAttacks();
    } catch (e) {
      status(`Skript se spustil, ale načtení selhalo: ${e.message}`, true);
      console.error("[Rayon v5.3]", e);
    }
  })();
})();