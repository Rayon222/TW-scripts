(() => {
  "use strict";

  const POPUP_NAME = "RayonTrainCatcherStable";
  const SCRIPT_ID = "rayon-train-catcher-stable";

  function popupMain() {
    "use strict";

    const UNIT_LABELS = {
      spear: "Kopiník", sword: "Meč", axe: "Sekera", archer: "Luk",
      spy: "Špeh", light: "Lehká jízda", marcher: "Jízdní luk",
      heavy: "Těžká jízda", ram: "Beranidlo", catapult: "Katapult",
      knight: "Paladin", snob: "Šlechtic"
    };
    const UNIT_ORDER = ["spy", "spear", "sword", "axe", "archer", "light", "marcher", "heavy", "ram", "catapult", "knight", "snob"];

    const game = () => {
      if (!window.opener || window.opener.closed) {
        throw new Error("Herní okno není dostupné.");
      }
      return window.opener;
    };
    const gameDoc = () => game().document;
    const qs = (s, root = document) => root.querySelector(s);
    const qsa = (s, root = document) => [...root.querySelectorAll(s)];
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[c]));
    const pad = (n, len = 2) => String(n).padStart(len, "0");
    const coordFrom = (text) => String(text || "").match(/(\d{1,3})\|(\d{1,3})/)?.[0] || "";

    let serverEpoch = 0;
    let serverPerf = performance.now();
    let units = [];
    let attacks = [];
    let trains = [];
    let selectedKey = "";
    let active = null;
    let timer = null;

    const syncServerTime = () => {
      const doc = gameDoc();
      const dateText = qs("#serverDate", doc)?.textContent?.trim() || "";
      const timeText = qs("#serverTime", doc)?.textContent?.trim() || "";
      const dm = dateText.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
      const tm = timeText.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
      if (!dm || !tm) return false;

      serverEpoch = Date.UTC(
        Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]),
        Number(tm[1]), Number(tm[2]), Number(tm[3]),
        Number((tm[4] || "0").padEnd(3, "0"))
      );
      serverPerf = performance.now();
      return true;
    };

    const serverNow = () => serverEpoch + (performance.now() - serverPerf);
    const formatClock = (timestamp) => {
      const d = new Date(timestamp);
      return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
    };
    const formatDuration = (ms) => {
      const sign = ms < 0 ? "-" : "";
      let n = Math.abs(Math.round(ms));
      const h = Math.floor(n / 3600000); n %= 3600000;
      const m = Math.floor(n / 60000); n %= 60000;
      const s = Math.floor(n / 1000);
      return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(n % 1000, 3)}`;
    };
    const currentVillage = () => {
      const gw = game();
      const gd = gw.game_data || {};
      return {
        id: String(gd?.village?.id || new URLSearchParams(gw.location.search).get("village") || ""),
        coord: gd?.village?.coord || coordFrom(qs("#menu_row2", gameDoc())?.textContent),
        name: gd?.village?.name || ""
      };
    };
    const distance = (a, b) => {
      const aa = coordFrom(a).split("|").map(Number);
      const bb = coordFrom(b).split("|").map(Number);
      return aa.length === 2 && bb.length === 2 ? Math.hypot(aa[0] - bb[0], aa[1] - bb[1]) : NaN;
    };
    const parseArrival = (text) => {
      const value = String(text || "").replace(/\s+/g, " ").trim();
      const full = value.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\D+(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
      if (full) {
        const year = Number(full[3]) < 100 ? 2000 + Number(full[3]) : Number(full[3]);
        return Date.UTC(year, Number(full[2]) - 1, Number(full[1]), Number(full[4]), Number(full[5]), Number(full[6]), Number((full[7] || "0").padEnd(3, "0")));
      }

      const tm = value.match(/(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
      if (!tm) return NaN;
      const base = new Date(serverNow());
      let result = Date.UTC(
        base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(),
        Number(tm[1]), Number(tm[2]), Number(tm[3]), Number((tm[4] || "0").padEnd(3, "0"))
      );
      if (result < serverNow() - 3600000) result += 86400000;
      return result;
    };

    document.open();
    document.write(`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>Rayon Train Catcher</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#081018;color:#eaf2f8;font:14px Arial,sans-serif}
