import { createNpcPortraitBridge } from "./npc-portrait-bridge.js";
import { addAsset, ensureAssets, renameAsset } from "./asset-model.js";
import { renderMediaLibrary, renderVisualFields } from "./media-view.js";
import { renderStructuredField } from "./structured-fields.js";
import { renderFieldRoles } from "./field-help.js";
import { generateRandomContent } from "./random-content.js";
import { AUTONOMOUS_GROUP_ARCHETYPES } from "../../app/js/core/autonomous-group-catalog.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function renderGroupPreview(id) {
  const preset = AUTONOMOUS_GROUP_ARCHETYPES.find((entry) => entry.id === id);
  if (!preset) return "";
  const url = new URL(
    `../../app/assets/groups/${preset.sprite}`,
    import.meta.url,
  ).href;
  return `<figure><img src="${escape(url)}" alt="${escape(preset.name)} : face à gauche, dos à droite" style="width:100%;max-width:360px;image-rendering:pixelated"><figcaption>Face · Dos</figcaption></figure>`;
}
const definitions = {
  npcs: {
    title: "PNJ de dialogue",
    help: "Personnages narratifs liés à un lieu et une conversation. Cette fiche ne crée pas un héros combattant ni une offre de recrutement en taverne.",
    fields: [
      [
        "id",
        "Identifiant",
        "Référence utilisée par dialogue.qui, speakerId et giverNpcId. Son changement actualise ces références.",
      ],
      [
        "name",
        "Nom affiché",
        "Nom lisible du personnage. Les répliques conservent leur propre nom de personnage.",
      ],
      [
        "role",
        "Rôle narratif",
        "Exemple : intendant, marchand ou prospecteur. Description narrative sans effet automatique.",
      ],
      [
        "locationId",
        "Lieu",
        "Lieu où rencontrer ce PNJ. Utiliser l’identifiant du lieu du projet.",
        "location",
      ],
      [
        "dialogueId",
        "Dialogue associé",
        "Conversation à retrouver dans le catalogue. Son contenu reste édité dans les actions Parler.",
        "dialogue",
      ],
      [
        "description",
        "Description",
        "Contexte, personnalité et notes pour écrire les conversations.",
        "text",
      ],
    ],
  },
  groups: {
    title: "Groupes autonomes (GA)",
    help: "Fiches AutonomousGroup. Ajoutez une fiche aux créations de la quête pour que le moteur serveur la fasse apparaître au déclencheur choisi.",
    fields: [
      [
        "archetypeId",
        "Apparence de carte",
        "Face et dos uniquement. Ce choix ne fixe ni effectif ni statistiques.",
        ["", ...AUTONOMOUS_GROUP_ARCHETYPES.map((entry) => entry.id)],
      ],
      [
        "alignment",
        "Alignement",
        "Relation envers les joueurs : enemy (ennemi), neutral (neutre), ally (allié). Vide : comportement historique des anciens groupes.",
        ["", "enemy", "neutral", "ally"],
      ],
      [
        "id",
        "Identifiant",
        "Référence possible de la cible qui d’une action Combattre.",
      ],
      [
        "type",
        "Type de groupe",
        "Nature reconnue par le moteur : brigands, armée, messager, convoi, prospecteurs ou éclaireurs.",
        ["rogue", "army", "messenger", "convoy", "prospecting", "scout"],
      ],
      [
        "owner.kind",
        "Type de propriétaire",
        "Joueur, faction, lieu ou indépendant.",
        ["player", "faction", "location", "independent"],
      ],
      [
        "owner.id",
        "Identifiant du propriétaire",
        "Doit désigner le propriétaire réel lors de l’intégration au serveur.",
      ],
      [
        "originLocationId",
        "Lieu d’origine",
        "Lieu du monde d’où provient ce groupe. Facultatif.",
        "location",
      ],
      [
        "position.latitude",
        "Latitude",
        "Position initiale en degrés décimaux, vérifiée contre le terrain s’il est défini.",
        "number",
      ],
      [
        "position.longitude",
        "Longitude",
        "Position initiale en degrés décimaux.",
        "number",
      ],
      [
        "behavior",
        "Comportement",
        "Profil traité par le service serveur. passive ne donne pas de mission de déplacement automatiquement.",
      ],
      [
        "detectionMultiplier",
        "Détection",
        "Multiplicateur strictement positif de la détection du groupe.",
        "number",
      ],
      [
        "concealmentMultiplier",
        "Discrétion",
        "Multiplicateur strictement positif de sa discrétion.",
        "number",
      ],
      [
        "army",
        "Armée",
        "Liste de troupes : identifiant, propriétaire, type d’unité, effectif et grade (rank).",
        "json",
      ],
      [
        "cargo",
        "Cargaison",
        "Liste des éléments transportés selon leur format serveur. Elle ne crée pas un stock économique.",
        "json",
      ],
      [
        "mission",
        "Mission",
        "Absent pour aucune mission. Une mission doit respecter le service qui l’exécute ; la validation structurelle ne simule pas son comportement.",
        "json",
      ],
    ],
  },
  items: {
    title: "Objets",
    help: "Fiches d’objets uniques, équipements ou personnages au format createUniqueItemDefinition. Elles doivent être ajoutées au catalogue serveur avant de devenir disponibles en partie.",
    fields: [
      [
        "id",
        "Identifiant",
        "Référence utilisée par les créations, transferts et récompenses. Ne doit pas remplacer un objet du catalogue officiel.",
      ],
      ["name", "Nom affiché", "Nom lisible dans l’inventaire."],
      [
        "category",
        "Catégorie",
        "Objet de quête unique, équipement ou personnage transportable.",
        ["unique", "equipment", "character"],
      ],
      ["icon", "Icône", "Symbole textuel de l’objet, par exemple ◆ ou 📜."],
      [
        "description",
        "Description",
        "Présentation de l’objet au joueur.",
        "text",
      ],
      [
        "usage",
        "Utilité",
        "Explique comment l’utiliser. Le texte ne crée pas une capacité automatique.",
        "text",
      ],
      [
        "equipmentSlot",
        "Emplacement d’équipement",
        "À renseigner pour un équipement ; vide pour les autres objets.",
        [
          "",
          "head",
          "neck",
          "torso",
          "mainHand",
          "offHand",
          "feet",
          "accessory",
        ],
      ],
      [
        "modifiers",
        "Bonus",
        "Renseignez les bonus numériques proposés. Les cases vides restent non renseignées ; 0 signifie aucun bonus et une valeur négative représente un malus.",
        "json",
      ],
    ],
  },
};
export function createAssetView({ element, getProject, changed, notify, host }) {
  const portraits = createNpcPortraitBridge({ getProject, changed, notify, host });
  const get = (object, path) =>
    path.split(".").reduce((value, key) => value?.[key], object);
  function render() {
    const project = getProject(),
      assets = ensureAssets(project);
    const open = new Set(
      [...element.querySelectorAll("details[data-entry]")]
        .filter((el) => el.open)
        .map((el) => el.dataset.entry),
    );
    element.innerHTML =
      renderMediaLibrary(project) +
      `<section class="asset-section"><h3>Modèles de groupes autonomes</h3><p class="help">Ajoutez un modèle, choisissez son alignement et ses troupes, puis utilisez « Créer ce GA dans la quête courante ».</p><div class="toolbar-actions">${AUTONOMOUS_GROUP_ARCHETYPES.map((entry) => `<button class="button small" data-group-preset="${entry.id}">${entry.name}</button>`).join("")}</div></section>` +
      `<p class="help">Créez les fiches du contenu utilisé par votre quête. Les dialogues sont déjà éditables depuis les actions Parler. Validez et exportez pour préparer l’intégration serveur.</p>` +
      Object.entries(definitions)
        .map(
          ([kind, definition]) =>
            `<section class="asset-section"><div class="section-heading"><h3>${definition.title} · ${assets[kind].length}</h3><div class="toolbar-actions">${kind !== "groups" ? `<button class="button small" data-generate-asset="${kind}" title="Outil de l’éditeur : ajouter une fiche aléatoire, puis la modifier. Aucun élément n’est créé en partie.">🎲 Générer</button>` : ""}<button class="button small" data-add-asset="${kind}">+ Ajouter</button></div></div><p class="help">${definition.help}</p>${assets[
              kind
            ]
              .map(
                (entry, index) =>
                  `<details class="asset-entry" data-entry="${kind}:${index}" ${open.has(`${kind}:${index}`) ? "open" : ""}><summary>${escape(entry.name || entry.id)} <small>${escape(entry.id)}</small></summary><div class="asset-fields">${definition.fields
                    .map(([path, label, help, type]) => {
                      const value = get(entry, path),
                        attrs = `data-asset="${kind}" data-index="${index}" data-path="${path}"`;
                      let choices = Array.isArray(type)
                        ? type
                        : type === "location"
                          ? [
                              "",
                              ...project.world.locations.map(
                                (place) => place.id,
                              ),
                            ]
                          : type === "dialogue"
                            ? ["", ...Object.keys(project.dialogues)]
                            : null;
                      if (choices && value && !choices.includes(value))
                        choices.push(value);
                      const input =
                        type === "json"
                          ? renderStructuredField(
                              value ?? null,
                              ["assets", kind, index, ...path.split(".")],
                              label.replace(" (JSON)", ""),
                            )
                          : choices
                            ? `<select ${attrs}>${choices.map((choice) => `<option value="${escape(choice)}" ${choice === (value ?? "") ? "selected" : ""}>${escape(path === "archetypeId" ? (AUTONOMOUS_GROUP_ARCHETYPES.find((entry) => entry.id === choice)?.name ?? "Apparence habituelle") : path === "alignment" ? ({ enemy: "Ennemi", neutral: "Neutre", ally: "Allié" }[choice] ?? "Automatique (ancien groupe)") : choice || "Aucun")}</option>`).join("")}</select>`
                            : type === "json" || type === "text"
                              ? `<textarea ${attrs} data-json="${type === "json"}" ${type === "json" ? 'class="json-field"' : ""}>${escape(type === "json" ? JSON.stringify(value ?? null, null, 2) : value)}</textarea>`
                              : `<input ${attrs} type="${type === "number" ? "number" : "text"}" step="any" value="${escape(value)}">`;
                      return `<div class="field">${type === "json" ? input : `<label><span>${label}</span>${input}</label>`}<details class="field-help"><summary>ⓘ À quoi sert ce champ ?</summary>${renderFieldRoles(["assets", kind, index, ...path.split(".")])}<p>${help}</p></details></div>`;
                    })
                    .join(
                      "",
                    )}${kind === "groups" && entry.archetypeId ? renderGroupPreview(entry.archetypeId) : ""}${renderVisualFields(entry, ["assets", kind, index], project)}${kind === "npcs" ? `<button class="button small" data-npc-portrait="${index}">${entry.portraitEditor ? "Modifier le personnage enregistré" : "Ouvrir l’éditeur de PNJ"}</button><p class="help">Portrait conservé dans ce projet de quête. Associez le dialogue de ce PNJ pour l’utiliser en jeu.</p>` : ""}${kind === "groups" ? `<button class="button small" data-quest-group="${index}">Créer ce GA dans la quête courante</button>` : ""}<button class="button small" data-remove-asset="${kind}" data-index="${index}">Supprimer la fiche</button></div></details>`,
              )
              .join("")}</section>`,
        )
        .join("");
  }
  element.addEventListener("input", (event) => {
    const target = event.target;
    if (
      !target.dataset.asset ||
      target.dataset.path === "id" ||
      target.dataset.json === "true" ||
      target.tagName === "SELECT"
    )
      return;
    update(event, false);
  });
  function update(event, redraw = true) {
    const target = event.target;
    if (!target.dataset.asset) return;
    try {
      const project = getProject(),
        entry =
          ensureAssets(project)[target.dataset.asset][
            Number(target.dataset.index)
          ],
        path = target.dataset.path;
      let value =
        target.dataset.json === "true"
          ? JSON.parse(target.value)
          : target.type === "number"
            ? Number(target.value)
            : target.value;
      if (path === "id")
        renameAsset(project, target.dataset.asset, entry.id, value);
      else {
        const keys = path.split("."),
          last = keys.pop();
        let parent = entry;
        for (const key of keys) {
          parent[key] ??= {};
          parent = parent[key];
        }
        if (
          value === "" &&
          [
            "equipmentSlot",
            "originLocationId",
            "archetypeId",
            "alignment",
          ].includes(path)
        )
          value = null;
        parent[last] = value;
      }
      changed(true, false);
      if (redraw) render();
    } catch (issue) {
      notify(issue.message, true);
      target.setAttribute("aria-invalid", "true");
    }
  }
  element.addEventListener("change", (event) => update(event));
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.npcPortrait !== undefined) {
      portraits.open(
        ensureAssets(getProject()).npcs[Number(button.dataset.npcPortrait)],
      );
    } else if (button.dataset.groupPreset) {
      const preset = AUTONOMOUS_GROUP_ARCHETYPES.find(
        (entry) => entry.id === button.dataset.groupPreset,
      );
      if (!preset) return;
      addAsset(getProject(), "groups", { archetypeId: preset.id });
      changed(true, false);
      render();
      const entries = element.querySelectorAll(
        'details[data-entry^="groups:"]',
      );
      entries[entries.length - 1].open = true;
      notify(
        `${preset.name} ajouté : choisissez l’alignement et le contenu de l’armée.`,
      );
    } else if (button.dataset.questGroup !== undefined) {
      const project = getProject(),
        group = ensureAssets(project).groups[Number(button.dataset.questGroup)];
      if (project.quest.prerequisites.some((entry) => entry.id === group.id))
        return notify(
          "Cet identifiant existe déjà dans les créations de la quête.",
        );
      project.quest.prerequisites.push({
        id: group.id,
        type: "ga",
        when: "accepted",
        properties: structuredClone(group),
        dependsOn: [],
        belongsToLocation: false,
        locationId: group.originLocationId ?? "",
      });
      changed();
      notify(
        "Création ajoutée à la quête. Réglez son lieu et son déclencheur dans la fiche de quête.",
      );
    } else if (button.dataset.addAsset || button.dataset.generateAsset) {
      const kind = button.dataset.addAsset ?? button.dataset.generateAsset;
      const entry = button.dataset.generateAsset
        ? generateRandomContent(getProject(), kind)
        : addAsset(getProject(), kind);
      changed(true, false);
      render();
      const entries = element.querySelectorAll(
        `details[data-entry^="${kind}:"]`,
      );
      entries[entries.length - 1].open = true;
      notify(`Fiche ${entry.id} créée.`);
    } else if (button.dataset.removeAsset) {
      ensureAssets(getProject())[button.dataset.removeAsset].splice(
        Number(button.dataset.index),
        1,
      );
      changed(true, false);
      render();
      notify(
        "Fiche retirée. Les références restantes seront vérifiées à la validation. Ctrl+Z pour annuler.",
      );
    }
  });
  return { render };
}
