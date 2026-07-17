(() => {
  "use strict";

  const ID = "mk-train-catcher";
  document.getElementById(ID)?.remove();

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  const parseDateTime = (value) => {
    const m = String(value || "").trim().match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
    );
    if (!m) return null;
    const ms = Number((m[7] || "0").padEnd(3, "0"));
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      ms
    );
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };

  const formatDateTime = (timestamp) => {
    const d = new Date(timestamp);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
      `${pad(d.getMilliseconds(), 3)}`
    );
  };

  const parseDuration = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      return Number(text) * 60_000;
    }

    const m = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (!m) return null;

    const hours = Number(m[1] || 0);
    const minutes = Number(m[2]);
    const seconds = Number(m[3]);
    const ms = Number((m[4] || "0").padEnd(3, "0"));

    if (minutes > 59 || seconds > 59) return null;
    return (((hours * 60 + minutes) * 60 + seconds) * 1000) + ms;
  };

  const formatDuration = (ms) => {
    const sign = ms < 0 ? "-" : "";
    let n = Math.abs(Math.round(ms));
    const hours = Math.floor(n / 3_600_000);
    n %= 3_600_000;
    const minutes = Math.floor(n / 60_000);
    n %= 60_000;
    const seconds = Math.floor(n / 1000);
    const millis = n % 1000;
    return `${sign}${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
  };

  const serverNowText = () => {
    const dateEl = document.querySelector("#serverDate");
    const timeEl = document.querySelector("#serverTime");
    if (!dateEl || !timeEl) return "";
    const date = dateEl.textContent.trim();
    const time = timeEl.textContent.trim();
    const dm = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dm) return "";
    return `${dm[3]}-${pad(dm[2])}-${pad(dm[1])} ${time}`;
  };

  const panel = document.createElement("div");
  panel.id = ID;
  panel.style.cssText = [
    "position:fixed",
    "z-index:999999",
    "top:30px",
    "left:50%",
    "transform:translateX(-50%)",
    "width:min(980px,96vw)",
    "max-height:90vh",
    "overflow:auto",
    "background:#f4e4bc",
    "border:2px solid #7d510f",
    "border-radius:8px",
    "box-shadow:0 8px 30px rgba(0,0,0,.35)",
    "font-family:Arial,sans-serif",
    "color:#2b2114"
  ].join(";");

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#c6a66b;border-bottom:1px solid #7d510f">
      <strong style="font-size:19px">Chytání vlaku – kalkulačka odjezdu a stažení</strong>
      <button id="mkTcClose" type="button" style="font-size:18px">✕</button>
    </div>

    <div style="padding:14px">
      <div style="padding:10px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px;margin-bottom:12px">
        <b>Princip:</b> vojsko odešleš pryč a příkaz ručně zrušíš. Po zrušení se vrací stejně dlouho, jako bylo na cestě.
        Skript pouze vypočítává časy; nic automaticky neposílá ani neruší.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label>
          Časy dopadu šlechticů / útoků
          <textarea id="mkTcArrivals" rows="8" placeholder="2026-07-17 21:00:00.200&#10;2026-07-17 21:00:00.350" style="width:100%;box-sizing:border-box;margin-top:4px"></textarea>
          <small>Každý čas na nový řádek. Milisekundy jsou podporované.</small>
        </label>

        <div>
          <label>
            Návrat vojska před dopadem
            <input id="mkTcReturnBefore" value="00:00:00.100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
            <small>Například 100 ms před útokem: 00:00:00.100</small>
          </label>

          <label style="display:block;margin-top:10px">
            Maximální doba do zrušení příkazu
            <input id="mkTcCancelLimit" value="00:20:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
            <small>Výchozí hodnota 20 minut.</small>
          </label>

          <label style="display:block;margin-top:10px">
            Skutečná doba cesty k cíli
            <input id="mkTcTravelTime" value="00:30:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
            <small>Musí být delší než doba do zrušení, jinak vojsko dorazí dřív.</small>
          </label>

          <label style="display:block;margin-top:10px">
            Počet variant pro každý útok
            <input id="mkTcOptions" type="number" min="1" max="20" value="5" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          </label>

          <label style="display:block;margin-top:10px">
            Rozestup mezi variantami
            <input id="mkTcStep" value="00:02:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
            <small>Například další varianta vždy o 2 minuty dříve.</small>
          </label>
        </div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
        <button id="mkTcNow" type="button">Vložit aktuální serverový čas</button>
        <button id="mkTcCalc" type="button" style="font-weight:bold">Vypočítat možnosti</button>
        <button id="mkTcCopy" type="button">Kopírovat výsledek</button>
      </div>

      <div id="mkTcMessage" style="font-weight:bold;margin-bottom:8px"></div>
      <textarea id="mkTcOutput" rows="18" readonly style="width:100%;box-sizing:border-box;font-family:monospace"></textarea>
    </div>
  `;

  document.body.appendChild(panel);

  const $ = (selector) => panel.querySelector(selector);
  const message = (text) => {
    $("#mkTcMessage").textContent = text;
  };

  $("#mkTcClose").addEventListener("click", () => panel.remove());

  $("#mkTcNow").addEventListener("click", () => {
    const now = serverNowText();
    if (!now) {
      message("Serverový čas se nepodařilo načíst.");
      return;
    }
    const current = $("#mkTcArrivals").value.trim();
    $("#mkTcArrivals").value = current ? `${current}\n${now}` : now;
    message("Aktuální serverový čas byl vložen.");
  });

  $("#mkTcCalc").addEventListener("click", () => {
    const lines = $("#mkTcArrivals").value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      message("Zadej alespoň jeden čas dopadu.");
      return;
    }

    const arrivals = [];
    const invalid = [];
    for (const line of lines) {
      const parsed = parseDateTime(line);
      if (parsed === null) invalid.push(line);
      else arrivals.push({ text: line, time: parsed });
    }

    if (invalid.length) {
      message(`Neplatné časy: ${invalid.join(", ")}`);
      return;
    }

    const returnBefore = parseDuration($("#mkTcReturnBefore").value);
    const cancelLimit = parseDuration($("#mkTcCancelLimit").value);
    const travelTime = parseDuration($("#mkTcTravelTime").value);
    const step = parseDuration($("#mkTcStep").value);
    const optionCount = Number($("#mkTcOptions").value);

    if ([returnBefore, cancelLimit, travelTime, step].some((v) => v === null)) {
      message("Zkontroluj formát časových intervalů.");
      return;
    }
    if (!Number.isInteger(optionCount) || optionCount < 1 || optionCount > 20) {
      message("Počet variant musí být celé číslo od 1 do 20.");
      return;
    }
    if (cancelLimit <= 0 || step <= 0 || travelTime <= 0) {
      message("Časové intervaly musí být větší než nula.");
      return;
    }

    const maxAway = Math.min(cancelLimit, travelTime - 1);
    if (maxAway <= 0) {
      message("Doba cesty k cíli musí být delší než doba před zrušením.");
      return;
    }

    const output = [];
    output.push("CHYTÁNÍ VLAKU – PLÁN");
    output.push(`Návrat před dopadem: ${formatDuration(returnBefore)}`);
    output.push(`Limit zrušení: ${formatDuration(cancelLimit)}`);
    output.push(`Doba cesty k cíli: ${formatDuration(travelTime)}`);
    output.push("");

    arrivals.sort((a, b) => a.time - b.time);

    arrivals.forEach((arrival, arrivalIndex) => {
      const desiredReturn = arrival.time - returnBefore;
      output.push(`ÚTOK ${arrivalIndex + 1}: dopad ${formatDateTime(arrival.time)}`);
      output.push(`Požadovaný návrat: ${formatDateTime(desiredReturn)}`);

      let produced = 0;
      for (let i = 0; i < optionCount; i++) {
        const awayDuration = maxAway - i * step;
        if (awayDuration <= 0) break;

        const cancelAt = desiredReturn - awayDuration;
        const sendAt = cancelAt - awayDuration;

        output.push(
          `${produced + 1}. ODESLAT ${formatDateTime(sendAt)} | ` +
          `ZRUŠIT ${formatDateTime(cancelAt)} | ` +
          `na cestě ${formatDuration(awayDuration)}`
        );
        produced++;
      }

      if (!produced) {
        output.push("Žádná platná varianta pro zadané nastavení.");
      }
      output.push("");
    });

    $("#mkTcOutput").value = output.join("\n");
    message(`Hotovo: ${arrivals.length} útoků, maximálně ${optionCount} variant na každý.`);
  });

  $("#mkTcCopy").addEventListener("click", async () => {
    const value = $("#mkTcOutput").value;
    if (!value) {
      message("Nejdříve vypočítej možnosti.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      $("#mkTcOutput").select();
      document.execCommand("copy");
    }
    message("Výsledek byl zkopírován.");
  });
})();