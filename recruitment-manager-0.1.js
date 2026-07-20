(() => {
  "use strict";

  const VERSION = "0.1";
  const PANEL_ID = "mk-recruit-manager-panel";

  if (document.getElementById(PANEL_ID)) {
    document.getElementById(PANEL_ID).remove();
    return;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

  const likelyRecruitPage =
    /screen=am_/.test(location.search) &&
    /(recruit|verbov|nábor|rekrut)/i.test(
      `${location.search} ${document.title} ${document.body.innerText.slice(0, 5000)}`
    );

  if (!likelyRecruitPage) {
    const base =
      window.game_data?.link_base_pure ||
      `${location.origin}${location.pathname}?village=${window.game_data?.village?.id || ""}&`;

    if (
      confirm(
        "Tento nástroj musí běžet na stránce Správce účtu → Verbování.\n\n" +
        "Chceš otevřít pravděpodobnou stránku verbování?"
      )
    ) {
      location.href = `${base}screen=am_overview&mode=recruit`;
    }
    return;
  }

  const isVisible = (el) => {
    if (!el) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && el.offsetParent !== null;
  };

  const clickableLabel = (el) =>
    norm(
      el.getAttribute("title") ||
      el.getAttribute("value") ||
      el.getAttribute("aria-label") ||
      el.textContent
    );

  const ENABLE_WORDS = [
    "zapnout",
    "aktivovat",
    "spustit",
    "enable",
    "activate",
    "start",
    "použít",
    "pouzit",
  ];

  const DISABLE_WORDS = [
    "vypnout",
    "deaktivovat",
    "zastavit",
    "disable",
    "deactivate",
    "stop",
  ];

  const looksEnable = (el) => {
    if (!isVisible(el) || el.disabled) return false;
    const label = clickableLabel(el);
    if (!label) return false;
    if (DISABLE_WORDS.some((w) => label.includes(w))) return false;
    return ENABLE_WORDS.some((w) => label.includes(w));
  };

  const looksDisabledStatus = (row) => {
    const t = norm(row.innerText);
    return (
      t.includes("vypnuto") ||
      t.includes("neaktivní") ||
      t.includes("neaktivni") ||
      t.includes("disabled") ||
      t.includes("inactive") ||
      t.includes("stopped")
    );
  };

  const villageFromRow = (row) => {
    const villageLink = $$('a[href*="village="]', row).find((a) =>
      /\d{3}\|\d{3}/.test(a.textContent)
    );
    const coordMatch = row.innerText.match(/\b\d{3}\|\d{3}\b/);
    const coord = coordMatch ? coordMatch[0] : "";
    const name =
      villageLink?.textContent?.trim() ||
      $$("td", row)[0]?.textContent?.trim() ||
      coord ||
      "Neznámá vesnice";
    return { name, coord };
  };

  const controlsInRow = (row) =>
    $$('button, input[type="button"], input[type="submit"], a.btn, a.button, a', row);

  const rows = $$("tr").map((row, index) => {
    const buttons = controlsInRow(row);
    const enableControl = buttons.find(looksEnable);
    const village = villageFromRow(row);

    if (!village.coord && !enableControl) return null;

    return {
      id: `r${index}`,
      row,
      enableControl,
      village,
      disabledHint: looksDisabledStatus(row),
    };
  }).filter(Boolean);

  const candidates = rows.filter((x) => x.enableControl || x.disabledHint);

  const style = document.createElement("style");
  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      z-index: 999999;
      top: 70px;
      right: 20px;
      width: min(460px, calc(100vw - 30px));
      max-height: calc(100vh - 100px);
      overflow: auto;
      background: #f4e4bc;
      border: 2px solid #6b4a1d;
      border-radius: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.35);
      color: #222;
      font: 13px/1.35 Arial, sans-serif;
    }
    #${PANEL_ID} .mk-head {
      position: sticky;
      top: 0;
      background: #d6b675;
      padding: 10px;
      border-bottom: 1px solid #6b4a1d;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
    }
    #${PANEL_ID} .mk-body { padding: 10px; }
    #${PANEL_ID} .mk-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin: 8px 0;
    }
    #${PANEL_ID} button {
      cursor: pointer;
      padding: 6px 9px;
    }
    #${PANEL_ID} .mk-list {
      border: 1px solid #9b6b22;
      background: #fff7df;
      max-height: 330px;
      overflow: auto;
    }
    #${PANEL_ID} .mk-row {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      gap: 7px;
      align-items: center;
      padding: 6px;
      border-bottom: 1px solid #d8c59b;
    }
    #${PANEL_ID} .mk-row:last-child { border-bottom: 0; }
    #${PANEL_ID} .mk-muted { color: #6d6048; font-size: 12px; }
    #${PANEL_ID} .mk-ok { color: #146b27; font-weight: bold; }
    #${PANEL_ID} .mk-warn { color: #9b1c1c; font-weight: bold; }
    #${PANEL_ID} .mk-status {
      margin-top: 8px;
      padding: 7px;
      background: #fff7df;
      border: 1px solid #9b6b22;
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  const listHtml = candidates.length
    ? candidates
        .map((item) => {
          const controlFound = !!item.enableControl;
          const status = controlFound ? "lze zapnout" : "nenalezeno tlačítko";
          return `
            <label class="mk-row">
              <input type="checkbox" class="mk-select" data-id="${item.id}" ${
                controlFound ? "checked" : "disabled"
              }>
              <span>
                <b>${item.village.name.replace(/</g, "&lt;")}</b>
                <span class="mk-muted">${item.village.coord || ""}</span>
              </span>
              <span class="${controlFound ? "mk-ok" : "mk-warn"}">${status}</span>
            </label>
          `;
        })
        .join("")
    : `<div style="padding:10px" class="mk-warn">
         Skript na této stránce nenašel žádné vypnuté verbování ani tlačítka Zapnout.
       </div>`;

  panel.innerHTML = `
    <div class="mk-head">
      <b>Rychlé zapnutí verbování ${VERSION}</b>
      <button type="button" id="mk-close">×</button>
    </div>
    <div class="mk-body">
      <div>
        Nalezeno kandidátů: <b>${candidates.length}</b>,
        s dostupným tlačítkem Zapnout: <b>${candidates.filter((x) => x.enableControl).length}</b>.
      </div>
      <div class="mk-actions">
        <button type="button" id="mk-all">Vybrat vše</button>
        <button type="button" id="mk-none">Zrušit výběr</button>
        <button type="button" id="mk-enable"><b>Zapnout vybrané</b></button>
      </div>
      <div class="mk-list">${listHtml}</div>
      <div id="mk-status" class="mk-status">
        Skript pouze použije existující tlačítka na otevřené stránce.
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const status = $("#mk-status", panel);
  const setStatus = (text, cls = "") => {
    status.textContent = text;
    status.className = `mk-status ${cls}`;
  };

  $("#mk-close", panel).onclick = () => {
    panel.remove();
    style.remove();
  };

  $("#mk-all", panel).onclick = () => {
    $$(".mk-select:not(:disabled)", panel).forEach((x) => (x.checked = true));
  };

  $("#mk-none", panel).onclick = () => {
    $$(".mk-select", panel).forEach((x) => (x.checked = false));
  };

  $("#mk-enable", panel).onclick = async () => {
    const selectedIds = $$(".mk-select:checked", panel).map((x) => x.dataset.id);
    const selected = candidates.filter(
      (x) => selectedIds.includes(x.id) && x.enableControl
    );

    if (!selected.length) {
      setStatus("Není vybrána žádná vesnice s dostupným tlačítkem Zapnout.", "mk-warn");
      return;
    }

    if (
      !confirm(
        `Zapnout přednastavené verbování u ${selected.length} vybraných vesnic?\n\n` +
        "Skript klikne pouze na tlačítka Zapnout, která jsou už na otevřené stránce."
      )
    ) {
      return;
    }

    let done = 0;
    for (const item of selected) {
      try {
        item.row.scrollIntoView({ block: "center" });
        item.enableControl.click();
        done++;
        setStatus(`Zpracováno ${done}/${selected.length}: ${item.village.name}`);
        await new Promise((resolve) => setTimeout(resolve, 450));
      } catch (err) {
        console.error("Recruit manager:", err);
      }
    }

    setStatus(
      `Hotovo. Kliknuto na Zapnout u ${done} z ${selected.length} vesnic. Zkontroluj stav na stránce.`,
      done === selected.length ? "mk-ok" : "mk-warn"
    );
  };

  const head = $(".mk-head", panel);
  let drag = null;
  head.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    panel.style.right = "auto";
  });
  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    panel.style.left = `${Math.max(0, e.clientX - drag.dx)}px`;
    panel.style.top = `${Math.max(0, e.clientY - drag.dy)}px`;
  });
  document.addEventListener("mouseup", () => {
    drag = null;
  });
})();