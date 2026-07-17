(() => {
  "use strict";

  const ID = "mk-simple-snipe-precision";
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
    return { time, coord };
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

  const serverNow = () => {
    const dateEl = document.querySelector("#serverDate");
    const timeEl = document.querySelector("#serverTime");
    if (!dateEl || !timeEl) return Date.now();

    const dm = dateEl.textContent.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const tm = timeEl.textContent.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?::(\d{1,3}))?$/);
    if (!dm || !tm) return Date.now();

    return new Date(
      Number(dm[3]),
      Number(dm[2]) - 1,
      Number(dm[1]),
      Number(tm[1]),
      Number(tm[2]),
      Number(tm[3]),
      Number((tm[4] || "0").padEnd(3, "0"))
    ).getTime();
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
    "top:20px",
    "left:50%",
    "transform:translateX(-50%)",
    "width:min(820px,96vw)",
    "max-height:94vh",
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
      <b style="font-size:18px">Přesné chytání vlaku</b>
      <button id="mkClose" type="button">✕</button>
    </div>

    <div style="padding:14px">
      <label>
        1. Vlož vlak z DK
        <textarea id="mkInput" rows="7" style="width:100%;box-sizing:border-box;margin-top:4px"
          placeholder="[command]attack_small[/command] [command]snob[/command] [coord]567|449[/coord] --> Čas příchodu: 17.07.26 21:53:07:956 [player]Rayon222[/player]"></textarea>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px">
        <label>
          Zrušit útok po
          <input id="mkAway" value="00:19:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>

        <label>
          Návrat před dopadem
          <input id="mkBefore" value="00:00:00.100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
        </label>

        <label>
          Korekce kliknutí
          <input id="mkClickOffset" type="number" step="10" value="150" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>ms dříve kvůli reakci.</small>
        </label>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button id="mkCalc" type="button" style="font-weight:bold;padding:8px 14px">Vypočítat</button>
        <button id="mkStartSend" type="button" style="padding:8px 14px">Odpočet ODESLAT</button>
        <button id="mkStartCancel" type="button" style="padding:8px 14px">Odpočet ZRUŠIT</button>
        <button id="mkNext" type="button" style="padding:8px 14px">Další útok</button>
      </div>

      <div id="mkMsg" style="margin-top:10px;font-weight:bold"></div>

      <div id="mkClock" style="margin-top:10px;padding:14px;background:#111;color:#fff;text-align:center;border-radius:6px">
        <div id="mkClockLabel" style="font-size:18px">Odpočet není spuštěn</div>
        <div id="mkCountdown" style="font-family:monospace;font-size:42px;font-weight:bold;line-height:1.2">00:00:00.000</div>
        <div id="mkTargetTime" style="font-family:monospace;font-size:18px"></div>
      </div>

      <textarea id="mkOutput" rows="12" readonly style="width:100%;box-sizing:border-box;margin-top:10px;font-family:monospace"></textarea>

      <div style="margin-top:10px;padding:9px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
        Skript pouze ukazuje přesný odpočet a zvukové signály. Kliknutí ve hře provádíš ručně.
        Pro vyšší přesnost zavři ostatní náročné karty a nastav korekci kliknutí podle své reakce, obvykle 100–250 ms.
      </div>
    </div>
  `;

  document.body.appendChild(box);

  const $ = (s) => box.querySelector(s);
  const msg = (t) => $("#mkMsg").textContent = t;

  let plans = [];
  let currentIndex = 0;
  let raf = null;
  let lastSecond = null;
  let fired = false;

  const stopCountdown = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastSecond = null;
    fired = false;
  };

  const startCountdown = (mode) => {
    if (!plans.length) return msg("Nejdříve klikni na Vypočítat.");

    stopCountdown();

    const plan = plans[currentIndex];
    const offset = Number($("#mkClickOffset").value) || 0;
    const rawTarget = mode === "send" ? plan.sendAt : plan.cancelAt;
    const target = rawTarget - offset;

    $("#mkClockLabel").textContent =
      `${mode === "send" ? "ODESLAT" : "ZRUŠIT"} – útok ${currentIndex + 1}${plan.coord ? ` – ${plan.coord}` : ""}`;
    $("#mkTargetTime").textContent =
      `Cílový čas kliknutí: ${formatTime(target)} | plánovaný čas: ${formatTime(rawTarget)}`;

    const tick = () => {
      const now = Date.now();
      const remain = target - now;
      $("#mkCountdown").textContent = formatCountdown(remain);

      const whole = Math.ceil(remain / 1000);
      if (remain > 0 && remain <= 5000 && whole !== lastSecond) {
        beep(660, 45);
        lastSecond = whole;
      }

      if (remain <= 0 && !fired) {
        fired = true;
        $("#mkCountdown").textContent = "KLIKNI TEĎ";
        $("#mkClock").style.background = "#7a0000";
        beep(1200, 180);
        setTimeout(() => beep(1200, 180), 220);
      }

      if (remain > -3000) {
        raf = requestAnimationFrame(tick);
      } else {
        $("#mkClock").style.background = "#111";
        raf = null;
      }
    };

    $("#mkClock").style.background = "#111";
    raf = requestAnimationFrame(tick);
    msg(`Odpočet spuštěn pro útok ${currentIndex + 1}.`);
  };

  $("#mkClose").onclick = () => {
    stopCountdown();
    box.remove();
  };

  $("#mkCalc").onclick = () => {
    stopCountdown();

    const lines = $("#mkInput").value.split(/\n+/).map(v => v.trim()).filter(Boolean);
    if (!lines.length) return msg("Vlož řádky z DK.");

    const away = parseDuration($("#mkAway").value);
    const before = parseDuration($("#mkBefore").value);

    if (away === null || before === null) return msg("Špatný formát času.");
    if (away <= 0 || away > 20 * 60 * 1000) return msg("Doba do zrušení musí být maximálně 20 minut.");

    const attacks = lines.map(parseDkLine).filter(Boolean).sort((a, b) => a.time - b.time);
    if (!attacks.length) return msg("Nepodařilo se načíst žádný čas z DK.");

    plans = attacks.map((attack) => {
      const returnAt = attack.time - before;
      const cancelAt = returnAt - away;
      const sendAt = cancelAt - away;
      return { ...attack, sendAt, cancelAt, returnAt };
    });

    currentIndex = 0;

    const output = [];
    plans.forEach((plan, i) => {
      output.push(`ÚTOK ${i + 1}${plan.coord ? ` – ${plan.coord}` : ""}`);
      output.push(`DOPAD:   ${formatTime(plan.time)}`);
      output.push(`ODESLAT: ${formatTime(plan.sendAt)}`);
      output.push(`ZRUŠIT:  ${formatTime(plan.cancelAt)}`);
      output.push(`NÁVRAT:  ${formatTime(plan.returnAt)}`);
      output.push("");
    });

    $("#mkOutput").value = output.join("\n");
    $("#mkClockLabel").textContent = `Připraven útok 1 z ${plans.length}`;
    $("#mkTargetTime").textContent = "";
    $("#mkCountdown").textContent = "00:00:00.000";
    msg(`Hotovo: ${plans.length} útoků. Spusť odpočet ODESLAT nebo ZRUŠIT.`);
  };

  $("#mkStartSend").onclick = () => startCountdown("send");
  $("#mkStartCancel").onclick = () => startCountdown("cancel");

  $("#mkNext").onclick = () => {
    if (!plans.length) return msg("Nejdříve klikni na Vypočítat.");
    stopCountdown();
    currentIndex = (currentIndex + 1) % plans.length;
    $("#mkClockLabel").textContent = `Připraven útok ${currentIndex + 1} z ${plans.length}`;
    $("#mkCountdown").textContent = "00:00:00.000";
    $("#mkTargetTime").textContent = "";
    $("#mkClock").style.background = "#111";
    msg(`Vybrán útok ${currentIndex + 1}.`);
  };
})();