
      s|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(
          name,
        )
      );
    }

    function addGroupsFromDoc(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((a) => {
        let href = a.getAttribute("href") || "",
          id = href.match(/[?&]group=(\d+)/)?.[1],
          name = a.textContent.replace(/\s+/g, " ").trim();

        if (id && validGroupName(name)) {
          groups.set(String(id), name);
        }
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

          if (
            id &&
            /^\d+$/.test(String(id)) &&
            validGroupName(name)
          ) {
            groups.set(String(id), name);
          }
        });

      doc.querySelectorAll("[data-group-id],[data-group]").forEach((el) => {
        let id = el.dataset.groupId || el.dataset.group,
          name = el.textContent.replace(/\s+/g, " ").trim();

        if (
          id &&
          /^\d+$/.test(String(id)) &&
          validGroupName(name)
        ) {
          groups.set(String(id), name);
        }
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
          let r = await fetch(
              "/game.php?screen=groups&ajax=load_group_menu",
              {
                credentials: "same-origin",
                headers: {
                  "TribalWars-Ajax": "1",
                },
              },
            ),
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
                ) {
                  groups.set(String(id), String(name).trim());
                }

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
            .filter(
              ([id, name]) =>
                id === "0" || validGroupName(name),
            )
            .sort((a, b) =>
              a[0] === "0"
                ? -1
                : b[0] === "0"
                  ? 1
                  : a[1].localeCompare(b[1], "cs", {
                      sensitivity: "base",
                    }),
            );

        $("#mkgroup").innerHTML = sorted
          .map(
            ([id, name]) =>
              `<option value="${esc(id)}">${esc(name)}</option>`,
          )
          .join("");

        if (current && groups.has(current)) {
          $("#mkgroup").value = current;
        }

        msg(`Načteno skupin: ${sorted.length}.`);

        await loadVillages();
      } catch (e) {
        $("#mkgroup").innerHTML =
          '<option value="0">Všechny vesnice</option>';

        msg("Skupiny se nepodařilo načíst.");

        await loadVillages();
      }
    }

    async function loadVillages() {
      try {
        let gid = $("#mkgroup").value || "0",
          groupName =
            $("#mkgroup").selectedOptions[0]?.textContent ||
            "Všechny vesnice";

        msg(`Načítám skupinu „${groupName}“…`);

        let url = `/game.php?screen=overview_villages&mode=combined&group=${encodeURIComponent(gid)}&page=-1`,
          html = await get(url),
          doc = P.parseFromString(html, "text/html"),
          map = new Map();

        doc.querySelectorAll("tr").forEach((tr) => {
          let co = C(tr.textContent || ""),
            links = [...tr.querySelectorAll('a[href*="village="]')],
            a = links.find((x) =>
              (x.getAttribute("href") || "").match(
                /[?&]village=\d+/,
              ),
            ),
            id = (a?.getAttribute("href") || "").match(
              /[?&]village=(\d+)/,
            )?.[1];

          if (id && co && !map.has(id)) {
            map.set(id, {
              id,
              coord: `${co[0]}|${co[1]}`,
              name: (a.textContent || "")
                .replace(/\s+/g, " ")
                .trim(),
            });
          }
        });

        villages = [...map.values()];

        $("#mkvillages").innerHTML = villages
          .map(
            (v) =>
              `<option value="${esc(v.id)}">${esc(
                v.coord +
                  (v.name && !v.name.includes(v.coord)
                    ? " – " + v.name
                    : ""),
              )}</option>`,
          )
          .join("");

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
            {
              credentials: "same-origin",
              headers: {
                "TribalWars-Ajax": "1",
              },
            },
          ),
          j = await r.json(),
          walk = (o) => {
            if (!o || typeof o !== "object") return null;

            if (
              (o.id || o.village_id) &&
              C(o.coord || o.name || o.label || "")
            ) {
              return o.id || o.village_id;
            }

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
    $("#mkgroup").onchange = loadVillages;
    $("#mkrefresh").onclick = loadGroups;
    $("#mkload").onclick = loadVillages;
        $("#mkcalc").onclick = async () => {
      let tc = $("#mktarget").value.trim(),
        tg = C(tc),
        land = T($("#mkland").value),
        u = U.find((v) => v.id === $("#mkunit").value),
        selected = [...$("#mkvillages").selectedOptions].map(
          (o) => o.value,
        ),
        src = selected.length
          ? villages.filter((v) => selected.includes(v.id))
          : villages;

      if (!tg) {
        return msg("Zadej správný cíl, například 500|500.");
      }

      if (!Number.isFinite(land)) {
        return msg(
          "Zadej čas ve formátu 2026-07-17 20:00:00.000.",
        );
      }

      if (!u || !src.length) {
        return msg("Vyber skupinu s vesnicemi a jednotku.");
      }

      msg("Vytvářím plán…");

      let tid = await targetId(tc),
        rows = src
          .map((v) => {
            let a = C(v.coord),
              dist = Math.hypot(a[0] - tg[0], a[1] - tg[1]),
              travel = dist * u.sp * 60000,
              send = land - travel,
              url = tid
                ? `${base}?village=${v.id}&screen=place&target=${tid}`
                : `${base}?village=${v.id}&screen=place&x=${tg[0]}&y=${tg[1]}`;

            return {
              ...v,
              dist,
              travel,
              send,
              url,
            };
          })
          .sort((a, b) => a.send - b.send),
        title = $("#mktitle").value.trim() || "Útok",
        target = `${tg[0]}|${tg[1]}`,
        group =
          $("#mkgroup").selectedOptions[0]?.textContent || "",
        bb =
          `[b]${title}[/b]\n` +
          `[b]Dopad:[/b] ${F(land)}\n` +
          `[b]Cíl:[/b] [coord]${target}[/coord]\n` +
          `[b]Jednotka:[/b] [unit]${u.id}[/unit]\n` +
          `[b]Skupina:[/b] ${group}\n\n` +
          `[table]\n` +
          `[**]Výchozí vesnice[||]Cíl[||]Vzdálenost[||]Doba[||]Čas odeslání[||]Odeslat[/**]\n` +
          rows
            .map(
              (r) =>
                `[*][coord]${r.coord}[/coord]` +
                `[|][coord]${target}[/coord]` +
                `[|]${r.dist.toFixed(2)}` +
                `[|]${D(r.travel)}` +
                `[|]${F(r.send)}` +
                `[|][url=${r.url}][b]ODESLAT[/b][/url][/*]`,
            )
            .join("\n") +
          `\n[/table]\n\n` +
          `[i]Kliknutí na ODESLAT pouze otevře nádvoří. Před odesláním zkontroluj vesnici, cíl a jednotky.[/i]`;

      $("#mkout").value = bb;

      msg(
        `Hotovo: ${rows.length} příkazů ze skupiny „${group}“.`,
      );
    };

    $("#mkcopy").onclick = async () => {
      if (!$("#mkout").value) {
        return msg("Nejdříve vypočítej plán.");
      }

      try {
        await navigator.clipboard.writeText(
          $("#mkout").value,
        );
      } catch (e) {
        $("#mkout").select();
        document.execCommand("copy");
      }

      msg("BBCode byl zkopírován.");
    };

    await loadGroups();
  } catch (e) {
    alert("Chyba plánovače: " + e.message);
  }
})();
