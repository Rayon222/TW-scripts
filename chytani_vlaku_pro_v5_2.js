(() => {
  "use strict";

  const APP_ID = "rayon-train-catcher-pro";
  const STORAGE_KEY = "rayonTrainCatcherV52State";
  const existing = document.getElementById(APP_ID);
  if (existing) existing.remove();

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  const formatTime = (timestamp) => {
    const d = new Date(timestamp);
    return (
      `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:` +
      `${pad(d.getMilliseconds(), 3)}`
    );
  };

  const formatCountdown = (ms) => {
    const sign = ms < 0 ? "-" : "";
    let n = Math.abs(Math.round(ms));
    const h = Math.floor(n / 3600000);
    n %= 3600000;
    const m = Math.floor(n / 60000);
    n %= 60000;
    const s = Math.floor(n / 1000);
    const milli = n % 1000;
    return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(milli, 3)}`;
  };

  const parseDuration = (value) => {
    const m = String(value).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
    if (!m) return null;
    const h = Number(m[1] || 0);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const ms = Number((m[4] || "0").padEnd(3, "0"));
    if (min > 59 || sec > 59) return null;
    return (((h * 60 + min) * 60 + sec) * 1000) + ms;
  };

  const parseDkLine = (line) => {
    const match = String(line).match(
      /Čas\s+příchodu:\s*(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2}):(\d{1,3})/i
    );
    if (!match) return null;

    let year = Number(match[3]);
    if (year < 100) year += 2000;

    const arrival = new Date(
      year,
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      Number(match[7].padEnd(3, "0"))
    ).getTime();

    if (Number.isNaN(arrival)) return null;

    return {
      arrival,
      coord: String(line).match(/\[coord\](\d{1,3}\|\d{1,3})\[\/coord\]/i)?.[1] || "",
      unit: String(line).match(/\[command\](snob|sword|spear|axe|light|heavy|ram|catapult|spy|archer|marcher)\[\/command\]/i)?.[1] || "",
      size: String(line).match(/\[command\](attack_small|attack_medium|attack_large)\[\/command\]/i)?.[1] || "",
      player: String(line).match(/\[player\](.*?)\[\/player\]/i)?.[1] || "",
      raw: line
    };
  };

  const serverOffset = (() => {
    const serverDate = document.querySelector("#serverDate")?.textContent?.trim();
    const serverTime = document.querySelector("#serverTime")?.textContent?.trim();
    if (!serverDate || !serverTime) return 0;

    const dm = serverDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const tm = serverTime.match(/^(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?$/);
    if (!dm || !tm) return 0;

    const serverTs = new Date(
      Number(dm[3]),
      Number(dm[2]) - 1,
      Number(dm[1]),
      Number(tm[1]),
      Number(tm[2]),
      Number(tm[3]),
      Number((tm[4] || "0").padEnd(3, "0"))
    ).getTime();

    return serverTs - Date.now();
  })();

  const now = () => Date.now() + serverOffset;

  const beep = (frequency = 850, duration = 70) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, duration);
    } catch {}
  };

  const findActionButton = (mode) => {
    const words = mode === "send"
      ? ["odeslat", "potvrdit", "send", "confirm"]
      : ["zrušit", "zrusit", "cancel"];

    return [...document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a.btn, a.button'
    )].find((el) => {
      if (el.closest(`#${APP_ID}`)) return false;
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const text = `${el.textContent || ""} ${el.value || ""} ${el.title || ""}`.toLowerCase();
      return visible && words.some((word) => text.includes(word));
    }) || null;
  };


  const UNIT_OPTIONS = [
    { id: "spy", label: "Špeh" },
    { id: "spear", label: "Kopiníci" },
    { id: "sword", label: "Šermíři" },
    { id: "axe", label: "Sekerníci" },
    { id: "archer", label: "Lučištníci" },
    { id: "light", label: "Lehká jízda" },
    { id: "heavy", label: "Těžká jízda" }
  ];

  const extractVillageId = (href) =>
    String(href || "").match(/[?&]village=(\d+)/)?.[1] || "";

  const currentVillage = () => {
    const id = String(window.game_data?.village?.id || extractVillageId(location.href));
    const coord = window.game_data?.village
      ? `${window.game_data.village.x}|${window.game_data.village.y}`
      : "";
    const name = String(window.game_data?.village?.name || "");
    return id ? { id, coord, name } : null;
  };

  const fillCommandForm = (doc, unit, count, targetCoord) => {
    try {
      const amount = Math.max(1, Number(count) || 1);
      const unitInput =
        doc.querySelector(`input[name="${unit}"]`) ||
        doc.querySelector(`#unit_input_${unit}`) ||
        doc.querySelector(`input[data-unit="${unit}"]`);

      if (unitInput) {
        unitInput.value = String(amount);
        unitInput.dispatchEvent(new Event("input", { bubbles: true }));
        unitInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const coordMatch = String(targetCoord || "").match(/(\d{1,3})\|(\d{1,3})/);
      const targetInput =
        doc.querySelector('input[name="input"]') ||
        doc.querySelector('#place_target input[type="text"]') ||
        doc.querySelector('input[name="target"]');

      if (targetInput && coordMatch) {
        targetInput.value = `${coordMatch[1]}|${coordMatch[2]}`;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return Boolean(unitInput);
    } catch {
      return false;
    }
  };

  const openAndPrefill = (villageId, targetCoord, unit, count) => {
    if (!villageId) return null;
    const coord = String(targetCoord || "").match(/(\d{1,3})\|(\d{1,3})/);
    const url = coord
      ? `/game.php?village=${encodeURIComponent(villageId)}&screen=place&x=${coord[1]}&y=${coord[2]}`
      : `/game.php?village=${encodeURIComponent(villageId)}&screen=place`;

    const popup = window.open(url, "_blank");
    if (!popup) return null;

    const started = Date.now();
    const timer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          return;
        }
        if (Date.now() - started > 15000) {
          clearInterval(timer);
          return;
        }
        if (popup.document?.readyState === "complete") {
          const ok = fillCommandForm(popup.document, unit, count, targetCoord);
          if (ok) {
            clearInterval(timer);
            popup.focus();
          }
        }
      } catch {}
    }, 250);

    return popup;
  };

  const app = document.createElement("div");
  app.id = APP_ID;
  app.style.cssText = [
    "position:fixed",
    "z-index:999999",
    "top:12px",
    "left:50%",
    "transform:translateX(-50%)",
    "width:min(980px,98vw)",
    "max-height:96vh",
    "overflow:auto",
    "background:#f4e4bc",
    "border:2px solid #7d510f",
    "border-radius:9px",
    "box-shadow:0 10px 35px rgba(0,0,0,.42)",
    "font-family:Arial,sans-serif",
    "color:#2b2114"
  ].join(";");

  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#c6a66b;border-bottom:1px solid #7d510f">
      <div>
        <b style="font-size:19px">Rayon – Chytání jednoho vlaku PRO v5.2</b>
        <div style="font-size:12px;margin-top:2px">Jednoduché nastavení, testovací režim a velký režim chytání</div>
      </div>
      <div style="display:flex;gap:7px">
        <button id="rtHelp" type="button">❓ Nápověda</button>
        <button id="rtClose" type="button">✕</button>
      </div>
    </div>

    <div style="padding:14px">
      <div id="rtSetupScreen">
      <label style="font-weight:bold">1. Vlož útoky z DK a vyber jeden vlak</label>
      <textarea id="rtInput" rows="6" style="width:100%;box-sizing:border-box;margin-top:5px;font-family:monospace"
        placeholder="[command]attack_large[/command] [command]snob[/command] [coord]567|449[/coord] --> Čas příchodu: 17.07.26 21:53:07:773"></textarea>

      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:10px">
        <button id="rtParseTrains" type="button" style="height:36px;font-weight:bold">NAČÍST VLAKY Z DK</button>
        <select id="rtTrainSelect" style="height:36px;width:100%">
          <option value="">Nejdříve načti vlaky</option>
        </select>
      </div>

      <div id="rtTestBanner" style="display:none;margin-top:12px;padding:10px;background:#ffe46b;border:2px solid #a06b00;border-radius:6px;font-weight:bold;text-align:center">
        🟡 TESTOVACÍ REŽIM – 1× ŠPEH
      </div>

      <div style="margin-top:12px;padding:10px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
        <b>2. Režim, odesílací vesnice a jednotky</b>
        <div style="margin-top:8px;padding:8px;background:#f4ead2;border-radius:5px">
          <label style="margin-right:18px"><input type="radio" name="rtMode" id="rtModeLive" value="live" checked> 🟢 Ostrý</label>
          <label><input type="radio" name="rtMode" id="rtModeTest" value="test"> 🟡 Testovací (1× špeh)</label>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-top:8px">
          <label>
            Odkud chytat vlak
            <select id="rtVillageMode" style="width:100%;height:34px;margin-top:4px">
              <option value="current">Automaticky z napadené vesnice</option>
              <option value="other">Z jiné vybrané vesnice</option>
            </select>
            <small id="rtCurrentVillageInfo">Použije se vesnice, ve které je skript právě spuštěný.</small>
          </label>
          <label>
            Jednotka
            <select id="rtUnit" style="width:100%;height:34px;margin-top:4px">
              ${UNIT_OPTIONS.map((u) => `<option value="${u.id}">${u.label}</option>`).join("")}
            </select>
          </label>
          <label>
            Počet
            <input id="rtUnitCount" type="number" min="1" value="1" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          </label>
        </div>
        <div id="rtOtherVillageBox" style="display:none;margin-top:9px">
          <button id="rtLoadVillages" type="button" style="height:34px">NAČÍST JINÉ VESNICE</button>
          <select id="rtVillageSelect" size="5" style="width:100%;box-sizing:border-box;margin-top:6px;font-family:monospace"></select>
          <small>Toto použij pouze tehdy, když nechceš chytat z napadené vesnice.</small>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:11px">
        <label>
          Limit zrušení
          <input id="rtLimit" value="00:10:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>
        <label>
          Návrat před dopadem
          <input id="rtBefore" value="00:00:00.250" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>
        <label>
          Korekce reakce
          <input id="rtReaction" type="number" value="150" step="10" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>ms dříve pro pokyn.</small>
        </label>
        <label>
          Další pokus za
          <input id="rtRetrySpacing" value="00:01:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>posun nového pokusu.</small>
        </label>
        <label>
          Varovat při rozestupu
          <input id="rtConflict" type="number" value="1500" step="100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>v milisekundách.</small>
        </label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button id="rtBuild" type="button" style="font-weight:bold;padding:8px 14px">VYTVOŘIT PLÁN</button>
        <button id="rtPrepare" type="button" style="padding:8px 14px;font-weight:bold">NAČÍST NÁDVOŘÍ DO OKNA</button>
        <button id="rtSentNow" type="button" style="padding:8px 14px">ODESLÁNO NYNÍ</button>
        <button id="rtDone" type="button" style="padding:8px 14px">HOTOVO / DALŠÍ</button>
        <button id="rtSkip" type="button" style="padding:8px 14px">PŘESKOČIT</button>
        <button id="rtSave" type="button" style="padding:8px 14px">ULOŽIT STAV</button>
      </div>

      <div id="rtStatus" style="margin-top:10px;font-weight:bold"></div>
      <div id="rtWarning" style="margin-top:7px;color:#9b0000;font-weight:bold"></div>
      </div>

      <div id="rtHuntScreen" style="display:none">
        <div id="rtHuntModeBanner" style="padding:10px;text-align:center;font-weight:bold;border-radius:6px;background:#d9f0d1;margin-bottom:10px">🟢 OSTRÝ REŽIM</div>
        <div id="rtHuntInfo" style="text-align:center;font-size:17px;font-weight:bold;margin-bottom:8px"></div>

      <div id="rtClock" style="margin-top:10px;padding:15px;background:#111;color:white;text-align:center;border-radius:7px">
        <div id="rtAction" style="font-size:20px">Připraveno</div>
        <div id="rtCountdown" style="font-family:monospace;font-size:46px;font-weight:bold;line-height:1.2">00:00:00.000</div>
        <div id="rtTarget" style="font-family:monospace;font-size:17px"></div>
        <div id="rtAfter" style="margin-top:8px;font-size:15px"></div>
      </div>
      <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:10px">
        <button id="rtBackSettings" type="button" style="padding:9px 14px">⚙ ZPĚT DO NASTAVENÍ</button>
        <button id="rtCancelPlan" type="button" style="padding:9px 14px;background:#a40000;color:white;font-weight:bold">❌ ZRUŠIT PLÁN</button>
        <button id="rtSentNowHunt" type="button" style="padding:9px 14px">ODESLÁNO NYNÍ</button>
        <button id="rtDoneHunt" type="button" style="padding:9px 14px">HOTOVO / DALŠÍ</button>
      </div>

      <div id="rtGameArea" style="margin-top:12px;border:2px solid #654321;border-radius:6px;overflow:hidden;background:white">
        <div style="padding:7px 10px;background:#e4d5b7;display:flex;justify-content:space-between;align-items:center;gap:8px">
          <b>Herní nádvoří v tomto okně</b>
          <span id="rtFrameState" style="font-size:12px">nenačteno</span>
        </div>
        <iframe id="rtGameFrame" title="Nádvoří" style="width:100%;height:520px;border:0;display:block;background:white"></iframe>
      </div>

      <div id="rtAttempts" style="margin-top:10px;padding:10px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
        <b>Výsledky pokusů</b>
        <div id="rtAttemptSummary" style="margin-top:6px;font-family:monospace;white-space:pre-wrap">Zatím žádný dokončený pokus.</div>
      </div>

      <div style="display:grid;grid-template-columns:1.3fr .7fr;gap:10px;margin-top:10px">
        <textarea id="rtQueue" rows="15" readonly style="width:100%;box-sizing:border-box;font-family:monospace"></textarea>
        <div style="background:#fff7df;border:1px solid #9b6b22;border-radius:5px;padding:10px">
          <b>Jak funguje přesný přepočet</b>
          <p style="margin:7px 0">Vlaky se rozloží postupně v celém dostupném okně. První začne 20 minut před návratem, další podle nastaveného rozestupu později.</p>
          <p style="margin:7px 0">Po skutečném ručním odeslání klikni okamžitě na <b>ODESLÁNO NYNÍ</b>.</p>
          <p style="margin:7px 0">Skript uloží skutečný čas odeslání a přepočítá čas zrušení tak, aby návrat vyšel do zvoleného cíle.</p>
          <p style="margin:7px 0">Při zrušení ukáže přesný odpočet, zvýrazní tlačítko a čeká na ruční Enter.</p>
          <p style="margin:7px 0"><b>Nic automaticky neodesílá ani neruší.</b></p>
        </div>
      </div>
    </div>

    <div id="rtModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000000;align-items:center;justify-content:center;padding:15px">
      <div style="width:min(620px,96vw);background:#f4e4bc;border:2px solid #7d510f;border-radius:9px;box-shadow:0 12px 45px rgba(0,0,0,.5)">
        <div id="rtModalTitle" style="padding:11px 14px;background:#c6a66b;border-bottom:1px solid #7d510f;font-size:18px;font-weight:bold"></div>
        <div id="rtModalBody" style="padding:14px;line-height:1.45"></div>
        <div id="rtModalButtons" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:0 14px 14px"></div>
      </div>
    </div>
  `;

  document.body.appendChild(app);

  const $ = (selector) => app.querySelector(selector);
  const status = (text) => $("#rtStatus").textContent = text;

  const closeModal = () => {
    $("#rtModal").style.display = "none";
    $("#rtModalButtons").innerHTML = "";
  };

  const showModal = ({ title, body, buttons }) => {
    $("#rtModalTitle").textContent = title;
    $("#rtModalBody").innerHTML = body;
    const wrap = $("#rtModalButtons");
    wrap.innerHTML = "";

    buttons.forEach(({ label, onClick, primary = false }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText = `padding:8px 13px;${primary ? "font-weight:bold;" : ""}`;
      button.onclick = () => onClick(closeModal);
      wrap.appendChild(button);
    });

    $("#rtModal").style.display = "flex";
  };

  let parsedTrains = [];
  let villages = [];
  let trains = [];
  let queue = [];
  let currentIndex = 0;
  let rafId = null;
  let highlighted = null;

  const clearHighlight = () => {
    if (!highlighted) return;
    highlighted.style.outline = highlighted.dataset.rtOldOutline || "";
    highlighted.style.boxShadow = highlighted.dataset.rtOldShadow || "";
    delete highlighted.dataset.rtOldOutline;
    delete highlighted.dataset.rtOldShadow;
    highlighted = null;
  };

  const stopTimer = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearHighlight();
  };


  const parseTrainInput = () => {
    parsedTrains = $("#rtInput").value
      .split(/\n+/)
      .map((line) => parseDkLine(line.trim()))
      .filter(Boolean)
      .sort((a, b) => a.arrival - b.arrival);

    const select = $("#rtTrainSelect");
    if (!parsedTrains.length) {
      select.innerHTML = '<option value="">Žádný vlak nebyl rozpoznán</option>';
      status("Nepodařilo se načíst žádný vlak z DK.");
      return;
    }

    select.innerHTML = parsedTrains.map((train, index) => {
      const info = [
        `Vlak ${index + 1}`,
        train.coord || "bez souřadnic",
        formatTime(train.arrival),
        train.unit || "neznámý typ",
        train.size || ""
      ].filter(Boolean).join(" – ");
      return `<option value="${index}">${info}</option>`;
    }).join("");

    status(`Načteno ${parsedTrains.length} vlaků. Vyber jeden.`);
  };

  const loadVillages = async () => {
    status("Načítám vesnice…");
    const map = new Map();
    const current = currentVillage();
    if (current) map.set(current.id, current);

    try {
      const response = await fetch("/game.php?screen=overview_villages&mode=combined&group=0&page=-1", {
        credentials: "same-origin"
      });
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      doc.querySelectorAll('a[href*="village="]').forEach((a) => {
        const id = extractVillageId(a.getAttribute("href"));
        const row = a.closest("tr");
        const text = `${a.textContent || ""} ${row?.textContent || ""}`;
        const coord = text.match(/(\d{1,3}\|\d{1,3})/)?.[1] || "";
        if (id && coord && !map.has(id)) {
          map.set(id, {
            id,
            coord,
            name: String(a.textContent || "").replace(/\s+/g, " ").trim()
          });
        }
      });
    } catch {}

    villages = [...map.values()];
    const select = $("#rtVillageSelect");
    select.innerHTML = villages.map((v) =>
      `<option value="${v.id}">${v.coord || "?"} – ${v.name || `vesnice ${v.id}`}</option>`
    ).join("");

    if (current) {
      const option = [...select.options].find((o) => o.value === current.id);
      if (option) option.selected = true;
    }

    status(villages.length ? `Načteno ${villages.length} vesnic.` : "Vesnice se nepodařilo načíst.");
  };

  const selectedVillageIds = () => [...$("#rtVillageSelect").selectedOptions].map((o) => o.value);

  const villageForAttempt = () => {
    const current = currentVillage();

    if ($("#rtVillageMode").value === "current") {
      return current?.id || "";
    }

    const ids = selectedVillageIds();
    return ids[0] || current?.id || "";
  };


  const gameFrame = () => $("#rtGameFrame");

  const frameDocument = () => {
    try { return gameFrame()?.contentDocument || null; } catch { return null; }
  };

  const frameWindow = () => {
    try { return gameFrame()?.contentWindow || null; } catch { return null; }
  };

  const setFrameState = (text) => {
    const el = $("#rtFrameState");
    if (el) el.textContent = text;
  };

  const findButtonInDocument = (doc, mode) => {
    if (!doc) return null;
    const words = mode === "send"
      ? ["útok", "utok", "zaútočit", "zautocit", "odeslat", "potvrdit", "attack", "send", "confirm"]
      : ["zrušit", "zrusit", "cancel"];

    return [...doc.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a.btn, a.button, a[href]'
    )].find((el) => {
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const text = `${el.textContent || ""} ${el.value || ""} ${el.title || ""}`.toLowerCase();
      const href = String(el.getAttribute?.("href") || "").toLowerCase();
      return visible && words.some((word) => text.includes(word) || href.includes(word));
    }) || null;
  };

  const clearFrameHighlight = () => {
    const doc = frameDocument();
    if (!doc) return;
    doc.querySelectorAll("[data-rt-frame-highlight]").forEach((el) => {
      el.style.outline = el.dataset.rtFrameOldOutline || "";
      el.style.boxShadow = el.dataset.rtFrameOldShadow || "";
      delete el.dataset.rtFrameHighlight;
      delete el.dataset.rtFrameOldOutline;
      delete el.dataset.rtFrameOldShadow;
    });
  };

  const highlightFrameButton = (mode) => {
    const doc = frameDocument();
    const button = findButtonInDocument(doc, mode);
    if (!button) {
      setFrameState(mode === "send" ? "čekám na tlačítko útoku/potvrzení" : "čekám na tlačítko zrušení");
      return false;
    }

    clearFrameHighlight();
    button.dataset.rtFrameHighlight = "1";
    button.dataset.rtFrameOldOutline = button.style.outline || "";
    button.dataset.rtFrameOldShadow = button.style.boxShadow || "";
    button.style.outline = "6px solid red";
    button.style.boxShadow = "0 0 24px red";
    button.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
      frameWindow()?.focus();
      button.focus({ preventScroll: true });
    } catch {
      try { button.focus(); } catch {}
    }

    setFrameState(mode === "send"
      ? "ENTER potvrzuje zvýrazněné herní tlačítko"
      : "ENTER ručně zruší příkaz");
    return true;
  };

  const fillFrameForm = (unit, count, targetCoord) => {
    const doc = frameDocument();
    if (!doc) return false;
    return fillCommandForm(doc, unit, count, targetCoord);
  };

  let frameWatcher = null;

  const stopFrameWatcher = () => {
    if (frameWatcher) clearInterval(frameWatcher);
    frameWatcher = null;
  };

  const watchFrameForManualFlow = () => {
    stopFrameWatcher();
    let lastUrl = "";

    frameWatcher = setInterval(() => {
      const frame = gameFrame();
      const doc = frameDocument();
      if (!frame || !doc) return;

      let url = "";
      try { url = frame.contentWindow.location.href; } catch {}

      if (url && url !== lastUrl) {
        lastUrl = url;
        setFrameState("načteno: " + (doc.title || "herní stránka"));
      }

      const item = queue[currentIndex];
      if (!item) return;

      if ($("#rtCountdown").textContent !== "STISKNI ENTER") return;

      if (item.mode === "send") {
        highlightFrameButton("send");
      } else {
        highlightFrameButton("cancel");
      }
    }, 350);
  };

  const loadCourtyardInFrame = () => {
    const item = queue[currentIndex] || queue.find((entry) => entry.mode === "send" && !entry.done);
    const selectedTrain = item ? trains[item.trainIndex] : parsedTrains[Number($("#rtTrainSelect").value)];
    const villageId = item?.villageId || villageForAttempt(item?.attemptNumber || 1) || currentVillage()?.id;
    const coord = selectedTrain?.coord || "";
    const coordMatch = String(coord).match(/(\d{1,3})\|(\d{1,3})/);

    if (!villageId) return status("Vyber odesílací vesnici.");
    if (!coordMatch) return status("Vybraný vlak nemá platné souřadnice.");

    const frame = gameFrame();
    const url = `/game.php?village=${encodeURIComponent(villageId)}&screen=place&x=${coordMatch[1]}&y=${coordMatch[2]}`;
    setFrameState("načítám nádvoří…");
    frame.src = url;

    frame.onload = () => {
      const current = queue[currentIndex] || item;
      const unit = current?.unit || $("#rtUnit").value;
      const count = current?.unitCount || Math.max(1, Number($("#rtUnitCount").value) || 1);
      fillFrameForm(unit, count, coord);
      setFrameState("nádvoří připraveno – zkontroluj cíl a jednotky");
      watchFrameForManualFlow();
    };

    status("Nádvoří se načítá přímo pod panelem. Zůstaneš v jednom okně.");
  };

  const prepareCurrentSend = () => {
    loadCourtyardInFrame();
  };

  const isTestMode = () => Boolean($("#rtModeTest")?.checked);

  const applyModeUi = () => {
    const test = isTestMode();
    $("#rtTestBanner").style.display = test ? "block" : "none";
    $("#rtUnit").disabled = test;
    $("#rtUnitCount").disabled = test;
    if (test) {
      $("#rtUnit").value = "spy";
      $("#rtUnitCount").value = "1";
    }
  };

  const showSetupScreen = () => {
    $("#rtSetupScreen").style.display = "block";
    $("#rtHuntScreen").style.display = "none";
  };

  const showHuntScreen = (train, unit, count) => {
    $("#rtSetupScreen").style.display = "none";
    $("#rtHuntScreen").style.display = "block";
    const test = isTestMode();
    $("#rtHuntModeBanner").textContent = test ? "🟡 TESTOVACÍ REŽIM – 1× ŠPEH" : "🟢 OSTRÝ REŽIM";
    $("#rtHuntModeBanner").style.background = test ? "#ffe46b" : "#d9f0d1";
    const unitLabel = UNIT_OPTIONS.find((u) => u.id === unit)?.label || unit;
    $("#rtHuntInfo").textContent = `Vlak z ${train.coord || "?"} | ${count}× ${unitLabel}`;
  };

  const cancelPlan = () => {
    stopTimer();
    stopFrameWatcher();
    queue = [];
    trains = [];
    currentIndex = 0;
    clearHighlight();
    clearFrameHighlight();
    $("#rtCountdown").textContent = "00:00:00.000";
    $("#rtAction").textContent = "Plán zrušen";
    $("#rtAfter").textContent = "";
    showSetupScreen();
    status("Plán byl zrušen.");
    saveState();
  };

  const saveState = () => {
    const state = {
      input: $("#rtInput").value,
      limit: $("#rtLimit").value,
      before: $("#rtBefore").value,
      reaction: $("#rtReaction").value,
      selectedTrain: $("#rtTrainSelect").value,
      runMode: isTestMode() ? "test" : "live",
      villageMode: $("#rtVillageMode").value,
      unit: $("#rtUnit").value,
      unitCount: $("#rtUnitCount").value,
      selectedVillages: [...$("#rtVillageSelect").selectedOptions].map((o) => o.value),
      retrySpacing: $("#rtRetrySpacing").value,
      conflict: $("#rtConflict").value,
      parsedTrains,
      villages,
      trains,
      queue,
      currentIndex
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    status("Stav uložen.");
  };

  const restoreState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      $("#rtInput").value = state.input || "";
      $("#rtLimit").value = state.limit || "00:10:00.000";
      $("#rtBefore").value = state.before || "00:00:00.250";
      $("#rtReaction").value = state.reaction ?? 150;
      $("#rtVillageMode").value = state.villageMode || "current";
      if (state.runMode === "test") $("#rtModeTest").checked = true;
      else $("#rtModeLive").checked = true;
      applyModeUi();
      $("#rtUnit").value = state.unit || "spear";
      $("#rtUnitCount").value = state.unitCount || 1;
      $("#rtRetrySpacing").value = state.retrySpacing || "00:01:00.000";
      $("#rtConflict").value = state.conflict ?? 1500;
      parsedTrains = Array.isArray(state.parsedTrains) ? state.parsedTrains : [];
      villages = Array.isArray(state.villages) ? state.villages : [];
      trains = Array.isArray(state.trains) ? state.trains : [];
      queue = Array.isArray(state.queue) ? state.queue : [];

      if (parsedTrains.length) {
        $("#rtTrainSelect").innerHTML = parsedTrains.map((train, index) =>
          `<option value="${index}">Vlak ${index + 1} – ${train.coord || "bez souřadnic"} – ${formatTime(train.arrival)} – ${train.unit || "neznámý typ"}</option>`
        ).join("");
        $("#rtTrainSelect").value = state.selectedTrain || "0";
      }

      if (villages.length) {
        $("#rtVillageSelect").innerHTML = villages.map((v) =>
          `<option value="${v.id}">${v.coord || "?"} – ${v.name || `vesnice ${v.id}`}</option>`
        ).join("");
        const selected = new Set(state.selectedVillages || []);
        [...$("#rtVillageSelect").options].forEach((o) => o.selected = selected.has(o.value));
      }
      currentIndex = Math.min(Number(state.currentIndex) || 0, Math.max(queue.length - 1, 0));
      renderQueue();
      renderCurrent();
      renderAttemptSummary();
      if (queue.length) status("Obnoven uložený stav.");
    } catch {}
  };

  const renderQueue = () => {
    const lines = [];
    queue.forEach((item, index) => {
      const marker = index === currentIndex ? ">>" : "  ";
      const done = item.done ? "✓" : " ";
      const label = item.mode === "send" ? "ODESLAT" : "ZRUŠIT";
      lines.push(
        `${marker}${done} ${String(index + 1).padStart(2, "0")}. ${label.padEnd(7)} ` +
        `vlak 1 / pokus ${item.attemptNumber || 1}${item.coord ? ` ${item.coord}` : ""}  ${formatTime(item.time)}` +
        (item.mode === "send" ? `  [vesnice ${item.villageId || "?"}, ${item.unitCount || 1}× ${item.unit || "?"}]` : "") +
        (item.mode === "send" && trains[item.trainIndex]?.roundTrip
          ? `  [start ${formatCountdown(trains[item.trainIndex].roundTrip)} před návratem]`
          : "")
      );
    });
    $("#rtQueue").value = lines.join("\n");
  };

  const renderCurrent = () => {
    const item = queue[currentIndex];
    if (!item) {
      $("#rtAction").textContent = queue.length ? "Fronta dokončena" : "Připraveno";
      $("#rtCountdown").textContent = queue.length ? "HOTOVO" : "00:00:00.000";
      $("#rtTarget").textContent = "";
      $("#rtAfter").textContent = "";
      return;
    }

    const label = item.mode === "send" ? "ODESLAT" : "ZRUŠIT";
    $("#rtAction").textContent = `${label} – vlak 1, pokus ${item.attemptNumber || 1}${item.coord ? ` – ${item.coord}` : ""}`;
    $("#rtTarget").textContent = `Plánovaný čas: ${formatTime(item.time)}`;

    const next = queue.slice(currentIndex + 1).find((entry) => !entry.done);
    $("#rtAfter").textContent = next
      ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1}, pokus ${next.attemptNumber || 1} za ${formatCountdown(next.time - now())}`
      : "Toto je poslední akce.";
  };

  const highlightActionButton = (mode) => {
    clearHighlight();

    if (highlightFrameButton(mode)) {
      status(
        mode === "send"
          ? "Skutečné herní tlačítko v nádvoří je zvýrazněné. Stiskni ENTER."
          : "Skutečné tlačítko Zrušit je zvýrazněné. Stiskni ENTER."
      );
      return;
    }

    const button = findActionButton(mode);
    if (!button) {
      status("Čas nastal. Herní tlačítko zatím nebylo nalezeno.");
      return;
    }

    highlighted = button;
    button.dataset.rtOldOutline = button.style.outline || "";
    button.dataset.rtOldShadow = button.style.boxShadow || "";
    button.style.outline = "5px solid red";
    button.style.boxShadow = "0 0 20px red";
    button.scrollIntoView({ behavior: "smooth", block: "center" });

    try { button.focus({ preventScroll: true }); } catch { button.focus(); }
    status("Tlačítko je zvýrazněné a má fokus. Stiskni ENTER.");
  };

  const startCurrent = () => {
    stopTimer();

    const item = queue[currentIndex];
    if (!item) {
      renderCurrent();
      status("Žádná další akce.");
      return;
    }

    const reaction = Number($("#rtReaction").value) || 0;
    const cueTime = item.time - reaction;
    let fired = false;
    let lastSecond = null;

    renderCurrent();
    $("#rtClock").style.background = "#111";

    const tick = () => {
      const remaining = cueTime - now();
      $("#rtCountdown").textContent = formatCountdown(remaining);

      const next = queue.slice(currentIndex + 1).find((entry) => !entry.done);
      $("#rtAfter").textContent = next
        ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1}, pokus ${next.attemptNumber || 1} za ${formatCountdown(next.time - now())}`
        : "Toto je poslední akce.";

      const second = Math.ceil(remaining / 1000);
      if (remaining > 0 && remaining <= 5000 && second !== lastSecond) {
        beep(700, 45);
        lastSecond = second;
      }

      if (remaining <= 0 && !fired) {
        fired = true;
        $("#rtCountdown").textContent = "STISKNI ENTER";
        $("#rtClock").style.background = "#7a0000";
        beep(1200, 180);
        setTimeout(() => beep(1200, 180), 220);
        highlightActionButton(item.mode);
      }

      if (remaining > -15000) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };

    rafId = requestAnimationFrame(tick);
    status(`Běží akce ${currentIndex + 1} z ${queue.length}.`);
  };

  const renderAttemptSummary = () => {
    const lines = [];
    trains.forEach((train, index) => {
      const attempts = Array.isArray(train.attempts) ? train.attempts : [];
      const state = train.caught ? "CHYCENO" : (attempts.length ? "zatím nechyceno" : "čeká");
      lines.push(`Vlak ${index + 1}${train.coord ? ` ${train.coord}` : ""}: ${state}, pokusů ${attempts.length}`);
      attempts.forEach((attempt) => {
        const result = attempt.result === "caught" ? "ANO" : attempt.result === "missed" ? "NE" : "NEURČENO";
        lines.push(`  pokus ${attempt.number}: ${result} | odeslání ${attempt.sentAt ? formatTime(attempt.sentAt) : "—"} | zrušení ${attempt.cancelAt ? formatTime(attempt.cancelAt) : "—"}`);
      });
    });
    $("#rtAttemptSummary").textContent = lines.length ? lines.join("\n") : "Zatím žádný dokončený pokus.";
  };

  const rebuildConflicts = () => {
    const threshold = Math.max(0, Number($("#rtConflict").value) || 0);
    const issues = [];

    for (let i = 1; i < queue.length; i++) {
      const gap = queue[i].time - queue[i - 1].time;
      if (gap < threshold) {
        issues.push(`akce ${i} a ${i + 1}: ${gap} ms`);
      }
    }

    $("#rtWarning").textContent = issues.length
      ? `POZOR – těsné akce: ${issues.join("; ")}`
      : "";
  };

  const buildPlan = () => {
    stopTimer();

    try {
      if (!parsedTrains.length) parseTrainInput();

      const selectedIndex = Number($("#rtTrainSelect").value);
      const sourceTrain = parsedTrains[selectedIndex];
      const limit = parseDuration($("#rtLimit").value);
      const before = parseDuration($("#rtBefore").value);
      const villageIds = selectedVillageIds();
      const unit = isTestMode() ? "spy" : $("#rtUnit").value;
      const unitCount = isTestMode() ? 1 : Math.max(1, Number($("#rtUnitCount").value) || 1);

      if (!sourceTrain) return status("Vyber jeden vlak.");
      if (!sourceTrain.coord) return status("Vybraný vlak nemá souřadnice výchozí vesnice.");
      if (limit === null || before === null) return status("Špatný formát času.");
      if (limit <= 0) return status("Limit zrušení musí být větší než 0.");
      if ($("#rtVillageMode").value === "current" && !currentVillage()) {
        return status("Skript musíš spustit ve vesnici, na kterou vlak přichází.");
      }
      if ($("#rtVillageMode").value === "other" && !villageIds.length) {
        return status("Pro režim jiné vesnice nejdříve načti a vyber vesnici.");
      }

      const train = { ...sourceTrain };
      const wantedReturn = train.arrival - before;
      const roundTrip = limit * 2;
      const plannedSend = wantedReturn - roundTrip;
      const plannedCancel = Math.round((wantedReturn + plannedSend) / 2);

      train.trainIndex = 0;
      train.wantedReturn = wantedReturn;
      train.roundTrip = roundTrip;
      train.outwardDuration = plannedCancel - plannedSend;
      train.plannedSend = plannedSend;
      train.plannedCancel = plannedCancel;
      train.actualSend = null;
      train.caught = false;
      train.attempts = [];
      train.nextAttemptNumber = 2;

      trains = [train];
      queue = [
        {
          id: "send-0-1",
          mode: "send",
          trainIndex: 0,
          attemptNumber: 1,
          coord: train.coord,
          villageId: villageForAttempt(1),
          unit,
          unitCount,
          time: plannedSend,
          done: false
        },
        {
          id: "cancel-0-1",
          mode: "cancel",
          trainIndex: 0,
          attemptNumber: 1,
          coord: train.coord,
          villageId: villageForAttempt(1),
          unit,
          unitCount,
          time: plannedCancel,
          done: false
        }
      ];

      queue.sort((a, b) => a.time - b.time);
      currentIndex = 0;
      rebuildConflicts();
      renderQueue();
      renderCurrent();
      renderAttemptSummary();
      $("#rtCountdown").textContent = "00:00:00.000";
      $("#rtClock").style.background = "#111";
      saveState();
      const sourceVillage = currentVillage();
      status(
        $("#rtVillageMode").value === "current"
          ? `Plán vytvořen. Chytání proběhne automaticky z napadené vesnice ${sourceVillage?.coord || sourceVillage?.id || ""}.`
          : "Plán vytvořen z jiné vybrané vesnice."
      );
      showHuntScreen(train, unit, unitCount);
      loadCourtyardInFrame();
      startCurrent();
    } catch (error) {
      status(error?.message || "Plán se nepodařilo vytvořit.");
    }
  };

  const recordSentNow = () => {
    if (!queue.length) return status("Nejdříve vytvoř plán.");

    const item = queue[currentIndex];
    if (!item || item.mode !== "send") {
      return status("Aktuální akce není ODESLAT.");
    }

    const train = trains[item.trainIndex];
    const actualSend = now();
    train.actualSend = actualSend;
    item.actualTime = actualSend;

    // Return time = cancel + (cancel - send), so:
    // cancel = (wantedReturn + actualSend) / 2
    const recalculatedCancel = Math.round((train.wantedReturn + actualSend) / 2);

    item.done = true;
    item.actualTime = actualSend;

    const cancelItem = queue.find((entry) =>
      entry.mode === "cancel" &&
      entry.trainIndex === item.trainIndex &&
      (entry.attemptNumber || 1) === (item.attemptNumber || 1) &&
      !entry.done
    );

    if (cancelItem) cancelItem.time = recalculatedCancel;

    queue.sort((a, b) => a.time - b.time);
    currentIndex = queue.findIndex((entry) => !entry.done);
    if (currentIndex < 0) currentIndex = queue.length;

    rebuildConflicts();
    renderQueue();
    renderCurrent();
    saveState();

    const difference = actualSend - train.plannedSend;
    status(
      `Skutečné odeslání uloženo (${difference >= 0 ? "+" : ""}${difference} ms proti plánu). ` +
      `Čas zrušení byl přepočítán.`
    );

    if (currentIndex < queue.length) {
      startCurrent();
      watchFrameForManualFlow();
    }
  };

  const scheduleRetry = (trainIndex, previousAttemptNumber) => {
    const train = trains[trainIndex];
    const retrySpacing = parseDuration($("#rtRetrySpacing").value);

    if (retrySpacing === null || retrySpacing <= 0) {
      status("Nastav platný kladný čas v poli Další pokus za.");
      return false;
    }

    const previousSend = train.attempts
      .filter((attempt) => attempt.number === previousAttemptNumber)
      .map((attempt) => attempt.sentAt || attempt.plannedSend)
      .find(Boolean) || train.plannedSend;

    const attemptNumber = Math.max(train.nextAttemptNumber || 2, previousAttemptNumber + 1);
    const plannedSend = previousSend + retrySpacing;
    const plannedCancel = Math.round((train.wantedReturn + plannedSend) / 2);
    const outwardDuration = plannedCancel - plannedSend;

    if (plannedSend >= train.wantedReturn || outwardDuration <= 0) {
      status("Na další pokus už před cílovým návratem nezbývá čas.");
      return false;
    }

    const sendItem = {
      id: `send-${trainIndex}-${attemptNumber}-${Date.now()}`,
      mode: "send",
      trainIndex,
      attemptNumber,
      coord: train.coord,
      villageId: villageForAttempt(attemptNumber),
      unit: $("#rtUnit").value,
      unitCount: Math.max(1, Number($("#rtUnitCount").value) || 1),
      time: plannedSend,
      done: false
    };

    const cancelItem = {
      id: `cancel-${trainIndex}-${attemptNumber}-${Date.now()}`,
      mode: "cancel",
      trainIndex,
      attemptNumber,
      coord: train.coord,
      villageId: villageForAttempt(attemptNumber),
      unit: $("#rtUnit").value,
      unitCount: Math.max(1, Number($("#rtUnitCount").value) || 1),
      time: plannedCancel,
      done: false
    };

    train.nextAttemptNumber = attemptNumber + 1;
    queue.push(sendItem, cancelItem);
    queue.sort((a, b) => a.time - b.time);
    currentIndex = queue.findIndex((entry) => !entry.done);
    if (currentIndex < 0) currentIndex = queue.length;

    rebuildConflicts();
    renderQueue();
    renderCurrent();
    renderAttemptSummary();
    saveState();
    status(`Naplánován pokus ${attemptNumber} pro vlak ${trainIndex + 1}.`);
    return true;
  };

  const confirmCatchResult = (item) => {
    const train = trains[item.trainIndex];
    const attemptNumber = item.attemptNumber || 1;
    const sendItem = queue.find((entry) =>
      entry.mode === "send" &&
      entry.trainIndex === item.trainIndex &&
      (entry.attemptNumber || 1) === attemptNumber
    );

    showModal({
      title: `Podařilo se chytit vlak ${item.trainIndex + 1}?`,
      body: `
        <p style="margin-top:0">Vyhodnoť výsledek pokusu <b>${attemptNumber}</b>${item.coord ? ` pro ${item.coord}` : ""}.</p>
        <p><b>ANO</b> označí vlak jako chycený.</p>
        <p><b>NE – DALŠÍ POKUS</b> uloží neúspěch a připraví další pokus posunutý o hodnotu „Další pokus za“.</p>
        <p><b>NEURČENO</b> pouze uloží pokus bez vytvoření dalšího.</p>
      `,
      buttons: [
        {
          label: "ANO – CHYCENO",
          primary: true,
          onClick: (close) => {
            close();
            train.caught = true;
            train.attempts.push({
              number: attemptNumber,
              result: "caught",
              sentAt: sendItem?.actualTime || sendItem?.time || null,
              cancelAt: item.actualTime || now(),
              plannedSend: sendItem?.time || null,
              plannedCancel: item.time
            });
            renderAttemptSummary();
            saveState();
            moveToNextAction("Vlak označen jako chycený.");
          }
        },
        {
          label: "NE – DALŠÍ POKUS",
          onClick: (close) => {
            close();
            train.attempts.push({
              number: attemptNumber,
              result: "missed",
              sentAt: sendItem?.actualTime || sendItem?.time || null,
              cancelAt: item.actualTime || now(),
              plannedSend: sendItem?.time || null,
              plannedCancel: item.time
            });
            renderAttemptSummary();
            saveState();
            const created = scheduleRetry(item.trainIndex, attemptNumber);
            moveToNextAction(created ? "Neúspěch uložen a přidán další pokus." : "Neúspěch uložen, další pokus už nelze naplánovat.");
          }
        },
        {
          label: "NEURČENO",
          onClick: (close) => {
            close();
            train.attempts.push({
              number: attemptNumber,
              result: "unknown",
              sentAt: sendItem?.actualTime || sendItem?.time || null,
              cancelAt: item.actualTime || now(),
              plannedSend: sendItem?.time || null,
              plannedCancel: item.time
            });
            renderAttemptSummary();
            saveState();
            moveToNextAction("Výsledek pokusu uložen jako neurčený.");
          }
        }
      ]
    });
  };

  const moveToNextAction = (message) => {
    currentIndex = queue.findIndex((entry) => !entry.done);
    if (currentIndex < 0) currentIndex = queue.length;

    renderQueue();
    renderCurrent();
    renderAttemptSummary();
    saveState();

    if (currentIndex < queue.length) {
      status(message);
      startCurrent();
    } else {
      status(message || "Všechny akce jsou hotové.");
    }
  };

  const markDoneAndNext = () => {
    if (!queue.length) return status("Nejdříve vytvoř plán.");

    const item = queue[currentIndex];
    if (!item) return status("Fronta je dokončena.");

    stopTimer();
    item.done = true;
    item.actualTime = now();

    renderQueue();
    renderCurrent();
    saveState();

    if (item.mode === "cancel") {
      confirmCatchResult(item);
      return;
    }

    moveToNextAction("Akce označena jako hotová.");
  };

  const skipCurrent = () => {
    if (!queue.length) return status("Nejdříve vytvoř plán.");

    const item = queue[currentIndex];
    if (!item) return status("Fronta je dokončena.");

    stopTimer();
    item.done = true;
    item.skipped = true;

    currentIndex = queue.findIndex((entry) => !entry.done);
    if (currentIndex < 0) currentIndex = queue.length;

    renderQueue();
    renderCurrent();
    saveState();
    status("Akce přeskočena.");
  };

  $("#rtHelp").onclick = () => {
    showModal({
      title: "Nápověda k tlačítkům",
      body: `
        <p><b>NAČÍST VLAKY Z DK</b><br>Rozpozná všechny vložené vlaky. Potom zvol jeden konkrétní vlak.</p>
        <p><b>NAPADENÁ VESNICE</b><br>Výchozí možnost. Skript automaticky použije vesnici, ve které je právě spuštěný.</p>
        <p><b>TESTOVACÍ REŽIM</b><br>Automaticky nastaví 1× špeh, uzamkne výběr jednotek a označí režim žlutým pruhem.</p>
        <p><b>REŽIM CHYTÁNÍ</b><br>Po vytvoření plánu se skryje nastavení a zůstane jen velký odpočet, nádvoří a nejdůležitější tlačítka.</p>
        <p><b>JINÁ VESNICE</b><br>Načítání seznamu vesnic se zobrazí pouze tehdy, když tuto možnost zvolíš.</p>
        <p><b>VYTVOŘIT PLÁN</b><br>Vytvoří plán pouze pro jeden vybraný vlak.</p>
        <p><b>NAČÍST NÁDVOŘÍ DO OKNA</b><br>Načte skutečné herní nádvoří do spodní části stejného okna, nastaví cíl a předvyplní jednotku.</p>
        <p><b>ENTER</b><br>Skript zvýrazní a zaměří skutečné herní tlačítko. Ty ho ručně potvrdíš klávesou ENTER. Na potvrzovací stránce znovu použiješ ENTER.</p>
        <p><b>ODPOČET</b><br>Po vytvoření plánu se spustí automaticky.</p>
        <p><b>ODESLÁNO NYNÍ</b><br>Klikni ihned po ručním odeslání. Skript uloží skutečný čas a přepočítá zrušení.</p>
        <p><b>HOTOVO / DALŠÍ</b><br>Označí aktuální akci jako hotovou. Po zrušení se zeptá, zda se vlak podařilo chytit.</p>
        <p><b>PŘESKOČIT</b><br>Přeskočí aktuální akci bez provedení.</p>
        <p><b>ULOŽIT STAV</b><br>Uloží plán, nastavení, výsledky a počet pokusů do prohlížeče.</p>
        <hr>
        <p><b>Další pokusy:</b> Po odpovědi „NE – DALŠÍ POKUS“ se vytvoří nový pokus pro stejný vlak. V režimu střídání se použije další označená vesnice.</p>
        <p><b>DŮLEŽITÉ:</b> Odeslání ani zrušení se neprovede samo. ENTER vždy ručně aktivuje skutečné herní tlačítko uvnitř vloženého nádvoří.</p>
        <p><b>BETA:</b> Po ručním odeslání klikni v panelu na ODESLÁNO NYNÍ, aby se přesně přepočítal čas zrušení.</p>
      `,
      buttons: [{ label: "ZAVŘÍT", primary: true, onClick: (close) => close() }]
    });
  };

  $("#rtClose").onclick = () => {
    stopTimer();
    app.remove();
  };
  const updateVillageModeUi = () => {
    const current = currentVillage();
    const isOther = $("#rtVillageMode").value === "other";
    $("#rtOtherVillageBox").style.display = isOther ? "block" : "none";
    $("#rtCurrentVillageInfo").textContent = current
      ? `Automaticky použita tato vesnice: ${current.coord || current.name || current.id}`
      : "Aktuální vesnici se nepodařilo rozpoznat.";
  };

  $("#rtVillageMode").onchange = () => {
    updateVillageModeUi();
    saveState();
  };

  updateVillageModeUi();

  $("#rtModeLive").onchange = () => { applyModeUi(); saveState(); };
  $("#rtModeTest").onchange = () => { applyModeUi(); saveState(); };
  $("#rtBackSettings").onclick = showSetupScreen;
  $("#rtCancelPlan").onclick = cancelPlan;
  $("#rtSentNowHunt").onclick = recordSentNow;
  $("#rtDoneHunt").onclick = finishCurrent;
  applyModeUi();

  $("#rtParseTrains").onclick = parseTrainInput;
  $("#rtLoadVillages").onclick = loadVillages;
  $("#rtBuild").onclick = buildPlan;
  $("#rtPrepare").onclick = loadCourtyardInFrame;
  $("#rtSentNow").onclick = recordSentNow;
  $("#rtDone").onclick = markDoneAndNext;
  $("#rtSkip").onclick = skipCurrent;
  $("#rtSave").onclick = saveState;

  restoreState();
  showSetupScreen();
})();