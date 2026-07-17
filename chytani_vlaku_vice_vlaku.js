(() => {
  "use strict";

  const ID = "mk-multi-train-queue";
  document.getElementById(ID)?.remove();

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  const parseDkLine = (line) => {
    const m = String(line).match(
      /Čas\s+příchodu:\s*(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2}):(\d{1,3})/i
    );
    if (!m) return null;

    let year = Number(m[3]);
    if (year < 100) year += 2000;

    const time = new Date(
      year,
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      Number(m[7].padEnd(3, "0"))
    ).getTime();

    if (Number.isNaN(time)) return null;

    const coord = String(line).match(/\[coord\](\d{1,3}\|\d{1,3})\[\/coord\]/i)?.[1] || "";
    return { time, coord, source: line };
  };

  const parseDuration = (value) => {
    const m = String(value).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!m) return null;

    const h = Number(m[1] || 0);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const ms = Number((m[4] || "0").padEnd(3, "0"));

    if (min > 59 || sec > 59) return null;
    return (((h * 60 + min) * 60 + sec) * 1000) + ms;
  };

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

  const findActionButton = (mode) => {
    const candidates = [...document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], a.btn, a.button'
    )];

    const words = mode === "send"
      ? ["odeslat", "potvrdit", "send", "confirm", "útok", "utok"]
      : ["zrušit", "zrusit", "cancel"];

    return candidates.find((el) => {
      const text = `${el.textContent || ""} ${el.value || ""} ${el.title || ""}`.toLowerCase();
      const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return visible && words.some((word) => text.includes(word));
    }) || null;
  };

  const beep = (frequency = 880, duration = 70) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, duration);
    } catch {}
  };

  const box = document.createElement("div");
  box.id = ID;
  box.style.cssText = [
    "position:fixed",
    "z-index:999999",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "width:min(900px,97vw)",
    "max-height:95vh",
    "overflow:auto",
    "background:#f4e4bc",
    "border:2px solid #7d510f",
    "border-radius:8px",
    "box-shadow:0 8px 28px rgba(0,0,0,.35)",
    "font-family:Arial,sans-serif",
    "color:#2b2114"
  ].join(";");

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:#c6a66b;border-bottom:1px solid #7d510f">
      <b style="font-size:18px">Více vlaků – fronta akcí</b>
      <button id="mkClose" type="button">✕</button>
    </div>

    <div style="padding:14px">
      <label>
        1. Vlož všechny vlaky z DK
        <textarea id="mkInput" rows="7" style="width:100%;box-sizing:border-box;margin-top:4px"
          placeholder="[command]attack_small[/command] [command]snob[/command] [coord]567|449[/coord] --> Čas příchodu: 17.07.26 21:53:07:956 [player]Rayon222[/player]"></textarea>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">
        <label>
          Limit zrušení
          <input id="mkLimit" value="00:10:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>

        <label>
          Návrat před dopadem
          <input id="mkBefore" value="00:00:00.100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>

        <label>
          Korekce reakce
          <input id="mkOffset" type="number" step="10" value="150" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>ms dříve kvůli reakci.</small>
        </label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button id="mkBuild" type="button" style="font-weight:bold;padding:8px 14px">Vytvořit frontu</button>
        <button id="mkStart" type="button" style="padding:8px 14px">Spustit frontu</button>
        <button id="mkDone" type="button" style="padding:8px 14px">HOTOVO / DALŠÍ</button>
        <button id="mkSkip" type="button" style="padding:8px 14px">Přeskočit</button>
      </div>

      <div id="mkStatus" style="margin-top:10px;font-weight:bold"></div>
      <div id="mkWarning" style="margin-top:8px;color:#9b0000;font-weight:bold"></div>

      <div id="mkClock" style="margin-top:10px;padding:14px;background:#111;color:#fff;text-align:center;border-radius:6px">
        <div id="mkClockLabel" style="font-size:18px">Fronta není spuštěna</div>
        <div id="mkCountdown" style="font-family:monospace;font-size:42px;font-weight:bold;line-height:1.2">00:00:00.000</div>
        <div id="mkTargetTime" style="font-family:monospace;font-size:17px"></div>
        <div id="mkNextAction" style="margin-top:8px;font-size:15px"></div>
      </div>

      <textarea id="mkOutput" rows="15" readonly style="width:100%;box-sizing:border-box;margin-top:10px;font-family:monospace"></textarea>

      <div style="margin-top:10px;padding:9px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
        Skript řadí všechny akce podle času. V cílový okamžik zvýrazní tlačítko a čeká na tvůj ruční Enter nebo kliknutí.
        Po provedení klikni <b>HOTOVO / DALŠÍ</b>.
      </div>
    </div>
  `;

  document.body.appendChild(box);

  const $ = (s) => box.querySelector(s);
  const status = (t) => $("#mkStatus").textContent = t;

  let queue = [];
  let currentIndex = 0;
  let raf = null;
  let highlightedButton = null;

  const clearHighlight = () => {
    if (!highlightedButton) return;
    highlightedButton.style.outline = highlightedButton.dataset.mkOldOutline || "";
    highlightedButton.style.boxShadow = highlightedButton.dataset.mkOldShadow || "";
    delete highlightedButton.dataset.mkOldOutline;
    delete highlightedButton.dataset.mkOldShadow;
    highlightedButton = null;
  };

  const stopCountdown = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    clearHighlight();
  };

  const highlightButton = (mode) => {
    clearHighlight();
    const button = findActionButton(mode);
    if (!button) {
      status("Čas nastal. Tlačítko se nepodařilo najít – klikni ručně.");
      return;
    }

    highlightedButton = button;
    button.dataset.mkOldOutline = button.style.outline || "";
    button.dataset.mkOldShadow = button.style.boxShadow || "";
    button.style.outline = "5px solid red";
    button.style.boxShadow = "0 0 18px red";
    button.scrollIntoView({ behavior: "smooth", block: "center" });

    try {
      button.focus({ preventScroll: true });
    } catch {
      button.focus();
    }

    status("Tlačítko je zvýrazněné. Stiskni ENTER a potom HOTOVO / DALŠÍ.");
  };

  const renderQueue = () => {
    const lines = [];
    queue.forEach((item, i) => {
      const marker = i === currentIndex ? ">> " : "   ";
      lines.push(
        `${marker}${String(i + 1).padStart(2, "0")}. ${item.mode === "send" ? "ODESLAT" : "ZRUŠIT"} ` +
        `vlak ${item.trainIndex + 1}${item.coord ? ` (${item.coord})` : ""} – ${formatTime(item.time)}`
      );
    });
    $("#mkOutput").value = lines.join("\n");
  };

  const updateNextInfo = () => {
    const current = queue[currentIndex];
    const next = queue[currentIndex + 1];

    if (!current) {
      $("#mkClockLabel").textContent = "Fronta dokončena";
      $("#mkCountdown").textContent = "HOTOVO";
      $("#mkTargetTime").textContent = "";
      $("#mkNextAction").textContent = "";
      return;
    }

    $("#mkClockLabel").textContent =
      `${current.mode === "send" ? "ODESLAT" : "ZRUŠIT"} – vlak ${current.trainIndex + 1}` +
      `${current.coord ? ` – ${current.coord}` : ""}`;

    $("#mkTargetTime").textContent = `Plánovaný čas: ${formatTime(current.time)}`;

    $("#mkNextAction").textContent = next
      ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1} za ${formatCountdown(next.time - Date.now())}`
      : "Toto je poslední akce.";
  };

  const startCurrent = () => {
    stopCountdown();

    const item = queue[currentIndex];
    if (!item) {
      updateNextInfo();
      status("Všechny akce jsou dokončené.");
      return;
    }

    const offset = Number($("#mkOffset").value) || 0;
    const target = item.time - offset;
    let lastWhole = null;
    let fired = false;

    updateNextInfo();
    $("#mkClock").style.background = "#111";

    const tick = () => {
      const remain = target - Date.now();
      $("#mkCountdown").textContent = formatCountdown(remain);

      const next = queue[currentIndex + 1];
      $("#mkNextAction").textContent = next
        ? `Potom: ${next.mode === "send" ? "ODESLAT" : "ZRUŠIT"} vlak ${next.trainIndex + 1} za ${formatCountdown(next.time - Date.now())}`
        : "Toto je poslední akce.";

      const whole = Math.ceil(remain / 1000);
      if (remain > 0 && remain <= 5000 && whole !== lastWhole) {
        beep(700, 45);
        lastWhole = whole;
      }

      if (remain <= 0 && !fired) {
        fired = true;
        $("#mkCountdown").textContent = "STISKNI ENTER";
        $("#mkClock").style.background = "#7a0000";
        beep(1200, 180);
        setTimeout(() => beep(1200, 180), 220);
        highlightButton(item.mode);
      }

      if (remain > -10000) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    };

    raf = requestAnimationFrame(tick);
    status(`Fronta běží: akce ${currentIndex + 1} z ${queue.length}.`);
  };

  $("#mkClose").onclick = () => {
    stopCountdown();
    box.remove();
  };

  $("#mkBuild").onclick = () => {
    stopCountdown();

    const lines = $("#mkInput").value.split(/\n+/).map(v => v.trim()).filter(Boolean);
    if (!lines.length) return status("Vlož všechny řádky z DK.");

    const limit = parseDuration($("#mkLimit").value);
    const before = parseDuration($("#mkBefore").value);

    if (limit === null || before === null) return status("Špatný formát času.");
    if (limit <= 0) return status("Limit zrušení musí být větší než 0.");

    const attacks = lines.map(parseDkLine).filter(Boolean).sort((a, b) => a.time - b.time);
    if (!attacks.length) return status("Nepodařilo se načíst žádný čas z DK.");

    queue = [];
    attacks.forEach((attack, trainIndex) => {
      const returnAt = attack.time - before;
      const cancelAt = returnAt - limit;
      const sendAt = cancelAt - limit;

      queue.push({
        mode: "send",
        time: sendAt,
        trainIndex,
        coord: attack.coord
      });

      queue.push({
        mode: "cancel",
        time: cancelAt,
        trainIndex,
        coord: attack.coord
      });
    });

    queue.sort((a, b) => a.time - b.time);
    currentIndex = 0;

    const conflicts = [];
    for (let i = 1; i < queue.length; i++) {
      const gap = queue[i].time - queue[i - 1].time;
      if (gap < 1500) {
        conflicts.push(
          `Akce ${i} a ${i + 1} jsou od sebe jen ${gap} ms.`
        );
      }
    }

    $("#mkWarning").textContent = conflicts.length
      ? `POZOR: ${conflicts.join(" ")}`
      : "";

    renderQueue();
    updateNextInfo();
    $("#mkCountdown").textContent = "00:00:00.000";
    $("#mkClock").style.background = "#111";
    status(`Fronta vytvořena: ${queue.length} akcí pro ${attacks.length} vlaků.`);
  };

  $("#mkStart").onclick = () => {
    if (!queue.length) return status("Nejdříve vytvoř frontu.");
    startCurrent();
  };

  $("#mkDone").onclick = () => {
    if (!queue.length) return status("Nejdříve vytvoř frontu.");
    stopCountdown();
    currentIndex += 1;
    renderQueue();
    if (currentIndex >= queue.length) {
      updateNextInfo();
      status("Všechny akce jsou hotové.");
      return;
    }
    startCurrent();
  };

  $("#mkSkip").onclick = () => {
    if (!queue.length) return status("Nejdříve vytvoř frontu.");
    stopCountdown();
    currentIndex += 1;
    renderQueue();
    updateNextInfo();
    status(currentIndex < queue.length ? "Akce přeskočena." : "Fronta dokončena.");
  };
})();