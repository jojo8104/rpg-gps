import { createMarshalAppearance } from "../core/portrait-characters.js";
import {
  PORTRAIT_HAIR_COLORS,
  portraitColorKeys,
} from "../core/portrait-hair-colors.js";
import {
  createPortraitAppearance,
  PORTRAIT_BACKGROUNDS,
  PORTRAIT_VARIANTS,
  PORTRAIT_WIDTH_LIMITS,
  portraitProportions,
  PORTRAIT_OPTIONAL_PARTS,
  PORTRAIT_EXPRESSION_PRESETS,
  portraitExpressionKey,
  portraitAccessories,
  isPortraitBeardReference,
} from "../core/portrait-catalog.js";
import {
  createPortraitEditorState,
  parsePortraitEditorState,
  selectPortraitEditorPart,
  selectPortraitEditorAccessories,
  PORTRAIT_SCENE_LIMITS,
  selectPortraitEditorExpression,
  PORTRAIT_EDITOR_GROUPS,
  PORTRAIT_EDITOR_LIMITS,
  defaultPortraitAdjustment,
} from "../core/portrait-editor-state.js";

const storageKey = "rpg-gps:portrait-editor:v1";
const frame = document.querySelector("#preview");
const status = document.querySelector("#save-status");
let state = createPortraitEditorState();
let saveTimer;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) state = parsePortraitEditorState(JSON.parse(saved));
} catch {
  status.textContent =
    "Ancien brouillon incompatible : valeurs par défaut chargées.";
}
const backgrounds = {
  village: "Village",
  town: "Ville / capitale",
  fort: "Fort",
  mine: "Mine",
  quarry: "Carrière",
  forest: "Forêt / chantier",
  tavern: "Taverne",
  forge: "Forge",
  "marshal-room": "Salle du maréchal · château",
};
const clothes = [
  "Guerrier",
  "Mage",
  "Éclaireur",
  "Travailleur",
  "Chef de village",
  "Bourgmestre",
  "Forgeron",
  "Tavernier",
  "Brigand",
  "Simple soldat",
  "Barbare",
  "Maréchal Aldren",
];
function partLabel(gender, part, index) {
  if (PORTRAIT_OPTIONAL_PARTS.includes(part) && index === 0) return "Aucun";
  if (part === "hair" && gender === "male" && index === 8)
    return "Coupe d’Aldren";
  const names = {
    clothing: clothes,
    face: ["Ovale", "Affiné", "Menton carré", "Joufflu"],
    headwear: [
      "Aucun",
      "Casque",
      gender === "male" ? "Casquette de voyage" : "Tiare",
      "Foulard noué",
      "Casque de mineur",
    ],
    prop: ["Aucun", "Lance", "Fourche", "Bâton magique"],
    accessory:
      gender === "male"
        ? [
            "Aucun",
            "Barbe courte",
            "Cicatrice",
            "Boucle d’oreille",
            "Pendentif",
            "Barbe fournie",
            "Bouc",
            "Longue barbe",
          ]
        : ["Aucun", "Cicatrice", "Boucle d’oreille", "Pendentif"],
    eyes: [
      "Regard 1",
      "Regard 2",
      "Regard 3",
      "Regard 4",
      "Yeux et sourcils vieillis",
      "Rire",
      "Colère",
      "Menaçant",
    ],
    mouth: [
      "Bouche 1",
      "Bouche 2",
      "Bouche 3",
      "Bouche 4",
      "Rire",
      "Colère",
      "Menaçant",
    ],
  };
  if (names[part]) return names[part][index];

  const labels = {
    glasses: "Lunettes",
    mask: "Foulard sur le visage",
    forehead: "Rides du front",
    mouthLines: "Plis de la bouche",
    eyeWrinkles: "Pattes-d’oie",
  };
  return (
    labels[part] ?? `${part === "hair" ? "Coupe" : "Variante"} ${index + 1}`
  );
}
function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}
document
  .querySelector("#background")
  .replaceChildren(
    ...PORTRAIT_BACKGROUNDS.map((value) => option(value, backgrounds[value])),
  );
document
  .querySelector("#group")
  .replaceChildren(
    ...Object.entries(PORTRAIT_EDITOR_GROUPS).map(([value, group]) =>
      option(value, group.label),
    ),
  );
