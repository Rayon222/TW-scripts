(() => {
  "use strict";

  const ID = "mk-simple-snipe";
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

  const box = document.createElement("div");
  box.id = ID;
  box.style.cssText = [
    "position:fixed",
    "z-index:999999",
    "top:25px",
    "left:50%",
    "transform:translateX(-50%)",
    "width:min(760px,96vw)",
    "max-height:92vh",
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
      <b style="font-size:18px">Jednoduché chytání vlaku</b>
      <button id="mkClose" type="button">✕</button>
    </div>

    <div style="padding:14px">
      <label>
        1. Vlož vlak z DK
        <textarea id="mkInput" rows="8" style="width:100%;box-sizing:border-box;margin-top:4px"
          placeholder="[command]attack_small[/command] [command]snob[/command] [coord]567|449[/coord] --> Čas příchodu: 17.07.26 21:53:07:956 [player]Rayon222[/player]"></textarea>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <label>
          2. Zrušit útok po
          <input id="mkAway" value="00:19:00.000" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>Maximálně 20 minut.</small>
        </label>

        <label>
          3. Návrat před dopadem
          <input id="mkBefore" value="00:00:00.100" style="width:100%;box-sizing:border-box;height:34px;margin-top:4px">
          <small>Výchozí: 100 ms před šlechtou.</small>
        </label>
      </div>

      <button id="mkCalc" type="button" style="margin-top:12px;font-weight:bold;font-size:16px;padding:8px 14px">
        Vypočítat
      </button>
      <button id="mkCopy" type="button" style="margin-top:12px;padding:8px 14px">
        Kopírovat
      </button>

      <div id="mkMsg" style="margin-top:10px;font-weight:bold"></div>
      <textarea id="mkOutput" rows="14" readonly style="width:100%;box-sizing:border-box;margin-top:8px;font-family:monospace"></textarea>

      <div style="margin-top:10px;padding:9px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
        Odešli deff <b>jako útok</b>. V uvedený čas ho ručně zruš. Vojsko se potom vrátí samo.
      </div>
    </div>
  `;

  document.body.appendChild(box);

  const $ = (s) => box.querySelector(s);
  const msg = (t) => $("#mkMsg").textContent = t;

  $("#mkClose").onclick = () => box.remove();

  $("#mkCalc").onclick = () => {
    const lines = $("#mkInput").value.split(/\n+/).map(v => v.trim()).filter(Boolean);
    if (!lines.length) return msg("Vlož řádky z DK.");

    const away = parseDuration($("#mkAway").value);
    const before = parseDuration($("#mkBefore").value);

    if (away === null || before === null) return msg("Špatný formát času.");
    if (away <= 0 || away > 20 * 60 * 1000) return msg("Doba do zrušení musí být větší než 0 a maximálně 20 minut.");

    const attacks = [];
    let invalid = 0;

    for (const line of lines) {
      const attack = parseDkLine(line);
      if (attack) attacks.push(attack);
      else invalid++;
    }

    if (!attacks.length) return msg("Nepodařilo se načíst žádný čas příchodu z DK.");
    if (invalid) return msg(`Některé řádky nelze načíst: ${invalid}.`);

    attacks.sort((a, b) => a.time - b.time);

    const output = [];
    attacks.forEach((attack, i) => {
      const wantedReturn = attack.time - before;
      const cancelAt = wantedReturn - away;
      const sendAt = cancelAt - away;

      output.push(`ÚTOK ${i + 1}${attack.coord ? ` – ${attack.coord}` : ""}`);
      output.push(`DOPAD:   ${formatTime(attack.time)}`);
      output.push(`ODESLAT: ${formatTime(sendAt)}`);
      output.push(`ZRUŠIT:  ${formatTime(cancelAt)}`);
      output.push(`NÁVRAT:  ${formatTime(wantedReturn)}`);
      output.push("");
    });

    $("#mkOutput").value = output.join("\n");
    msg(`Hotovo: ${attacks.length} útoků.`);
  };

  $("#mkCopy").onclick = async () => {
    const value = $("#mkOutput").value;
    if (!value) return msg("Nejdříve klikni na Vypočítat.");

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      $("#mkOutput").select();
      document.execCommand("copy");
    }
    msg("Výsledek zkopírován.");
  };
})();