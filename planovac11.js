(async () => {
  try {
    if (document.getElementById("mk111planner")) return;
    const P = new DOMParser(),
      get = async (u) =>
        await fetch(u, { credentials: "same-origin" }).then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        }),
      xml = async (u) => P.parseFromString(await get(u), "text/xml"),
      cfg = await xml("/interface.php?func=get_config"),
      ui = await xml("/interface.php?func=get_unit_info"),
      us = parseFloat(cfg.querySelector("unit_speed")?.textContent || 1),
      N = {
        spear: "Kopí",
        sword: "Meč",
        axe: "Sekera",
        archer: "Luk",
        spy: "Špeh",
        light: "Lehká jízda",
        marcher: "Jízdní luk",
        heavy: "Těžká jízda",
        ram: "Beranidlo",
        catapult: "Katapult",
        knight: "Paladin",
        snob: "Šlechtic",
      },
      U = [...ui.documentElement.children]
        .map((n) => ({
          id: n.tagName,
          sp: parseFloat(n.querySelector("speed")?.textContent || 0) / us,
        }))
        .filter((u) => u.sp > 0),
      base = location.origin + location.pathname,
      ov = document.createElement("div");
    ov.id = "mk111planner";
    ov.innerHTML = `<div style="position:fixed;inset:0;background:#0009;z-index:99998"></div><div style="position:fixed;top:3%;left:50%;transform:translateX(-50%);z-index:99999;width:min(1000px,95vw);max-height:93vh;overflow:auto;background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:20px">Plánovač útoků – CZ111 (ruční nebo omezený výběr)</b><button id="mkclose">✕</button></div><div style="margin-top:12px;padding:14px;border:2px solid #9b6b22;background:#fff7df;border-radius:8px">
  <div style="font-size:18px;font-weight:bold;margin-bottom:8px">Datum a čas dopadu – serverový čas</div>
  <div style="display:grid;grid-template-columns:minmax(210px,1fr) minmax(260px,1.4fr);gap:12px">
    <label style="font-weight:bold">Datum dopadu<br>
      <input id="mklanddate" type="date" style="width:100%;box-sizing:border-box;height:50px;font-size:20px;font-weight:bold;padding:6px">
    </label>
    <label style="font-weight:bold">Čas dopadu včetně milisekund<br>
      <input id="mklandtime" type="text" placeholder="20:00:00.000" style="width:100%;box-sizing:border-box;height:50px;font-size:20px;font-weight:bold;padding:6px">
    </label>
  </div>
  <small style="display:block;margin-top:7px">Příklad: datum 2026-07-17 a čas 20:00:00.000</small>
</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px"><label>Skupina výchozích vesnic<br><select id="mkgroup" style="width:100%;height:32px"><option value="">Načítám skupiny…</option></select><br><small>Po změně skupiny se vesnice načtou automaticky.</small></label><label>Vesnice ve vybrané skupině<br><select id="mkvillages" multiple size="8" style="width:100%"></select><br><small>Bez označení se použijí všechny vesnice skupiny.</small></label><label>Cílové vesnice<br><textarea id="mktarget" rows="8" placeholder="500|500&#10;501|501&#10;502|502" style="width:100%;box-sizing:border-box"></textarea><br><small>Cíle mohou být oddělené řádkem, mezerou, čárkou nebo středníkem.</small><div id="mktargetstatus" style="margin-top:5px;font-weight:bold"></div></label><label>Nejpomalejší jednotka<br><select id="mkunit" style="width:100%;height:32px">${U.map((u) => `<option value="${u.id}" ${u.id === "snob" ? "selected" : ""}>${N[u.id] || u.id} (${u.sp} min/pole)</option>`).join("")}</select></label><label>Maximální počet útoků na jeden cíl<br><input id="mkmaxpertarget" type="number" min="1" max="20" step="1" value="5" style="width:100%;box-sizing:border-box;height:32px"><br><label style="display:block;margin-top:7px"><input type="checkbox" id="mkignoremax"> Ignorovat limit a použít mnou označené vesnice</label><label style="display:block;margin-top:7px"><input type="checkbox" id="mkautoreduce" checked> Při nedostatku vesnic automaticky snížit počet útoků na cíl</label><small id="mkmaxhelp">Každá výchozí vesnice bude v plánu použita maximálně jednou.</small></label><label>Název plánu<br><input id="mktitle" value="Útok" style="width:100%;box-sizing:border-box;height:32px"></label></div><div style="margin:14px 0"><div style="margin-bottom:10px;padding:9px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px"><label><input type="checkbox" id="mkblocknight"> Neplánovat útoky, které se musí odeslat v tomto čase:</label> <input type="time" id="mkblockfrom" value="23:00" style="height:30px"> až <input type="time" id="mkblockto" value="06:00" style="height:30px"><br><small>Funguje i přes půlnoc, například 23:00 až 06:00.</small></div><button id="mkcalc" style="font-weight:bold">Vypočítat plán</button> <button id="mkcalccopy" style="font-weight:bold">Vypočítat a kopírovat</button> <button id="mkcopy">Kopírovat BBCode</button></div><textarea id="mkout" rows="17" readonly style="width:100%;box-sizing:border-box;font-family:monospace"></textarea><div id="mkmsg" style="margin-top:8px;font-weight:bold"></div></div>`;
    document.body.appendChild(ov);
    const $ = (s) => ov.querySelector(s),
      msg = (t) => ($("#mkmsg").textContent = t),
      esc = (s) =>
        String(s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            })[c],
        ),
      C = (s) => {
        let m = String(s).match(/(\d{1,3})\|(\d{1,3})/);
        return m ? [+m[1], +m[2]] : null;
      },
      CS = (s) => {
        let out = [],
          seen = new Set();
        for (let m of String(s).matchAll(/(\d{1,3})\|(\d{1,3})/g)) {
          let x = +m[1],
            y = +m[2],
            k = `${x}|${y}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push([x, y]);
          }
        }
        return out;
      },
      T = (s) => {
        let m = String(s)
          .trim()
          .match(
            /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
          );
        return m
          ? Date.UTC(
              +m[1],
              +m[2] - 1,
              +m[3],
              +m[4],
              +m[5],
              +m[6],
              +(m[7] || "0").padEnd(3, "0"),
            )
          : NaN;
      },
      F = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      },
      FD = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
      },
      FT = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      },
      D = (ms) => {
        let s = Math.round(ms / 1000),
          h = Math.floor(s / 3600);
        s %= 3600;
        let m = Math.floor(s / 60);
        s %= 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      },
      HM = (s) => {
        let m = String(s || "").match(/^(\d{2}):(\d{2})$/);
        return m ? +m[1] * 60 + +m[2] : null;
      },
      blockedTime = (ms, from, to) => {
        let d = new Date(ms),
          v = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (from === null || to === null || from === to) return false;
        return from < to ? v >= from && v < to : v >= from || v < to;
      },
      serverNow = () => {
        let d = (
            document.querySelector("#serverDate")?.textContent || ""
          ).trim(),
          t = (document.querySelector("#serverTime")?.textContent || "").trim(),
          a = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/),
          b = t.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        return a && b
          ? `${a[3]}-${a[2].padStart(2, "0")}-${a[1].padStart(2, "0")} ${b[1].padStart(2, "0")}:${b[2]}:${b[3]}.000`
          : "";
      };
    const initialServerTime = serverNow();
    if (initialServerTime) {
      const [initialDate, initialTime] = initialServerTime.split(" ");
      $("#mklanddate").value = initialDate;
      $("#mklandtime").value = initialTime;
    }

    const landingValue = () =>
      `${$("#mklanddate").value.trim()} ${$("#mklandtime").value.trim()}`;

    const SETTINGS_KEY = "mk111planner_settings_v8";
    const loadSettings = () => {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch (e) {
        return {};
      }
    };
    const saveSettings = () => {
      const data = {
        unit: $("#mkunit").value,
        title: $("#mktitle").value,
        targets: $("#mktarget").value,
        blockNight: $("#mkblocknight").checked,
        blockFrom: $("#mkblockfrom").value,
        blockTo: $("#mkblockto").value,
        maxPerTarget: Number($("#mkmaxpertarget").value),
        ignoreMax: $("#mkignoremax").checked,
        autoReduce: $("#mkautoreduce").checked,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    };
    const savedSettings = loadSettings();
    if (savedSettings.unit && U.some((u) => u.id === savedSettings.unit))
      $("#mkunit").value = savedSettings.unit;
    if (typeof savedSettings.title === "string")
      $("#mktitle").value = savedSettings.title;
    if (typeof savedSettings.targets === "string")
      $("#mktarget").value = savedSettings.targets;
    if (typeof savedSettings.blockNight === "boolean")
      $("#mkblocknight").checked = savedSettings.blockNight;
    if (savedSettings.blockFrom) $("#mkblockfrom").value = savedSettings.blockFrom;
    if (savedSettings.blockTo) $("#mkblockto").value = savedSettings.blockTo;
    if (
      Number.isInteger(savedSettings.maxPerTarget) &&
      savedSettings.maxPerTarget >= 1 &&
      savedSettings.maxPerTarget <= 20
    )
      $("#mkmaxpertarget").value = savedSettings.maxPerTarget;
    if (typeof savedSettings.ignoreMax === "boolean")
      $("#mkignoremax").checked = savedSettings.ignoreMax;
    if (typeof savedSettings.autoReduce === "boolean")
      $("#mkautoreduce").checked = savedSettings.autoReduce;

    const updateMaxMode = () => {
      const ignore = $("#mkignoremax").checked;
      $("#mkmaxpertarget").disabled = ignore;
      $("#mkmaxhelp").textContent = ignore
        ? "Ruční režim: všechny označené vesnice se rozdělí mezi cíle, ale každá bude použita maximálně jednou."
        : "Automatický režim: pro každý cíl se použije nejvýše zadaný počet nejbližších dosud nepoužitých vesnic.";
      $("#mkmaxhelp").style.fontWeight = ignore ? "bold" : "normal";
    };
    updateMaxMode();

    const analyseTargets = (text) => {
      const pieces = String(text || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const valid = [];
      const invalid = [];
      const duplicates = [];
      const seen = new Set();

      for (const piece of pieces) {
        const match = piece.match(/^(\d{1,3})\|(\d{1,3})$/);
        if (!match) {
          invalid.push(piece);
          continue;
        }
        const x = Number(match[1]);
        const y = Number(match[2]);
        if (x > 999 || y > 999) {
          invalid.push(piece);
          continue;
        }
        const coord = `${x}|${y}`;
        if (seen.has(coord)) {
          duplicates.push(coord);
          continue;
        }
        seen.add(coord);
        valid.push([x, y]);
      }
      return { valid, invalid, duplicates };
    };

    const updateTargetStatus = () => {
      const result = analyseTargets($("#mktarget").value);
      const status = $("#mktargetstatus");
      if (!$("#mktarget").value.trim()) {
        status.textContent = "Zatím není zadán žádný cíl.";
        status.style.color = "#6b4a20";
      } else if (result.invalid.length) {
        status.textContent = `Chybné cíle: ${result.invalid.join(", ")}`;
        status.style.color = "#b00020";
      } else {
        status.textContent =
          `${result.valid.length} platných cílů` +
          (result.duplicates.length
            ? `, ${result.duplicates.length} duplicit vynecháno`
            : "");
        status.style.color = "#176b22";
      }
      return result;
    };

    let villages = [];
    function validGroupName(name) {
      name = String(name || "")
        .replace(/\s+/g, " ")
        .trim();
      return (
        name &&
        !/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(
          name,
        )
      );
    }
    function addGroupsFromDoc(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((a) => {
        let href = a.getAttribute("href") || "",
          id = href.match(/[?&]group=(\d+)/)?.[1],
          name = a.textContent.replace(/\s+/g, " ").trim();
        if (id && validGroupName(name)) groups.set(String(id), name);
      });
      doc
        .querySelectorAll(
          'select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]',
        )
        .forEach((o) => {
          let raw = String(o.value || ""),
            id =
              raw.match(/[?&]group=(\d+)/)?.[1] ||
              raw.match(/^(\d+)$/)?.[1] ||
              o.dataset.groupId ||
              o.dataset.id,
            name = o.textContent.replace(/\s+/g, " ").trim();
          if (id && /^\d+$/.test(String(id)) && validGroupName(name))
            groups.set(String(id), name);
        });
      doc.querySelectorAll("[data-group-id],[data-group]").forEach((el) => {
        let id = el.dataset.groupId || el.dataset.group,
          name = el.textContent.replace(/\s+/g, " ").trim();
        if (id && /^\d+$/.test(String(id)) && validGroupName(name))
          groups.set(String(id), name);
      });
    }
    async function loadGroups() {
      try {
        msg("Načítám skupiny…");
        let groups = new Map([["0", "Všechny vesnice"]]),
          urls = [
            "/game.php?screen=groups",
            "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
            "/game.php?screen=overview_villages&mode=combined",
          ];
        for (let url of urls) {
          try {
            let html = await get(url),
              doc = P.parseFromString(html, "text/html");
            addGroupsFromDoc(doc, groups);
          } catch (e) {}
        }
        try {
          let r = await fetch("/game.php?screen=groups&ajax=load_group_menu", {
              credentials: "same-origin",
              headers: { "TribalWars-Ajax": "1" },
            }),
            txt = await r.text();
          try {
            let j = JSON.parse(txt),
              walk = (o) => {
                if (!o || typeof o !== "object") return;
                if (Array.isArray(o)) {
                  o.forEach(walk);
                  return;
                }
                let id = o.group_id ?? o.id ?? o.value,
                  name = o.name ?? o.label ?? o.text;
                if (
                  id !== undefined &&
                  /^\d+$/.test(String(id)) &&
                  validGroupName(name)
                )
                  groups.set(String(id), String(name).trim());
                Object.values(o).forEach(walk);
              };
            walk(j);
          } catch (e) {
            let doc = P.parseFromString(txt, "text/html");
            addGroupsFromDoc(doc, groups);
          }
        } catch (e) {}
        let current = $("#mkgroup").value,
          sorted = [...groups]
            .filter(([id, name]) => id === "0" || validGroupName(name))
            .sort((a, b) =>
              a[0] === "0"
                ? -1
                : b[0] === "0"
                  ? 1
                  : a[1].localeCompare(b[1], "cs", { sensitivity: "base" }),
            );
        $("#mkgroup").innerHTML = sorted
          .map(
            ([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`,
          )
          .join("");

        const savedGroup = localStorage.getItem("mk111planner_group");
        if (savedGroup && groups.has(savedGroup)) {
          $("#mkgroup").value = savedGroup;
        } else if (current && groups.has(current)) {
          $("#mkgroup").value = current;
        }

        msg(`Načteno skupin: ${sorted.length}.`);
        await loadVillages();
      } catch (e) {
        $("#mkgroup").innerHTML = '<option value="0">Všechny vesnice</option>';
        msg("Skupiny se nepodařilo načíst.");
        await loadVillages();
      }
    }
    async function loadVillages() {
      try {
        let gid = $("#mkgroup").value || "0",
          groupName =
            $("#mkgroup").selectedOptions[0]?.textContent || "Všechny vesnice";
        msg(`Načítám skupinu „${groupName}“…`);
        let url = `/game.php?screen=overview_villages&mode=combined&group=${encodeURIComponent(gid)}&page=-1`,
          html = await get(url),
          doc = P.parseFromString(html, "text/html"),
          map = new Map();
        doc.querySelectorAll("tr").forEach((tr) => {
          let co = C(tr.textContent || ""),
            links = [...tr.querySelectorAll('a[href*="village="]')],
            a = links.find((x) =>
              (x.getAttribute("href") || "").match(/[?&]village=\d+/),
            ),
            id = (a?.getAttribute("href") || "").match(
              /[?&]village=(\d+)/,
            )?.[1];
          if (id && co && !map.has(id))
            map.set(id, {
              id,
              coord: `${co[0]}|${co[1]}`,
              name: (a.textContent || "").replace(/\s+/g, " ").trim(),
            });
        });
        villages = [...map.values()];
        $("#mkvillages").innerHTML = villages
          .map(
            (v) =>
              `<option value="${esc(v.id)}">${esc(v.coord + (v.name && !v.name.includes(v.coord) ? " – " + v.name : ""))}</option>`,
          )
          .join("");
        localStorage.setItem("mk111planner_group", gid);
        msg(
          villages.length
            ? `Skupina „${groupName}“: ${villages.length} vesnic.`
            : `Ve skupině „${groupName}“ nebyly nalezeny vesnice.`,
        );
      } catch (e) {
        villages = [];
        $("#mkvillages").innerHTML = "";
        msg("Vesnice se nepodařilo načíst.");
      }
    }
    async function targetId(coord) {
      try {
        let r = await fetch(
            `/game.php?screen=api&ajax=target_selection&input=${encodeURIComponent(coord)}`,
            { credentials: "same-origin", headers: { "TribalWars-Ajax": "1" } },
          ),
          j = await r.json(),
          walk = (o) => {
            if (!o || typeof o !== "object") return null;
            if ((o.id || o.village_id) && C(o.coord || o.name || o.label || ""))
              return o.id || o.village_id;
            for (let k in o) {
              let z = walk(o[k]);
              if (z) return z;
            }
            return null;
          };
        return walk(j);
      } catch (e) {
        return null;
      }
    }
    $("#mkclose").onclick = () => ov.remove();
    $("#mkgroup").onchange = async () => {
      localStorage.setItem("mk111planner_group", $("#mkgroup").value || "0");
      await loadVillages();
    };
    const calculatePlan = async (copyAfter = false) => {
      saveSettings();
      const targetCheck = updateTargetStatus();
      let targetText = $("#mktarget").value.trim(),
        targets = targetCheck.valid,
        land = T(landingValue()),
        u = U.find((v) => v.id === $("#mkunit").value),
        selected = [...$("#mkvillages").selectedOptions].map((o) => o.value),
        src = selected.length
          ? villages.filter((v) => selected.includes(v.id))
          : villages,
        blockNight = $("#mkblocknight").checked,
        blockFrom = HM($("#mkblockfrom").value),
        blockTo = HM($("#mkblockto").value),
        maxPerTarget = Number($("#mkmaxpertarget").value),
        ignoreMax = $("#mkignoremax").checked,
        autoReduce = $("#mkautoreduce").checked;
      if (targetCheck.invalid.length)
        return msg(`Oprav chybné cíle: ${targetCheck.invalid.join(", ")}`);
      if (!targets.length)
        return msg("Zadej alespoň jeden správný cíl, například 500|500.");
      if (!Number.isFinite(land))
        return msg(
          "Zadej datum a čas dopadu, například 2026-07-17 a 20:00:00.000.",
        );
      if (!u || !src.length)
        return msg("Vyber skupinu s vesnicemi a jednotku.");
      if (blockNight && (blockFrom === null || blockTo === null))
        return msg("Zadej správný časový rozsah, například 23:00 až 06:00.");
      if (
        !ignoreMax &&
        (!Number.isInteger(maxPerTarget) ||
          maxPerTarget < 1 ||
          maxPerTarget > 20)
      )
        return msg("Počet útoků na jeden cíl musí být celé číslo od 1 do 20.");
      let effectivePerTarget = ignoreMax
        ? Math.floor(src.length / targets.length)
        : maxPerTarget;
      const requestedTotal = ignoreMax
        ? src.length
        : maxPerTarget * targets.length;
      const availablePerTarget = Math.floor(src.length / targets.length);
      let reducedFrom = null;

      if (!ignoreMax && src.length < requestedTotal) {
        if (!autoReduce)
          return msg(
            `Nedostatek výchozích vesnic. Potřeba: ${requestedTotal}, k dispozici: ${src.length}, chybí: ${requestedTotal - src.length}.`,
          );
        reducedFrom = maxPerTarget;
        effectivePerTarget = availablePerTarget;
      }
      if (effectivePerTarget < 1)
        return msg(
          `Nedostatek výchozích vesnic. Pro ${targets.length} cílů je potřeba alespoň ${targets.length} vesnic, k dispozici: ${src.length}.`,
        );

      msg(
        ignoreMax
          ? `Vytvářím plán z ${src.length} vybraných vesnic; každá bude použita maximálně jednou…`
          : reducedFrom
            ? `Není dost vesnic pro ${reducedFrom} útoků na cíl. Automaticky snižuji na ${effectivePerTarget}…`
            : `Vytvářím plán: maximálně ${effectivePerTarget} útoků na každý z ${targets.length} cílů…`,
      );
      let targetData = [];
      for (let tg of targets) {
        let coord = `${tg[0]}|${tg[1]}`,
          tid = await targetId(coord);
        targetData.push({ tg, coord, tid });
      }
      let rows = [],
        blocked = 0,
        usedSources = new Set(),
        perTargetCounts = new Map(targetData.map((t) => [t.coord, 0]));

      // Přidělujeme po kolech: nejdříve 1 útok na každý cíl, potom 2. atd.
      // Tím žádný cíl nespotřebuje všechny vesnice dříve než ostatní.
      for (let round = 0; round < effectivePerTarget; round++) {
        for (let t of targetData) {
          const candidates = src
            .filter((v) => !usedSources.has(v.id))
            .map((v) => {
              const a = C(v.coord),
                dist = Math.hypot(a[0] - t.tg[0], a[1] - t.tg[1]),
                travel = dist * u.sp * 60000,
                send = land - travel,
                url = t.tid
                  ? `${base}?village=${v.id}&screen=place&target=${t.tid}`
                  : `${base}?village=${v.id}&screen=place&x=${t.tg[0]}&y=${t.tg[1]}`;
              return { ...v, target: t.coord, dist, travel, send, url };
            })
            .sort(
              (a, b) =>
                a.dist - b.dist ||
                a.send - b.send ||
                a.coord.localeCompare(b.coord),
            );

          const candidate = candidates.find((c) => {
            if (blockNight && blockedTime(c.send, blockFrom, blockTo)) {
              blocked++;
              return false;
            }
            return true;
          });

          if (!candidate) continue;
          rows.push(candidate);
          usedSources.add(candidate.id);
          perTargetCounts.set(t.coord, (perTargetCounts.get(t.coord) || 0) + 1);
        }
      }

      // V ručním režimu rozdělíme i zbylé označené vesnice, stále maximálně jednou.
      if (ignoreMax) {
        let progress = true;
        while (progress && usedSources.size < src.length) {
          progress = false;
          const orderedTargets = [...targetData].sort(
            (a, b) =>
              (perTargetCounts.get(a.coord) || 0) -
              (perTargetCounts.get(b.coord) || 0),
          );
          for (let t of orderedTargets) {
            const candidates = src
              .filter((v) => !usedSources.has(v.id))
              .map((v) => {
                const a = C(v.coord),
                  dist = Math.hypot(a[0] - t.tg[0], a[1] - t.tg[1]),
                  travel = dist * u.sp * 60000,
                  send = land - travel,
                  url = t.tid
                    ? `${base}?village=${v.id}&screen=place&target=${t.tid}`
                    : `${base}?village=${v.id}&screen=place&x=${t.tg[0]}&y=${t.tg[1]}`;
                return { ...v, target: t.coord, dist, travel, send, url };
              })
              .sort((a, b) => a.dist - b.dist || a.coord.localeCompare(b.coord));
            const candidate = candidates.find(
              (c) =>
                !blockNight || !blockedTime(c.send, blockFrom, blockTo),
            );
            if (!candidate) continue;
            rows.push(candidate);
            usedSources.add(candidate.id);
            perTargetCounts.set(t.coord, (perTargetCounts.get(t.coord) || 0) + 1);
            progress = true;
            if (usedSources.size >= src.length) break;
          }
        }
      }
      rows.sort(
        (a, b) =>
          a.send - b.send ||
          a.target.localeCompare(b.target) ||
          a.coord.localeCompare(b.coord),
      );
      let title = $("#mktitle").value.trim() || "Útok",
        group = $("#mkgroup").selectedOptions[0]?.textContent || "",
        targetSummary = targetData
          .map((t) => `[coord]${t.coord}[/coord]`)
          .join(" "),
        bb =
          `[b]${title}[/b]\n[b]Dopad:[/b] ${F(land)}\n[b]Cíle:[/b] ${targetSummary}\n[b]Jednotka:[/b] [unit]${u.id}[/unit]\n[b]Režim výběru:[/b] ${ignoreMax ? "Ruční – označené vesnice" : `Max. ${maxPerTarget} útoků na cíl`}\n[b]Skupina:[/b] ${group}\n\n[table]\n[**]Výchozí vesnice[||]Cíl[||]Vzdálenost[||]Doba[||]Datum[||]Čas[||]ODESLAT[/**]\n` +
          rows
            .map(
              (r) =>
                `[*][coord]${r.coord}[/coord][|][coord]${r.target}[/coord][|]${r.dist.toFixed(2)}[|]${D(r.travel)}[|]${FD(r.send)}[|]${FT(r.send)}[|][url=${r.url}][b]ODESLAT[/b][/url][/*]`,
            )
            .join("\n") +
          `\n[/table]\n\n[i]Kliknutí na ODESLAT pouze otevře nádvoří. Před odesláním zkontroluj vesnici, cíl a jednotky.[/i]`;
      $("#mkout").value = bb;
      const shortTargets = targetData
        .map((t) => ({ coord: t.coord, count: perTargetCounts.get(t.coord) || 0 }))
        .filter((t) => !ignoreMax && t.count < effectivePerTarget);
      msg(
        ignoreMax
          ? `Hotovo: ${rows.length} příkazů. Každá z použitých vesnic je v plánu jen jednou.${src.length - usedSources.size ? ` Nevyužito: ${src.length - usedSources.size} vesnic.` : ""}${blocked ? ` Některé kombinace byly vynechány kvůli nastavenému času.` : ""}`
          : `Hotovo: ${rows.length} příkazů, ${effectivePerTarget} útoků na cíl${reducedFrom ? ` (sníženo z ${reducedFrom})` : ""}. Každá vesnice je použita maximálně jednou.${shortTargets.length ? ` Kvůli časovému omezení nemají plný počet cíle: ${shortTargets.map((t) => `${t.coord} (${t.count})`).join(", ")}.` : ""}`,
      );
      if (copyAfter) await copyOutput();
    };

    const copyOutput = async () => {
      if (!$("#mkout").value) {
        msg("Nejdříve vypočítej plán.");
        return false;
      }
      try {
        await navigator.clipboard.writeText($("#mkout").value);
      } catch (e) {
        $("#mkout").select();
        document.execCommand("copy");
      }
      msg("BBCode byl zkopírován.");
      return true;
    };

    $("#mkcalc").onclick = () => calculatePlan(false);
    $("#mkcalccopy").onclick = () => calculatePlan(true);
    $("#mkcopy").onclick = async () => {
      await copyOutput();
    };

    [
      "mkunit",
      "mktitle",
      "mkmaxpertarget",
      "mkignoremax",
      "mkautoreduce",
      "mkblocknight",
      "mkblockfrom",
      "mkblockto",
    ].forEach(
      (id) => {
        $(`#${id}`).addEventListener("change", saveSettings);
      },
    );
    $("#mktitle").addEventListener("input", saveSettings);
    $("#mkignoremax").addEventListener("change", () => {
      updateMaxMode();
      saveSettings();
    });
    $("#mktarget").addEventListener("input", () => {
      saveSettings();
      updateTargetStatus();
    });
    updateTargetStatus();

    await loadGroups();
  } catch (e) {
    alert("Chyba plánovače: " + e.message);
  }
})();
