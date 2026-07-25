(async () => {
  const BOX_ID = "mk-off-counter";
  if (document.getElementById(BOX_ID)) return;

  const WANTED = ["OFF R", "OFF P", "OFF M"];
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

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char]);

  const box = document.createElement("div");
  box.id = BOX_ID;
  box.style.cssText =
    "position:fixed;top:80px;left:50%;transform:translateX(-50%);" +
    "z-index:99999;min-width:320px;background:#f4e4bc;border:3px solid #7d510f;" +
    "border-radius:8px;padding:14px;font:14px Arial;color:#2b1b09;" +
    "box-shadow:0 8px 30px #0008";

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:20px">
      <b style="font-size:18px">Počet vesnic v OFF skupinách</b>
      <button id="mk-off-close" type="button">✕</button>
    </div>
    <div id="mk-off-result" style="margin-top:12px;line-height:1.9">
      Načítám skupiny…
    </div>
  `;

  document.body.appendChild(box);
  box.querySelector("#mk-off-close").onclick = () => box.remove();

  const result = box.querySelector("#mk-off-result");

  const addGroupsFromDocument = (doc, groups) => {
    doc.querySelectorAll('a[href*="group="]').forEach((link) => {
      const href = link.getAttribute("href") || "";
      const id = href.match(/[?&]group=(\d+)/)?.[1];
      const name = clean(link.textContent);
      if (id && name) groups.set(name, id);
    });

    doc.querySelectorAll(
      'select[name="group"] option, select[name="group_id"] option, ' +
      '#group_select option, option[data-group-id], option[data-id]'
    ).forEach((option) => {
      const raw = String(option.value || "");
      const id =
        raw.match(/[?&]group=(\d+)/)?.[1] ||
        raw.match(/^(\d+)$/)?.[1] ||
        option.dataset.groupId ||
        option.dataset.id;
      const name = clean(option.textContent);

      if (id && /^\d+$/.test(String(id)) && name) {
        groups.set(name, String(id));
      }
    });

    doc.querySelectorAll("[data-group-id], [data-group]").forEach((element) => {
      const id = element.dataset.groupId || element.dataset.group;
      const name = clean(element.textContent);
      if (id && /^\d+$/.test(String(id)) && name) {
        groups.set(name, String(id));
      }
    });
  };

  const loadGroups = async () => {
    const groups = new Map();
    const urls = [
      "/game.php?screen=groups",
      "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
      "/game.php?screen=overview_villages&mode=combined",
    ];

    for (const url of urls) {
      try {
        const html = await getText(url);
        addGroupsFromDocument(parser.parseFromString(html, "text/html"), groups);
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

          if (id !== undefined && /^\d+$/.test(String(id)) && name) {
            groups.set(name, String(id));
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

    return groups;
  };

  const countVillages = async (groupId) => {
    const url =
      `/game.php?screen=overview_villages&mode=combined&group=` +
      `${encodeURIComponent(groupId)}&page=-1`;

    const html = await getText(url);
    const doc = parser.parseFromString(html, "text/html");
    const villageIds = new Set();

    // Počítáme pouze skutečné řádky vesnic stejně jako plánovač.
    doc.querySelectorAll("tr").forEach((row) => {
      const text = clean(row.textContent);
      const hasCoord = /(\d{1,3})\|(\d{1,3})/.test(text);
      if (!hasCoord) return;

      const link = [...row.querySelectorAll('a[href*="village="]')].find((a) =>
        /[?&]village=\d+/.test(a.getAttribute("href") || "")
      );

      const id = (link?.getAttribute("href") || "").match(
        /[?&]village=(\d+)/
      )?.[1];

      if (id) villageIds.add(id);
    });

    return villageIds.size;
  };

  try {
    const groups = await loadGroups();
    const rows = [];

    for (const name of WANTED) {
      const exactEntry = [...groups.entries()].find(
        ([groupName]) => clean(groupName) === name
      );

      if (!exactEntry) {
        rows.push({ name, value: "skupina nenalezena", error: true });
        continue;
      }

      const [, groupId] = exactEntry;

      try {
        const count = await countVillages(groupId);
        rows.push({ name, value: count, error: false });
      } catch (error) {
        rows.push({ name, value: "chyba načítání", error: true });
      }
    }

    result.innerHTML = rows
      .map(
        (row) =>
          `<div style="display:flex;justify-content:space-between;gap:30px;` +
          `font-size:17px;font-weight:bold;` +
          `${row.error ? "color:#a00000" : ""}">` +
          `<span>${escapeHtml(row.name)}</span>` +
          `<span>${escapeHtml(row.value)}</span>` +
          `</div>`
      )
      .join("");
  } catch (error) {
    result.innerHTML =
      `<b style="color:#a00000">Chyba: ${escapeHtml(error.message)}</b>`;
  }
})();