.app{min-height:100vh;padding:14px;background:linear-gradient(145deg,#081018,#101b25)}
.top{display:flex;align-items:center;gap:14px;padding:14px 16px;background:#101a23;border:1px solid #2f4658;border-radius:14px}
.title{font-size:20px;font-weight:800;flex:1}
.server{text-align:right}
.server small{display:block;color:#5de66d;font-weight:700}
.clock{font:800 28px monospace}
.btn{border:1px solid #405a6e;border-radius:9px;background:#182836;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.45;cursor:not-allowed}
.blue{background:#0867cb}.orange{background:#db7200}.purple{background:#7227b8}.green{background:#177f32}.red{background:#a12d2d}
.layout{display:grid;grid-template-columns:1fr 1.15fr .9fr;gap:12px;margin-top:12px}
.card{background:#101a23;border:1px solid #304758;border-radius:14px;padding:13px;min-width:0}
.card h2{margin:0 0 12px;font-size:17px}
.blueText{color:#42a4ff}.greenText{color:#61e876}.orangeText{color:#ff9b28}.purpleText{color:#c178ff}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
input[type=number]{width:82px;height:38px;border-radius:8px;border:1px solid #46647a;background:#08131b;color:#fff;text-align:center;font-size:15px;font-weight:700}
.list{margin-top:10px;max-height:380px;overflow:auto}
.attack{display:block;margin-bottom:8px;padding:11px;border:1px solid #286a9d;border-radius:10px;background:#0b3151}
.units{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.unit{display:grid;grid-template-columns:1fr 78px;gap:8px;align-items:center;padding:9px 10px;border:1px solid #2b7542;border-radius:9px;background:#10251a}
.unit span{font-weight:700}
.unit input{width:78px;border-color:#338d4e}
.panel{padding:14px;border:1px solid #4a4138;border-radius:14px;background:#17130f;text-align:center;margin-bottom:12px}
.big{font:800 34px monospace;margin:8px 0}
.exact{font:700 19px monospace}
.main{width:100%;padding:13px;font-size:18px}
.status{margin-top:12px;padding:12px;border:1px solid #345064;border-radius:12px;background:#0d1821}
.bottom{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-top:12px}
table{width:100%;border-collapse:collapse}
th,td{padding:7px;text-align:left;border-bottom:1px solid #263a49}
.small{font-size:12px;color:#aebfcb}
.state{font-size:20px;font-weight:800;color:#61e876}
@media(max-width:900px){.layout,.bottom{grid-template-columns:1fr}.units{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">
  <div class="top">
    <div class="title">🎯 RAYON TRAIN CATCHER · <span id="village">---</span></div>
    <div class="server"><small>SERVEROVÝ ČAS</small><div id="clock" class="clock">--:--:--.---</div></div>
    <button id="focusGame" class="btn">HRA</button>
    <button id="close" class="btn">✕</button>
  </div>

  <div class="layout">
    <section class="card">
      <h2 class="blueText">1. VLAK</h2>
      <button id="load" class="btn blue main">↻ NAČÍST ÚTOKY</button>
      <div class="row" style="margin-top:10px">
        <span>Mezera vlaku</span>
        <input id="gap" type="number" min="100" step="100" value="1800">
        <span>ms</span>
      </div>
      <div id="trains" class="list"><div class="small">Načítám příchozí útoky…</div></div>
    </section>

    <section class="card">
      <h2 class="greenText">2. JEDNOTKY</h2>
      <div id="units" class="units"></div>
      <div class="row" style="margin-top:10px">
        <span>Návrat před útokem</span>
        <input id="before" type="number" min="0" step="10" value="250">
        <span>ms</span>
      </div>
      <div id="slowest" class="status small">Vyber jednotky.</div>
    </section>

    <section>
      <div class="panel">
        <h2 class="orangeText">3. ODESLAT</h2>
        <div class="small">STAV ODESLÁNÍ</div>
        <div id="sendState" class="big orangeText">PŘIPRAVENO</div>
        <div class="small">SKUTEČNÝ SERVEROVÝ ČAS ODESLÁNÍ</div>
        <div id="sendExact" class="exact">--:--:--.---</div>
        <button id="prepareSend" class="btn orange main" style="margin-top:12px">PŘIPRAVIT NÁDVOŘÍ</button>
      </div>

      <div class="panel">
        <h2 class="purpleText">4. NÁVRAT</h2>
        <div class="small">NÁVRAT ZA</div>
        <div id="returnCountdown" class="big purpleText">--:--:--.---</div>
        <div class="small">PŘESNÝ SERVEROVÝ ČAS NÁVRATU</div>
        <div id="returnExact" class="exact">--:--:--.---</div>
        <button id="prepareReturn" class="btn purple main" style="margin-top:12px" disabled>PŘEJÍT NA ZRUŠENÍ</button>
      </div>
    </section>
  </div>

  <div id="status" class="status">Spouštím…</div>

  <div class="bottom">
    <section class="card">
      <h2>🏆 VÝSLEDKY</h2>
      <table>
        <thead><tr><th>Vlak / útok</th><th>Dopad</th><th>Stav</th></tr></thead>
        <tbody id="history"></tbody>
      </table>
    </section>
    <section class="card">
      <h2>◎ STAV</h2>
      <div id="state" class="state">PŘIPRAVEN</div>
      <p id="stateText" class="small">Ovládací okno zůstává otevřené. Herní stránka se mění v původním tabu.</p>
      <div id="resultButtons" class="row" style="display:none">
        <button id="caught" class="btn green" style="flex:1">✓ CHYCEN</button>
        <button id="missed" class="btn red" style="flex:1">✗ NECHYCEN</button>
      </div>
    </section>
  </div>
</div>
</body>
</html>`);
    document.close();

    const $ = (s) => qs(s, document);
    const setStatus = (text, error = false) => {
      $("#status").textContent = text;
      $("#status").style.borderColor = error ? "#a03c3c" : "#345064";
    };
    const setState = (title, text) => {
      $("#state").textContent = title;
      $("#stateText").textContent = text;
    };

    const loadUnitInfo = async () => {
      const gw = game();
      const parser = new DOMParser();
      const [cfgText, unitText] = await Promise.all([
        gw.fetch("/interface.php?func=get_config", { credentials: "same-origin" }).then(r => r.text()),
        gw.fetch("/interface.php?func=get_unit_info", { credentials: "same-origin" }).then(r => r.text())
      ]);
      const cfg = parser.parseFromString(cfgText, "text/xml");
      const unitDoc = parser.parseFromString(unitText, "text/xml");
      const unitSpeed = Number(cfg.querySelector("unit_speed")?.textContent || 1);

      units = [...unitDoc.documentElement.children]
        .map(node => ({
          id: node.tagName,
          speed: Number(node.querySelector("speed")?.textContent || 0) / unitSpeed
        }))
        .filter(unit => unit.speed > 0 && UNIT_ORDER.includes(unit.id))
        .sort((a, b) => UNIT_ORDER.indexOf(a.id) - UNIT_ORDER.indexOf(b.id));

      $("#units").innerHTML = units.map(unit => `
        <label class="unit">
          <span>${esc(UNIT_LABELS[unit.id] || unit.id)}</span>
          <input data-unit="${unit.id}" type="number" min="0" step="1" value="${unit.id === "spy" ? 5 : 0}">
        </label>
      `).join("");

      qsa("[data-unit]").forEach(input => input.addEventListener("input", updateSlowest));
      updateSlowest();
    };

    const selectedUnits = () => units.map(unit => ({
      ...unit,
      count: Math.max(0, Math.floor(Number(qs(`[data-unit="${unit.id}"]`)?.value || 0)))
    })).filter(unit => unit.count > 0);

    const selectedAttack = () => attacks.find(attack => attack.key === selectedKey);

    const updateSlowest = () => {
      const chosen = selectedUnits();
      const attack = selectedAttack();

      if (!chosen.length) {
        $("#slowest").textContent = "Vyber alespoň jednu jednotku.";
        return null;
      }

      const slowest = chosen.reduce((a, b) => a.speed >= b.speed ? a : b);
      const dist = attack?.originCoord ? distance(currentVillage().coord, attack.originCoord) : NaN;
      const travel = Number.isFinite(dist) ? dist * slowest.speed * 60000 : NaN;

      $("#slowest").textContent =
        `Nejpomalejší: ${UNIT_LABELS[slowest.id] || slowest.id} (${slowest.speed} min/pole)` +
        (Number.isFinite(travel) ? ` · cesta ${formatDuration(travel)}` : "");

      return { slowest, travel };
    };

    const looksLikeIncomingAttack = row => {
      const text = (row.textContent || "").toLowerCase();
      const html = row.innerHTML.toLowerCase();
      return /útok|utok|attack/.test(text + " " + html) &&
        (row.querySelector('[data-endtime],.timer,a[href*="info_command"],a[href*="command"]') || coordFrom(text));
    };

    const arrivalFromRow = row => {
      const timerEl = qs("[data-endtime]", row);
      const raw = Number(timerEl?.dataset?.endtime || 0);
      if (raw > 1e12) return raw;
      if (raw > 1e9) return raw * 1000;

      const candidates = [
        timerEl?.title,
        row.title,
        qsa("[title]", row).map(el => el.title).join(" "),
        row.textContent
      ];

      for (const candidate of candidates) {
        const parsed = parseArrival(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
      return NaN;
    };

    const commandLinkFromRow = row => {
      const link = qs('a[href*="info_command"],a[href*="command_id"],a[href*="id="]', row);
      return link ? new URL(link.getAttribute("href"), game().location.href).href : "";
    };

    const fetchOrigin = async (url, targetCoord) => {
      if (!url) return "";
      try {
        const html = await game().fetch(url, { credentials: "same-origin" }).then(r => r.text());
        const doc = new DOMParser().parseFromString(html, "text/html");
        const coords = [...new Set(doc.body.textContent.match(/\d{1,3}\|\d{1,3}/g) || [])];
        return coords.find(coord => coord !== targetCoord) || coords[0] || "";
      } catch {
        return "";
      }
    };

    const regroup = () => {
      const maxGap = Math.max(100, Number($("#gap").value) || 1800);
      trains = [];

      for (const attack of attacks) {
        const last = trains.at(-1);
        const sameOrigin = !last || !last.originCoord || !attack.originCoord || last.originCoord === attack.originCoord;

        if (!last || !sameOrigin || attack.arrival - last.attacks.at(-1).arrival > maxGap) {
          trains.push({ index: trains.length + 1, originCoord: attack.originCoord, attacks: [attack] });
        } else {
          last.attacks.push(attack);
        }
      }
    };

    const loadAttacks = async () => {
      syncServerTime();
      const doc = gameDoc();
      const targetCoord = currentVillage().coord;
      setStatus("Načítám příchozí útoky z herního okna…");

      const rows = qsa("tr", doc).filter(looksLikeIncomingAttack);
      const found = rows.map((row, index) => {
        const arrival = arrivalFromRow(row);
        const detailUrl = commandLinkFromRow(row);
        const rowCoords = [...new Set((row.textContent || "").match(/\d{1,3}\|\d{1,3}/g) || [])];

        return {
          key: detailUrl || `${arrival}-${index}`,
          arrival,
          detailUrl,
          originCoord: rowCoords.find(coord => coord !== targetCoord) || "",
          result: ""
        };
      }).filter(attack => Number.isFinite(attack.arrival) && attack.arrival > serverNow() - 5000)
        .sort((a, b) => a.arrival - b.arrival);

      if (!found.length) {
        attacks = [];
        trains = [];
        renderTrains();
        setStatus("V herním tabu nejsou viditelné příchozí útoky. Otevři přehled napadené vesnice a klikni Načíst útoky.", true);
        return;
      }

      await Promise.all(found.map(async attack => {
        if (!attack.originCoord) attack.originCoord = await fetchOrigin(attack.detailUrl, targetCoord);
      }));

      attacks = found;
      regroup();
      if (!attacks.some(attack => attack.key === selectedKey)) selectedKey = attacks[0].key;
      renderTrains();
      updateSlowest();
      setStatus(`Nalezeno ${attacks.length} útoků v ${trains.length} vlaku/vlacích.`);
    };

    const renderTrains = () => {
      $("#trains").innerHTML = trains.length ? trains.map(train =>
        train.attacks.map((attack, index) => `
          <label class="attack">
            <input type="radio" name="attack" value="${esc(attack.key)}" ${attack.key === selectedKey ? "checked" : ""}>
            <b>Vlak ${train.index} · útok ${index + 1}/${train.attacks.length}</b><br>
            <span class="small">${formatClock(attack.arrival)} · z ${esc(attack.originCoord || "?")}</span>
          </label>
        `).join("")
      ).join("") : `<div class="small">Žádné útoky.</div>`;

      qsa('input[name="attack"]').forEach(radio => {
        radio.addEventListener("change", () => {
          selectedKey = radio.value;
          updateSlowest();
          renderHistory();
        });
      });
      renderHistory();
    };

    const renderHistory = () => {
      const rows = trains.flatMap(train =>
        train.attacks.map((attack, index) => ({ train: train.index, index: index + 1, attack }))
      );

      $("#history").innerHTML = rows.length ? rows.map(row => `
        <tr>
          <td>Vlak ${row.train}/${row.index}</td>
          <td>${formatClock(row.attack.arrival)}</td>
          <td>${row.attack.result === "caught" ? "✅ chycen" :
                row.attack.result === "missed" ? "❌ nechycen" :
                row.attack.key === selectedKey ? "▶ vybrán" : "⏳ čeká"}</td>
        </tr>
      `).join("") : `<tr><td colspan="3">Bez výsledků.</td></tr>`;
    };

    const waitForGame = (callback) => {
      let previousHref = "";
      let stableTicks = 0;
      const watch = setInterval(() => {
        try {
          const gw = game();
          const href = gw.location.href;
          if (href === previousHref && gw.document.readyState === "complete") {
            stableTicks += 1;
          } else {
            stableTicks = 0;
            previousHref = href;
          }

          if (stableTicks >= 2) {
            clearInterval(watch);
            syncServerTime();
            $("#village").textContent = currentVillage().coord || "---";
            callback();
          }
        } catch {}
      }, 150);
    };

    const findGameButton = words => qsa('button,input[type="submit"],input[type="button"],a', gameDoc()).find(element => {
      const text = `${element.textContent || ""} ${element.value || ""} ${element.title || ""}`.toLowerCase();
      return element.offsetParent !== null && words.some(word => text.includes(word));
    });

    const highlightAndFocus = element => {
      if (!element) return false;
      element.style.setProperty("outline", "5px solid #ff7b00", "important");
      element.style.setProperty("box-shadow", "0 0 24px #ff7b00", "important");
      element.scrollIntoView({ block: "center" });
      element.focus();
      game().focus();
      return true;
    };

    const fillCourtyard = attack => {
      for (const unit of selectedUnits()) {
        const input = qs(`input[name="${CSS.escape(unit.id)}"]`, gameDoc());
        if (input) input.value = String(unit.count);
      }

      const [x, y] = attack.originCoord.split("|");
      const xInput = qs('input[name="x"]', gameDoc());
      const yInput = qs('input[name="y"]', gameDoc());
      if (xInput && yInput) {
        xInput.value = x;
        yInput.value = y;
      }

      const attackButton = findGameButton(["zaútočit", "zautocit", "attack"]);
      if (attackButton) highlightAndFocus(attackButton);
    };

    const prepareSend = () => {
      const attack = selectedAttack();
      const timing = updateSlowest();

      if (!attack) return setStatus("Vyber konkrétní útok.", true);
      if (!attack.originCoord) return setStatus("Nepodařilo se zjistit původ útoku.", true);
      if (!timing || !Number.isFinite(timing.travel)) return setStatus("Nelze vypočítat cestovní dobu.", true);

      active = {
        attack,
        travel: timing.travel,
        targetReturn: attack.arrival - Math.max(0, Number($("#before").value) || 0),
        actualSend: null,
        cancelAt: null
      };

      const village = currentVillage();
      const [x, y] = attack.originCoord.split("|");
      $("#sendState").textContent = "NÁDVOŘÍ";
      setState("PŘÍPRAVA ODESLÁNÍ", "Herní tab se přepíná do nádvoří. Toto ovládací okno zůstává otevřené.");

      game().location.href = `/game.php?village=${encodeURIComponent(village.id)}&screen=place&x=${x}&y=${y}`;
      waitForGame(() => {
        fillCourtyard(attack);
        $("#prepareSend").textContent = "ODESLÁNO – ZAZNAMENAT ČAS";
        $("#prepareSend").onclick = recordActualSend;
        setStatus("Nádvoří je připravené. Odešli příkaz ručně Enterem a ihned klikni ODESLÁNO – ZAZNAMENAT ČAS.");
      });
    };

    const recordActualSend = () => {
      if (!active) return;

      active.actualSend = serverNow();
      active.cancelAt = Math.round((active.targetReturn + active.actualSend) / 2);
      const outwardDuration = active.cancelAt - active.actualSend;

      if (outwardDuration <= 0) return setStatus("Na tento útok je už pozdě.", true);
      if (outwardDuration >= active.travel) {
        return setStatus("Příkaz by došel do cíle dříve než okamžik zrušení. Vyber pozdější útok nebo pomalejší jednotku.", true);
      }

      $("#sendState").textContent = "ODESLÁNO";
      $("#sendExact").textContent = formatClock(active.actualSend);
      $("#returnExact").textContent = formatClock(active.cancelAt);
      $("#prepareSend").disabled = true;
      $("#prepareReturn").disabled = false;

      setState("ČEKÁM NA NÁVRAT", `Přesný čas návratu: ${formatClock(active.cancelAt)}`);
      clearInterval(timer);
      timer = setInterval(() => {
        if (!active?.cancelAt) return;
        const remaining = active.cancelAt - serverNow();
        $("#returnCountdown").textContent = remaining > 0 ? formatDuration(remaining) : "ENTER";
      }, 31);
    };

    const prepareReturn = () => {
      if (!active) return;

      const village = currentVillage();
      setState("NÁVRAT", "Herní tab se přepíná na odchozí příkazy.");
      game().location.href = `/game.php?village=${encodeURIComponent(village.id)}&screen=overview`;

      waitForGame(() => {
        const cancelButton = findGameButton(["zrušit", "zrusit", "cancel"]);
        if (!cancelButton) {
          setStatus("Tlačítko ZRUŠIT nebylo nalezeno. Otevři v herním tabu odchozí příkazy.", true);
          return;
        }

        highlightAndFocus(cancelButton);
        $("#resultButtons").style.display = "flex";
        setStatus("Tlačítko ZRUŠIT je zvýrazněné v herním tabu. Potvrď ho ručně Enterem.");
      });
    };

    const finishAttempt = result => {
      if (!active) return;

      active.attack.result = result;
      const flat = trains.flatMap(train => train.attacks);
      const currentIndex = flat.indexOf(active.attack);
      const next = flat[currentIndex + 1];

      clearInterval(timer);
      renderHistory();
      $("#resultButtons").style.display = "none";
      $("#prepareSend").disabled = false;
      $("#prepareSend").textContent = "PŘIPRAVIT NÁDVOŘÍ";
      $("#prepareSend").onclick = prepareSend;
      $("#prepareReturn").disabled = true;
      $("#sendState").textContent = "PŘIPRAVENO";
      $("#sendExact").textContent = "--:--:--.---";
      $("#returnCountdown").textContent = "--:--:--.---";
      $("#returnExact").textContent = "--:--:--.---";

      if (result === "missed" && next) {
        selectedKey = next.key;
        active = null;
        renderTrains();
        updateSlowest();
        setState("DALŠÍ POKUS", "Následující útok je vybraný. Jednotky zůstaly stejné.");
        setStatus("Nechycen. Vybral jsem následující útok. Nový návrat se spočítá z dalšího skutečného odeslání.");
      } else {
        active = null;
        setState(result === "caught" ? "CHYCEN" : "HOTOVO", result === "caught" ? "Pokus byl označen jako chycen." : "Další útok není dostupný.");
      }
    };

    $("#load").onclick = () => loadAttacks().catch(error => setStatus(error.message, true));
    $("#gap").onchange = () => { regroup(); renderTrains(); };
    $("#focusGame").onclick = () => game().focus();
    $("#close").onclick = () => window.close();
    $("#prepareSend").onclick = prepareSend;
    $("#prepareReturn").onclick = prepareReturn;
    $("#caught").onclick = () => finishAttempt("caught");
    $("#missed").onclick = () => finishAttempt("missed");

    setInterval(() => {
      try {
        if (!serverEpoch) syncServerTime();
        $("#clock").textContent = formatClock(serverNow());
      } catch {
        $("#clock").textContent = "HRA ODPOJENA";
      }
    }, 31);

    setInterval(() => {
      try {
        syncServerTime();
        $("#village").textContent = currentVillage().coord || "---";
      } catch {}
    }, 10000);

    (async () => {
      try {
        syncServerTime();
        $("#village").textContent = currentVillage().coord || "---";
        await loadUnitInfo();
        await loadAttacks();
        setState("PŘIPRAVEN", "Ovládací okno zůstává otevřené; herní tab se může přepínat.");
      } catch (error) {
        setStatus(`Spuštění selhalo: ${error.message}`, true);
        console.error("[Rayon Train Catcher Stable]", error);
      }
    })();
  }

  const existing = window.open("", POPUP_NAME);
  if (existing && !existing.closed && existing.document?.title === "Rayon Train Catcher") {
    existing.focus();
    return;
  }

  const popup = window.open("", POPUP_NAME, "width=1120,height=760,resizable=yes,scrollbars=yes");
  if (!popup) {
    alert("Prohlížeč zablokoval ovládací okno. Povol vyskakovací okna pro Tribal Wars a spusť skript znovu.");
    return;
  }

  popup.opener = window;
  popup.name = POPUP_NAME;
  popup.eval(`(${popupMain.toString()})();`);
  popup.focus();
})();