function sendPreview() {
  frame.contentWindow?.postMessage(
    { type: "portrait-editor-preview", state },
    location.origin,
  );
}
function commit() {
  sendPreview();
  clearTimeout(saveTimer);
  status.textContent = "Modification en cours…";
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      status.textContent = "Brouillon enregistré dans ce navigateur.";
    } catch {
      status.textContent = "Sauvegarde locale indisponible ; exportez le JSON.";
    }
  }, 250);
}
function partIndex(part) {
  const value = state.appearance[part];
  return value === null ? 0 : Number(value.split("-").at(-1));
}
for (const id of ["hair-color", "beard-color"]) {
  const select = document.querySelector(`#${id}`);
  select.replaceChildren(
    ...(id === "beard-color" ? [option("match", "Assortie aux cheveux")] : []),
    ...Object.entries(PORTRAIT_HAIR_COLORS).map(([key, value]) =>
      option(key, value.label),
    ),
  );
  select.addEventListener("change", () => {
    state.appearance[id === "hair-color" ? "hairColor" : "beardColor"] =
      select.value === "match" ? null : select.value;
    commit();
  });
}
function renderParts() {
  document.querySelector("#hair-color").value = portraitColorKeys(
    state.appearance,
  ).hair;
  document.querySelector("#beard-color").value =
    state.appearance.beardColor === null
      ? "match"
      : portraitColorKeys(state.appearance).beard;

  const gender = state.appearance.gender;
  document.querySelector("#gender").value = gender;
  document.querySelector("#background").value = state.appearance.background;
  for (const part of [
    "clothing",
    "face",
    "hair",
    "eyes",
    "nose",
    "mouth",
    "accessory",
    "headwear",
    "glasses",
    "prop",
    "mask",
    "forehead",
    "mouthLines",
    "eyeWrinkles",
  ]) {
    const select = document.querySelector(`#${part}`);
    if (part === "accessory") {
      select.replaceChildren();
      for (
        let index = 1;
        index < PORTRAIT_VARIANTS[gender].accessory;
        index++
      ) {
        const label = document.createElement("label"),
          input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(index);
        input.checked = portraitAccessories(state.appearance).includes(
          `${gender}-accessory-${index}`,
        );
        input.addEventListener("change", () => {
          state = selectPortraitEditorAccessories(
            state,
            Array.from(select.querySelectorAll("input:checked"), (entry) =>
              Number(entry.value),
            ),
          );
          renderAdjustments();
          commit();
        });
        label.append(
          input,
          document.createTextNode(partLabel(gender, part, index)),
        );
        select.append(label);
      }
      continue;
    }
    select.replaceChildren(
      ...Array.from({ length: PORTRAIT_VARIANTS[gender][part] }, (_, index) =>
        option(index, partLabel(gender, part, index)),
      ),
    );
    select.value = partIndex(part);
  }
  document
    .querySelector("#expression")
    .replaceChildren(
      option("custom", "Personnalisée"),
      ...Object.entries(PORTRAIT_EXPRESSION_PRESETS).map(([key, preset]) =>
        option(key, preset.label),
      ),
    );
  document.querySelector("#expression").value = portraitExpressionKey(
    state.appearance,
  );
}
function slider(parent, id, label, min, max, value, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "slider-row";
  const text = document.createElement("span");
  text.textContent = label;
  const range = document.createElement("input");
  range.type = "range";
  range.min = min;
  range.max = max;
  range.step = 1;
  range.value = value;
  range.id = id;
  const number = document.createElement("input");
  number.type = "number";
  number.min = min;
  number.max = max;
  number.step = 1;
  number.value = value;
  number.setAttribute("aria-label", `${label} — valeur`);
  const update = (source) => {
    if (source.value === "") return;
    const next = Number(source.value);
    if (!Number.isFinite(next) || next < min || next > max) return;
    range.value = number.value = next;
    onChange(next);
    commit();
  };
  range.addEventListener("input", () => update(range));
  number.addEventListener("input", () => update(number));
  wrapper.append(text, range, number);
  parent.append(wrapper);
}
function renderAdjustments() {
  const group = document.querySelector("#group").value;
  const parent = document.querySelector("#adjustments");
  parent.replaceChildren();
  const labels = {
    x: "Décalage horizontal (px)",
    y: "Décalage vertical (px)",
    scaleX: "Largeur (%)",
    scaleY: "Hauteur (%)",
    opacity:
      group === "accessory"
        ? "Opacité des accessoires hors barbe (%)"
        : "Opacité (%)",
  };
  for (const [field, [min, max]] of Object.entries(PORTRAIT_EDITOR_LIMITS)) {
    if (
      field === "opacity" &&
      group === "accessory" &&
      portraitAccessories(state.appearance).length &&
      portraitAccessories(state.appearance).every(isPortraitBeardReference)
    )
      continue;
    slider(
      parent,
      `layer-${field}`,
      labels[field],
      min,
      max,
      state.adjustments[group][field],
      (value) => (state.adjustments[group][field] = value),
    );
  }
  document.querySelector("#visible").checked = state.adjustments[group].visible;
}
function renderScene() {
  const parent = document.querySelector("#scene-adjustments");
  parent.replaceChildren();
  for (const [key, label, min, max] of [
    ["x", "Déplacer à droite (%)", ...PORTRAIT_SCENE_LIMITS.x],
    ["y", "Descendre le buste (%)", ...PORTRAIT_SCENE_LIMITS.y],
    ["scale", "Taille du personnage (%)", 60, 140],
  ])
    slider(
      parent,
      `scene-${key}`,
      label,
      min,
      max,
      state.scene[key],
      (value) => (state.scene[key] = value),
    );
}
function renderVariations() {
  const parent = document.querySelector("#appearance-variations");
  parent.replaceChildren();
  for (const [key, label, min, max] of [
    [
      "widthPercent",
      "Corpulence — largeur du corps (%)",
      ...PORTRAIT_WIDTH_LIMITS,
    ],
  ])
    slider(
      parent,
      `variation-${key}`,
      label,
      min,
      max,
      state.appearance[key],
      (value) => {
        state.appearance[key] = value;
        renderProportionsSummary();
      },
    );
  renderProportionsSummary();
}
function renderProportionsSummary() {
  const { headPercent, bodyPercent } = portraitProportions(state.appearance);
  document.querySelector("#proportions-summary").textContent =
    `Tête : ${headPercent} % · Corps : ${bodyPercent} %`;
}
function renderAll() {
  renderParts();
  renderAdjustments();
  renderScene();
  renderVariations();
  for (const [id, key] of [
    ["speaker-name", "name"],
    ["place-name", "place"],
    ["dialogue-line", "line"],
  ])
    document.querySelector(`#${id}`).value = state.text[key];
  for (const key of ["choices", "guides", "transparent"])
    document.querySelector(`#${key}`).checked = state[key];
  sendPreview();
}
document.querySelector("#load-marshal").addEventListener("click", () => {
  state = createPortraitEditorState("male");
  state.appearance = createMarshalAppearance();
  state.text = {
    name: "Maréchal Aldren",
    place: "Capitale royale",
    line: "Le royaume compte sur vous. Faites-moi votre rapport.",
  };
  renderAll();
  commit();
});
document.querySelector("#gender").addEventListener("change", (event) => {
  const next = createPortraitEditorState(event.target.value);
  state = {
    ...next,
    text: state.text,
    scene: state.scene,
    choices: state.choices,
    guides: state.guides,
    transparent: state.transparent,
    appearance: { ...next.appearance, background: state.appearance.background },
  };
  renderAll();
  commit();
});
document.querySelector("#background").addEventListener("change", (event) => {
  state.appearance.background = event.target.value;
  commit();
});
for (const part of [
  "clothing",
  "face",
  "hair",
  "eyes",
  "nose",
  "mouth",
  ...PORTRAIT_OPTIONAL_PARTS.filter((part) => part !== "accessory"),
])
  document.querySelector(`#${part}`).addEventListener("change", (event) => {
    state =
      part === "accessory"
        ? selectPortraitEditorAccessories(
            state,
            Array.from(event.target.selectedOptions, (option) =>
              Number(option.value),
            ),
          )
        : selectPortraitEditorPart(state, part, Number(event.target.value));
    document.querySelector("#expression").value = portraitExpressionKey(
      state.appearance,
    );
    commit();
  });
