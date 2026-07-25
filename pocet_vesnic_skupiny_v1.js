(async () => {
  try {
    if (document.getElementById("mk-group-counter")) return;

    const parser = new DOMParser();
    const get = async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    };
    const esc = (value) =>
      String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char]);

    const overlay = document.createElement("div");
    overlay.id = "mk-group-counter";
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:99998"></div>
      <div style="position:fixed;top:4%;left:50%;transform:translateX(-50%);
        z-index:99999;width:min(760px,94vw);max-height:90vh;overflow:auto;
        background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;
        padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <b style="font-size:20px">Počet vesnic ve skupinách</b>
          <button id="mk-counter-close">✕</button>
        </div>

        <div style="margin-top:12px">
          <button id="mk-counter-refresh" style="font-weight:bold">Načíst znovu</button>
          <button id="mk-counter-copy">Kopírovat výsledky</button>
        </div>

        <div id="mk-counter-status" style="margin:12px 0;font-weight:bold">
          Načítám skupiny…
        </div>

        <table style="width:100%;border-collapse:collapse;background:#fff7df">
          <thead>
            <tr>
              <th style="text-align:left;border:1px solid #9b6b22;padding:7px">Skupina</th>
              <th style="text-align:right;border:1px solid #9b6b22;padding:7px;width:140px">Počet vesnic</th>
            </tr>
          </thead>
          <tbody id="mk-counter-body"></tbody>
        </table>
      </div>`;

    document.body.appendChild(overlay);

    const $ = (selector) => overlay.querySelector(selector);
    const status = (text) => ($("#mk-counter-status").textContent = text);

    const validGroupName = (name) => {
      const clean = String(name || "").replace(/\s+/g, " ").trim();
      return clean &&
        !/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(clean);
    };

    const addGroupsFromDocument = (doc, groups) => {
      doc.querySelectorAll('a[href*="group="]').forEach((anchor) => {
        const href = anchor.getAttribute("href") || "";
        const id = href.match(/[?&]group=(\d+)/)?.[1];
        const name = anchor.textContent.replace(/\s+/g, " ").trim();
        if (id && validGroupName(name)) groups.set(String(id), name);
      });

      doc.querySelectorAll(
        'select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]'
      ).forEach((option) => {
        const raw = String(option.value || "");
        const id =
          raw.match(/[?&]group=(\d+)/)?.[1] ||
          raw.match(/^(\d+)$/)?.[1] ||
          option.dataset.groupId ||
          option.dataset.id;
        const name = option.textContent.replace(/\s+/g, " ").trim();
        if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
          groups.set(String(id), name);
        }
      });

      doc.querySelectorAll("[data-group-id],[data-group]").forEach((element) => {
        const id = element.dataset.groupId || element.dataset.group;
        const name = element.textContent.replace(/\s+/g, " ").trim();
        if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
          groups.set(String(id), name);
        }
      });
    };

    const loadGroups = async () => {
      const groups = new Map([["0", "Všechny vesnice"]]);
      const urls = [
        "/game.php?screen=groups",
        "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
        "/game.php?screen=overview_villages&mode=combined",
      ];

      for (const url of urls) {
        try {
          const html = await get(url);
          addGroupsFromDocument(parser.parseFromString(html, "text/html"), groups);
        } catch (e) {}
      }

      try {
        const response = await fetch("/game.php?screen=groups&ajax=load_group_menu", {
          credentials: "same-origin",
          headers: { "TribalWars-Ajax": "1" },
        });
        const text = await response.text();

        try {
          const json = JSON.parse(text);
          const walk = (value) => {
            if (!value || typeof value !== "object") return;
            if (Array.isArray(value)) {
              value.forEach(walk);
              return;
            }
            const id = value.group_id ?? value.id ?? value.value;
            const name = value.name ?? value.label ?? value.text;
            if (
              id !== undefined &&
              /^\d+$/.test(String(id)) &&
              validGroupName(name)
            ) {
              groups.set(String(id), String(name).trim());
            }
            Object.values(value).forEach(walk);
          };
          walk(json);
        } catch (e) {
          addGroupsFromDocument(parser.parseFromString(text, "text/html"), groups);
        }
      } catch (e) {}

      return [...groups]
        .filter(([id, name]) => id === "0" || validGroupName(name))
        .sort((a, b) =>
          a[0] === "0"
            ? -1
            : b[0] === "0"
              ? 1
              : a[1].localeCompare(b[1], "cs", { sensitivity: "base" })
        );
    };

    const countVillages = async (groupId) => {
      const html = await get(
        `/game.php?screen=overview_villages&mode=combined&group=${encodeURIComponent(groupId)}&page=-1`
      );
      const doc = parser.parseFromString(html, "text/html");
      const ids = new Set();

      doc.querySelectorAll('a[href*="village="]').forEach((anchor) => {
        const id = (anchor.getAttribute("href") || "").match(/[?&]village=(\d+)/)?.[1];
        if (id) ids.add(id);
      });

      return ids.size;
    };

    let results = [];

    const render = () => {
      $("#mk-counter-body").innerHTML = results.map((row) => `
        <tr>
          <td style="border:1px solid #9b6b22;padding:7px">${esc(row.name)}</td>
          <td style="border:1px solid #9b6b22;padding:7px;text-align:right;font-weight:bold">${row.count}</td>
        </tr>
      `).join("");
    };

    const run = async () => {
      try {
        results = [];
        $("#mk-counter-body").innerHTML = "";
        status("Načítám seznam skupin…");

        const groups = await loadGroups();
        if (!groups.length) throw new Error("Nebyly nalezeny žádné skupiny.");

        for (let index = 0; index < groups.length; index++) {
          const [id, name] = groups[index];
          status(`Načítám ${index + 1}/${groups.length}: ${name}`);
          let count = 0;
          try {
            count = await countVillages(id);
          } catch (e) {
            count = "CHYBA";
          }
          results.push({ id, name, count });
          render();
        }

        const successful = results.filter((row) => typeof row.count === "number");
        status(`Hotovo. Načteno ${successful.length} z ${groups.length} skupin.`);
      } catch (error) {
        status(`Chyba: ${error.message}`);
      }
    };

    $("#mk-counter-close").onclick = () => overlay.remove();
    $("#mk-counter-refresh").onclick = run;
    $("#mk-counter-copy").onclick = async () => {
      if (!results.length) return status("Nejdříve načti výsledky.");
      const text = results
        .map((row) => `${row.name}: ${row.count}`)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      status("Výsledky byly zkopírovány.");
    };

    await run();
  } catch (error) {
    alert("Chyba počítadla skupin: " + error.message);
  }
})();