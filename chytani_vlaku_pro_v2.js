(() => {
  "use strict";

  const APP_ID = "rayon-train-catcher-pro";
  const STORAGE_KEY = "rayonTrainCatcherProStateV1";
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
        <b style="font-size:19px">Rayon – Chytání vlaků PRO</b>
        <div style="font-size:12px;margin-top:2px">Ruční potvrzení, přesný přepočet a fronta více vlaků</div>
      </div>
      <button id="rtClose" type="button">✕</button>
    </div>

    <div style="padding:14px">
      <label style="font-weight:bold">1. Vlož všechny útoky z DK</label>
      <textarea id="rtInput" rows="7" style="width:100%;box-sizing:border-box;margin-top:5px;font-family:monospace"
        placeholder="[command]attack_large[/command] [command]snob[/command] [coord]567|449[/coord] --> Čas příchodu: 17.07.26 21:53:07:773 [player]Rayon222[/player]"></textarea>

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
          Rozestup začátků
          <input id="rtTrainSpacing" value="00:02:30.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>např. 2 min 30 s.</small>
        </label>
        <label>
          Varovat při rozestupu
          <input id="rtConflict" type="number" value="1500" step="100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>v milisekundách.</small>
        </label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button id="rtBuild" type="button" style="font-weight:bold;padding:8px 14px">VYTVOŘIT PLÁN</button>
        <button id="rtStart" type="button" style="padding:8px 14px">SPUSTIT NEJBLIŽŠÍ AKCI</button>
        <button id="rtSentNow" type="button" style="padding:8px 14px">ODESLÁNO NYNÍ</button>
        <button id="rtDone" type="button" style="padding:8px 14px">HOTOVO / DALŠÍ</button>
        <button id="rtSkip" type="button" style="padding:8px 14px">PŘESKOČIT</button>
        <button id="rtSave" type="button" style="padding:8px 14px">ULOŽIT STAV</button>
      </div>

      <div id="rtStatus" style="margin-top:10px;font-weight:bold"></div>
      <div id="rtWarning" style="margin-top:7px;color:#9b0000;font-weight:bold"></div>

      <div id="rtClock" style="margin-top:10px;padding:15px;background:#111;color:white;text-align:center;border-radius:7px">
        <div id="rtAction" style="font-size:20px">Připraveno</div>
        <div id="rtCountdown" style="font-family:monospace;font-size:46px;font-weight:bold;line-height:1.2">00:00:00.000</div>
        <div id="rtTarget" style="font-family:monospace;font-size:17px"></div>
        <div id="rtAfter" style="margin-top:8px;font-size:15px"></div>
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
  `;

  document.body.appendChild(app);

  const $ = (selector) => app.querySelector(selector);
  const status = (text) => $("#rtStatus").textContent = text;

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

  const saveState = () => {
    const state = {
      input: $("#rtInput").value,
      limit: $("#rtLimit").value,
      before: $("#rtBefore").value,
      reaction: $("#rtReaction").value,
      trainSpacing: $("#rtTrainSpacing").value,
      conflict: $("#rtConflict").value,
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
      $("#rtTrainSpacing").value = state.trainSpacing || "00:02:30.000";
      $("#rtConflict").value = state.conflict ?? 1500;
      trains = Array.isArray(state.trains) ? state.trains : [];
      queue = Array.isArray(state.queue) ? state.queue : [];
      currentIndex = Math.min(Number(state.currentIndex) || 0, Math.max(queue.length - 1, 0));
      renderQueue();
      renderCurrent();
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
        `vlak ${item.trainIndex + 1}${item.coord ? ` ${item.coord}` : ""}  ${formatTime(item.time)}` +
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
    $("#rtAction").textContent = `${label} – vlak ${item.trainIndex + 1}${item.coord ? ` – ${item.coord}` : ""}`;
    $("#rtTarget").textContent = `Plánovaný čas: ${formatTime(item.time)}`;

    const next = queue.slice(currentIndex + 1).find((entry) => !entry.done);
    $("#rtAfter").textContent = next
      ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1} za ${formatCountdown(next.time - now())}`
      : "Toto je poslední akce.";
  };

  const highlightActionButton = (mode) => {
    clearHighlight();
    const button = findActionButton(mode);
    if (!button) {
      status("Čas nastal. Tlačítko nebylo nalezeno – potvrď ručně.");
      return;
    }

    highlighted = button;
    button.dataset.rtOldOutline = button.style.outline || "";
    button.dataset.rtOldShadow = button.style.boxShadow || "";
    button.style.outline = "5px solid red";
    button.style.boxShadow = "0 0 20px red";
    button.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
      button.focus({ preventScroll: true });
    } catch {
      button.focus();
    }

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
        ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1} za ${formatCountdown(next.time - now())}`
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
    const lines = $("#rtInput").value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const limit = parseDuration($("#rtLimit").value);
    const before = parseDuration($("#rtBefore").value);
    const trainSpacing = parseDuration($("#rtTrainSpacing").value);

    if (!lines.length) return status("Vlož útoky z DK.");
    if (limit === null || before === null || trainSpacing === null) return status("Špatný formát času.");
    if (limit <= 0) return status("Limit zrušení musí být větší než 0.");
    if (trainSpacing < 0) return status("Rozestup vlaků nesmí být záporný.");

    trains = lines.map(parseDkLine).filter(Boolean).sort((a, b) => a.arrival - b.arrival);
    if (!trains.length) return status("Nepodařilo se načíst žádný čas příchodu.");

    queue = [];

    // Maximální celková doba od odeslání do návratu je dvojnásobek limitu zrušení.
    // Každý další vlak začne o nastavený rozestup později.
    // Zrušení leží přesně v polovině mezi skutečným/plánovaným odesláním a cílovým návratem.
    trains.forEach((train, trainIndex) => {
      const wantedReturn = train.arrival - before;
      const maxRoundTrip = limit * 2;
      const roundTrip = maxRoundTrip - (trainIndex * trainSpacing);

      if (roundTrip <= 0) {
        throw new Error(
          `Pro vlak ${trainIndex + 1} už nezbývá kladný čas. ` +
          `Sniž rozestup začátků nebo počet vlaků.`
        );
      }

      const plannedSend = wantedReturn - roundTrip;
      const plannedCancel = Math.round((wantedReturn + plannedSend) / 2);
      const outwardDuration = plannedCancel - plannedSend;

      if (outwardDuration > limit) {
        throw new Error(`Vlak ${trainIndex + 1} překračuje limit zrušení.`);
      }

      train.trainIndex = trainIndex;
      train.wantedReturn = wantedReturn;
      train.roundTrip = roundTrip;
      train.outwardDuration = outwardDuration;
      train.plannedSend = plannedSend;
      train.plannedCancel = plannedCancel;
      train.actualSend = null;

      queue.push({
        id: `send-${trainIndex}`,
        mode: "send",
        trainIndex,
        coord: train.coord,
        time: plannedSend,
        done: false
      });

      queue.push({
        id: `cancel-${trainIndex}`,
        mode: "cancel",
        trainIndex,
        coord: train.coord,
        time: plannedCancel,
        done: false
      });
    });

    queue.sort((a, b) => a.time - b.time);
    currentIndex = 0;
    rebuildConflicts();
    renderQueue();
    renderCurrent();
    $("#rtCountdown").textContent = "00:00:00.000";
    $("#rtClock").style.background = "#111";
    saveState();
    status(`Plán vytvořen: ${trains.length} vlaků, ${queue.length} akcí.`);
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

    // Return time = cancel + (cancel - send), so:
    // cancel = (wantedReturn + actualSend) / 2
    const recalculatedCancel = Math.round((train.wantedReturn + actualSend) / 2);

    item.done = true;
    item.actualTime = actualSend;

    const cancelItem = queue.find((entry) =>
      entry.mode === "cancel" && entry.trainIndex === item.trainIndex && !entry.done
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

    if (currentIndex < queue.length) startCurrent();
  };

  const markDoneAndNext = () => {
    if (!queue.length) return status("Nejdříve vytvoř plán.");

    const item = queue[currentIndex];
    if (!item) return status("Fronta je dokončena.");

    stopTimer();
    item.done = true;
    item.actualTime = now();

    currentIndex = queue.findIndex((entry) => !entry.done);
    if (currentIndex < 0) currentIndex = queue.length;

    renderQueue();
    renderCurrent();
    saveState();

    if (currentIndex < queue.length) {
      startCurrent();
    } else {
      status("Všechny akce jsou hotové.");
    }
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

  $("#rtClose").onclick = () => {
    stopTimer();
    app.remove();
  };
  $("#rtBuild").onclick = buildPlan;
  $("#rtStart").onclick = startCurrent;
  $("#rtSentNow").onclick = recordSentNow;
  $("#rtDone").onclick = markDoneAndNext;
  $("#rtSkip").onclick = skipCurrent;
  $("#rtSave").onclick = saveState;

  restoreState();
})();