document.querySelector("#expression").addEventListener("change", (event) => {
  if (event.target.value === "custom") return;
  state = selectPortraitEditorExpression(state, event.target.value);
  renderParts();
  commit();
});
document.querySelector("#group").addEventListener("change", renderAdjustments);
document.querySelector("#visible").addEventListener("change", (event) => {
  state.adjustments[document.querySelector("#group").value].visible =
    event.target.checked;
  commit();
});
document.querySelector("#reset-layer").addEventListener("click", () => {
  state.adjustments[document.querySelector("#group").value] =
    defaultPortraitAdjustment();
  renderAdjustments();
  commit();
});
document.querySelector("#reset-all").addEventListener("click", () => {
  state = createPortraitEditorState(state.appearance.gender);
  renderAll();
  commit();
});
document.querySelector("#randomize").addEventListener("click", () => {
  state.appearance = createPortraitAppearance({
    identity: `editor:${Date.now()}`,
    gender: state.appearance.gender,
    locationType: state.appearance.background,
    role: "chief",
  });
  renderParts();
  renderVariations();
  commit();
});
for (const [id, key] of [
  ["speaker-name", "name"],
  ["place-name", "place"],
  ["dialogue-line", "line"],
])
  document.querySelector(`#${id}`).addEventListener("input", (event) => {
    state.text[key] = event.target.value;
    commit();
  });
