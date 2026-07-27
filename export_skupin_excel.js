(async () => {
  try {
    if (document.getElementById("mk-group-exporter")) return;

    const parser = new DOMParser();
    const getText = async (url, options = {}) => {
      const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    };

    const clean = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim();

    const esc = (value) =>
      String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);

    const coordFromText = (text) => {
      const match = String(text || "").match(/(\d{1,3})\|(\d{1,3})/);
      return match ? `${Number(match[1])}|${Number(match[2])}` : null;
    };

    const validGroupName = (name) => {
      const value = clean(name);
      return (
        value &&
        !/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(value)
      );
    };

    const overlay = document.createElement("div");
    overlay.id = "mk-group-exporter";
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:99998"></div>
      <div style="position:fixed;top:4%;left:50%;transform:translateX(-50%);
        z-index:99999;width:min(760px,94vw);max-height:90vh;overflow:auto;
        background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;
        padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:20px">
          <b style="font-size:20px">Export skupin do Excelu</b>
          <button id="mkex-close" type="button">✕</button>
        </div>

        <div style="margin-top:12px;padding:12px;border:2px solid #9b6b22;
          background:#fff7df;border-radius:8px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button id="mkex-all" type="button">Označit vše</button>
            <button id="mkex-none" type="button">Zrušit označení</button>
            <button id="mkex-reload" type="button">Obnovit skupiny</button>
          </div>

          <label style="font-weight:bold">Vyber skupiny k exportu</label>
          <select id="mkex-groups" multiple size="14"
            style="width:100%;min-height:290px;margin-top:6px"></select>

          <div id="mkex-count" style="margin-top:8px;font-weight:bold"></div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <button id="mkex-export" type="button"
            style="font-weight:bold;font-size:16px;padding:9px 16px">
            Exportovat do Excelu
          </button>
        </div>

        <div id="mkex-msg" style="margin-top:10px;font-weight:bold"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $ = (selector) => overlay.querySelector(selector);
    const setMessage = (text, error = false) => {
      const el = $("#mkex-msg");
      el.textContent = text;
      el.style.color = error ? "#a00000" : "#2b1b09";
    };

    $("#mkex-close").onclick = () => overlay.remove();

    function addGroupsFromDocument(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((link) => {
        const href = link.getAttribute("href") || "";
        const id = href.match(/[?&]group=(\d+)/)?.[1];
        const name = clean(link.textContent);
        if (id && validGroupName(name)) groups.set(String(id), name);
      });

      doc.querySelectorAll(
        'select[name="group"] option,' +
        'select[name="group_id"] option,' +
        '#group_select option,' +
        'option[data-group-id],' +
        'option[data-id]'
      ).forEach((option) => {
        const raw = String(option.value || "");
        const id =
          raw.match(/[?&]group=(\d+)/)?.[1] ||
          raw.match(/^(\d+)$/)?.[1] ||
          option.dataset.groupId ||
          option.dataset.id;
        const name = clean(option.textContent);

        if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
          groups.set(String(id), name);
        }
      });

      doc.querySelectorAll("[data-group-id],[data-group]").forEach((element) => {
        const id = element.dataset.groupId || element.dataset.group;
        const name = clean(element.textContent);

        if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
          groups.set(String(id), name);
        }
      });
    }

    async function loadGroups() {
      setMessage("Načítám skupiny…");

      const groups = new Map();
      const urls = [
        "/game.php?screen=groups",
        "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
        "/game.php?screen=overview_villages&mode=combined",
      ];

      for (const url of urls) {
        try {
          const html = await getText(url);
          addGroupsFromDocument(
            parser.parseFromString(html, "text/html"),
            groups
          );
        } catch (_) {}
      }

      try {
        const text = await getText(
          "/game.php?screen=groups&ajax=load_group_menu",
          { headers: { "TribalWars-Ajax": "1" } }
        );

        try {
          const json = JSON.parse(text);

          const walk = (value) => {
            if (!value || typeof value !== "object") return;

            if (Array.isArray(value)) {
              value.forEach(walk);
              return;
            }

            const id = value.group_id ?? value.id ?? value.value;
            const name = clean(value.name ?? value.label ?? value.text);

            if (
              id !== undefined &&
              /^\d+$/.test(String(id)) &&
              validGroupName(name)
            ) {
              groups.set(String(id), name);
            }

            Object.values(value).forEach(walk);
          };

          walk(json);
        } catch (_) {
          addGroupsFromDocument(
            parser.parseFromString(text, "text/html"),
            groups
          );
        }
      } catch (_) {}

      const sorted = [...groups.entries()].sort((a, b) =>
        a[1].localeCompare(b[1], "cs", { sensitivity: "base" })
      );

      $("#mkex-groups").innerHTML = sorted
        .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)
        .join("");

      updateSelectionCount();

      if (sorted.length) {
        setMessage(`Načteno skupin: ${sorted.length}.`);
      } else {
        setMessage("Skupiny se nepodařilo načíst.", true);
      }
    }

    function updateSelectionCount() {
      const selected = $("#mkex-groups").selectedOptions.length;
      const total = $("#mkex-groups").options.length;
      $("#mkex-count").textContent = `Označeno skupin: ${selected} z ${total}`;
    }

    $("#mkex-groups").onchange = updateSelectionCount;

    $("#mkex-all").onclick = () => {
      [...$("#mkex-groups").options].forEach((option) => {
        option.selected = true;
      });
      updateSelectionCount();
    };

    $("#mkex-none").onclick = () => {
      [...$("#mkex-groups").options].forEach((option) => {
        option.selected = false;
      });
      updateSelectionCount();
    };

    $("#mkex-reload").onclick = loadGroups;

    function extractVillageFromRow(row) {
      const rowText = clean(row.textContent);
      const coord = coordFromText(rowText);
      if (!coord) return null;

      const links = [...row.querySelectorAll('a[href*="village="]')];

      const villageLink =
        links.find((link) => {
          const href = link.getAttribute("href") || "";
          const label = clean(link.textContent);
          return (
            /[?&]village=\d+/.test(href) &&
            label.includes(coord) &&
            !/[?&]screen=(main|place|smith|barracks|stable|garage|snob|market|storage|farm|wall)(?:&|$)/.test(href)
          );
        }) ||
        links.find((link) => {
          const href = link.getAttribute("href") || "";
          const label = clean(link.textContent);
          return /[?&]village=\d+/.test(href) && label.includes(coord);
        });

      if (!villageLink) return null;

      const href = villageLink.getAttribute("href") || "";
      const id = href.match(/[?&]village=(\d+)/)?.[1];
      if (!id) return null;

      let name = clean(villageLink.textContent)
        .replace(new RegExp(`\\(?\\s*${coord.replace("|", "\\|")}\\s*\\)?`, "g"), "")
        .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
        .trim();

      if (!name) {
        for (const cell of row.querySelectorAll("td")) {
          const text = clean(cell.textContent);
          if (!text.includes(coord)) continue;

          const candidate = text
            .replace(new RegExp(`\\(?\\s*${coord.replace("|", "\\|")}\\s*\\)?`, "g"), "")
            .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
            .trim();

          if (
            candidate &&
            !/^(Hlavní budova|Main building)$/i.test(candidate)
          ) {
            name = candidate;
            break;
          }
        }
      }

      const pointsText =
        row.querySelector(".points")?.textContent ||
        row.querySelector("td:nth-last-child(1)")?.textContent ||
        "";

      const pointsMatch = clean(pointsText).match(/[\d. ]+/);
      const points = pointsMatch
        ? Number(pointsMatch[0].replace(/[.\s]/g, ""))
        : "";

      const [x, y] = coord.split("|").map(Number);
      const continent = `K${Math.floor(y / 100)}${Math.floor(x / 100)}`;

      return {
        id,
        name,
        coord,
        continent,
        points,
      };
    }

    async function loadVillagesForGroup(groupId, groupName) {
      const url =
        `/game.php?screen=overview_villages&mode=combined&group=` +
        `${encodeURIComponent(groupId)}&page=-1`;

      const html = await getText(url);
      const doc = parser.parseFromString(html, "text/html");
      const villages = new Map();

      doc.querySelectorAll("tr").forEach((row) => {
        const village = extractVillageFromRow(row);
        if (village && !villages.has(village.id)) {
          villages.set(village.id, {
            groupId,
            groupName,
            ...village,
          });
        }
      });

      return [...villages.values()];
    }

    async function ensureXLSX() {
      if (window.XLSX) return;

      setMessage("Načítám Excel knihovnu…");

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.onload = resolve;
        script.onerror = () =>
          reject(new Error("Nepodařilo se načíst Excel knihovnu."));
        document.head.appendChild(script);
      });
    }

    function safeSheetName(name, usedNames) {
      let base = clean(name).replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Skupina";
      let candidate = base;
      let index = 2;

      while (usedNames.has(candidate)) {
        const suffix = `_${index++}`;
        candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      }

      usedNames.add(candidate);
      return candidate;
    }

    $("#mkex-export").onclick = async () => {
      const selectedGroups = [...$("#mkex-groups").selectedOptions].map(
        (option) => ({
          id: String(option.value),
          name: clean(option.textContent),
        })
      );

      if (!selectedGroups.length) {
        setMessage("Označ alespoň jednu skupinu.", true);
        return;
      }

      try {
        $("#mkex-export").disabled = true;
        await ensureXLSX();

        const allRows = [];
        const byGroup = [];

        for (let index = 0; index < selectedGroups.length; index++) {
          const group = selectedGroups[index];

          setMessage(
            `Načítám skupinu ${index + 1}/${selectedGroups.length}: ${group.name}…`
          );

          const villages = await loadVillagesForGroup(group.id, group.name);
          byGroup.push({ group, villages });

          villages.forEach((village) => {
            allRows.push({
              Skupina: village.groupName,
              "ID skupiny": village.groupId,
              "ID vesnice": village.id,
              "Název vesnice": village.name,
              Souřadnice: village.coord,
              Kontinent: village.continent,
              Body: village.points,
            });
          });
        }

        if (!allRows.length) {
          setMessage("Ve vybraných skupinách nebyly nalezeny vesnice.", true);
          return;
        }

        const workbook = XLSX.utils.book_new();
        const usedNames = new Set();

        const allSheet = XLSX.utils.json_to_sheet(allRows);
        allSheet["!cols"] = [
          { wch: 22 },
          { wch: 12 },
          { wch: 12 },
          { wch: 28 },
          { wch: 12 },
          { wch: 10 },
          { wch: 10 },
        ];
        XLSX.utils.book_append_sheet(
          workbook,
          allSheet,
          safeSheetName("Všechny vesnice", usedNames)
        );

        for (const { group, villages } of byGroup) {
          const rows = villages.map((village) => ({
            "ID vesnice": village.id,
            "Název vesnice": village.name,
            Souřadnice: village.coord,
            Kontinent: village.continent,
            Body: village.points,
          }));

          const sheet = XLSX.utils.json_to_sheet(rows);
          sheet["!cols"] = [
            { wch: 12 },
            { wch: 28 },
            { wch: 12 },
            { wch: 10 },
            { wch: 10 },
          ];

          XLSX.utils.book_append_sheet(
            workbook,
            sheet,
            safeSheetName(group.name, usedNames)
          );
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const fileName =
          `export_skupin_${now.getFullYear()}-${pad(now.getMonth() + 1)}-` +
          `${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.xlsx`;

        XLSX.writeFile(workbook, fileName);

        setMessage(
          `Hotovo: exportováno ${allRows.length} řádků z ${selectedGroups.length} skupin.`
        );
      } catch (error) {
        setMessage(`Chyba exportu: ${error.message}`, true);
      } finally {
        $("#mkex-export").disabled = false;
      }
    };

    await loadGroups();
  } catch (error) {
    alert(`Chyba exportéru: ${error.message}`);
  }
})();