for (const key of ["choices", "guides", "transparent"])
  document.querySelector(`#${key}`).addEventListener("change", (event) => {
    state[key] = event.target.checked;
    commit();
  });
document.querySelector("#export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portrait-${state.appearance.gender}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelector("#import").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 200000) throw new Error("Fichier trop volumineux.");
    state = parsePortraitEditorState(JSON.parse(await file.text()));
    renderAll();
    commit();
  } catch (error) {
    status.textContent = `Import refusé : ${error.message}`;
  }
  event.target.value = "";
});
function fitPreview() {
  const [width, height] = document
    .querySelector("#format")
    .value.split("x")
    .map(Number);
  const holder = document.querySelector("#frame-holder");
  const scale = Math.min(
    1,
    holder.clientWidth / width,
    Math.max(380, innerHeight - 230) / height,
  );
  frame.width = width;
  frame.height = height;
  frame.style.transform = `scale(${scale})`;
  frame.style.marginLeft = `${Math.max(0, (holder.clientWidth - width * scale) / 2)}px`;
  holder.style.height = `${height * scale}px`;
}
document.querySelector("#format").addEventListener("change", fitPreview);
new ResizeObserver(fitPreview).observe(document.querySelector("#frame-holder"));
window.addEventListener("resize", fitPreview);
frame.addEventListener("load", sendPreview);
window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin)
    return;
  if (event.data?.type === "portrait-editor-loaded") sendPreview();
  if (
    ["portrait-editor-ready", "portrait-editor-error"].includes(
      event.data?.type,
    )
  )
    document.querySelector("#preview-status").textContent = event.data.message;
});
renderAll();
fitPreview();
// Le document local est instancié dans la frame sans modifier les en-têtes du serveur.
async function loadPreview() {
  try {
    const response = await fetch("portrait-preview.html");
    if (!response.ok) throw new Error("Aperçu indisponible.");
    frame.srcdoc = await response.text();
  } catch {
    document.querySelector("#preview-status").textContent =
      "Impossible de charger l’aperçu.";
  }
}
loadPreview();

// Session explicite avec la fiche PNJ de l’atelier, sans utiliser son brouillon global.
if (new URLSearchParams(location.search).has("questNpc") && window.opener) {
  const owner = window.opener;
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Enregistrer ce PNJ dans la quête";
  document.querySelector(".editor-header").append(save);
  save.addEventListener("click", () => {
    owner.postMessage({ type: "quest-npc-save", state }, location.origin);
    status.textContent = "Portrait transmis à la quête.";
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== owner) return;
    if (event.data?.type !== "quest-npc-load") return;
    try {
      state = parsePortraitEditorState(event.data.state);
      renderAll();
      sendPreview();
      status.textContent = "PNJ de la quête chargé.";
    } catch {
      status.textContent = "Portrait de quête incompatible.";
    }
  });
  owner.postMessage({ type: "quest-npc-ready" }, location.origin);
}
