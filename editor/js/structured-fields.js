import { fieldHelp, renderFieldRoles } from "./field-help.js";
import { referenceOptions } from "./reference-options.js";
// Présentation de données sérialisables ; aucune règle du jeu n’est exécutée ici.
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const attribute = (path) => escape(JSON.stringify(path));
export const FIELD_TEMPLATES = {
  modifiers: {
    attack: 0,
    defense: 0,
    morale: 0,
    mobility: 0,
    command: 0,
    health: 0,
  },
  army: { units: [] },
  mission: { kind: "guard" },
  position: { latitude: 0, longitude: 0 },
  publicationCondition: { type: "flag", path: "", equals: true },
};
const rows = {
  challenges: {
    id: "defi",
    questId: "",
    actionId: "",
    strategyCost: 0,
    requirements: [],
  },
  requirements: { type: "class", id: "", minimum: 1 },
  positions: { id: "position", role: "ally", locationSlotId: "" },
  phases: {
    id: "phase",
    information: "",
    order: "",
    positionId: "",
    windowSeconds: 120,
  },
  outcomes: "nouvelle-issue",
  units: {
    id: "",
    ownerPlayerId: "",
    typeId: "",
    quantity: 1,
    rank: "soldier",
    level: 1,
  },
  dependsOn: "",
  cargo: { itemId: "", quantity: 1, occupiedSlots: 1 },
  events: { on: "ActionCompleted", conditions: [], effects: [] },
  transitions: { questId: "", on: "completed" },
  conditions: { type: "flag", path: "", equals: true },
  effects: { type: "xp", amount: 10 },
};
const labels = {
  attack: "Attaque",
  defense: "Défense",
  morale: "Moral",
  mobility: "Mobilité",
  command: "Commandement",
  health: "Points de vie",
};
export const dataType = (value) =>
  value === null || value === undefined
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;
const names = {
  null: "Absent",
  string: "Texte",
  number: "Nombre",
  boolean: "Oui / non",
  object: "Tableau de clés",
  array: "Liste",
};
export function renderStructuredField(
  value,
  path,
  label = path.at(-1),
  depth = 0,
  expected,
  context,
) {
  const key = path.at(-1),
    type =
      value === undefined && expected !== undefined
        ? dataType(expected)
        : dataType(value);
  const attrs = `data-structured-path="${attribute(path)}"`;
  const heading = `<strong>${escape(labels[key] ?? label)}</strong> <small>${escape(key)}</small>`;
  const choices = Object.entries(names)
    .map(
      ([id, name]) =>
        `<option value="${id}" ${type === id ? "selected" : ""}>${name}</option>`,
    )
    .join("");
  let control;
  if (type === "object") {
    const suggestions = FIELD_TEMPLATES[key] ?? {};
    const keys = [
      ...new Set([...Object.keys(suggestions), ...Object.keys(value)]),
    ];
    control = keys
      .map(
        (child) =>
          `<div class="structured-row">${renderStructuredField(value[child], [...path, child], child, depth + 1, suggestions[child], context)}${Object.hasOwn(value, child) ? `<button type="button" class="button small" data-structured-remove="${attribute([...path, child])}" aria-label="Retirer ${escape(child)}">Retirer</button>` : `<small>Non renseigné</small>`}</div>`,
      )
      .join("");
    control += `<div class="structured-add"><input aria-label="Nouvelle clé de ${escape(label)}" placeholder="Nom de la clé"><select aria-label="Type de la nouvelle clé">${Object.entries(
      names,
    )
      .filter(([id]) => id !== "null")
      .map(([id, name]) => `<option value="${id}">${name}</option>`)
      .join(
        "",
      )}</select><button type="button" class="button small" data-structured-new-key="${attribute(path)}">Ajouter une clé</button></div>`;
  } else if (type === "array") {
    control =
      value
        .map(
          (child, index) =>
            `<div class="structured-row">${renderStructuredField(child, [...path, index], `Ligne ${index + 1}`, depth + 1, undefined, context)}<button type="button" class="button small" data-structured-remove="${attribute([...path, index])}">Retirer la ligne</button></div>`,
        )
        .join("") +
      `<button type="button" class="button small" data-structured-add-row="${attribute(path)}">+ Ajouter une ligne</button>`;
  } else if (type === "boolean")
    control = `<select ${attrs} data-structured-value="boolean" aria-label="Valeur de ${escape(label)}"><option value="true" ${value ? "selected" : ""}>Oui</option><option value="false" ${!value ? "selected" : ""}>Non</option></select>`;
  else if (type === "null")
    control = `<span class="help">Facultatif, non renseigné. Choisissez le type attendu pour remplir ce champ.</span>`;
  else if (
    type === "string" &&
    context &&
    referenceOptions(path, context.project, context.catalog)
  ) {
    const options = referenceOptions(path, context.project, context.catalog);
    if (value && !options.some((option) => option.id === value))
      options.push({ id: value, name: `${value} · référence importée` });
    control = `<select ${attrs} data-structured-value="string" aria-label="Valeur de ${escape(label)}">${options.map((option) => `<option value="${escape(option.id)}" ${option.id === value ? "selected" : ""}>${escape(option.name)}</option>`).join("")}</select>`;
  } else
    control = `<input ${attrs} data-structured-value="${type}" type="${type === "number" ? "number" : "text"}" ${type === "number" ? 'step="any"' : ""} placeholder="${type === "number" ? "Nombre, exemple : 2" : "Texte"}" aria-label="Valeur de ${escape(label)}" value="${escape(value)}">`;
  return `<div class="structured-field" data-structured-kind="${type}" ${depth === 0 ? "data-structured-root" : ""}><div class="structured-heading">${heading}<select ${attrs} data-structured-type aria-label="Type de ${escape(label)}">${choices}</select></div>${control}${depth ? `<details class="field-help structured-help"><summary>ⓘ Utilité du champ</summary>${renderFieldRoles(path)}<p>${escape(fieldHelp(path, label))}</p></details>` : ""}</div>`;
}
export function emptyValue(type, key) {
  return type === "object"
    ? structuredClone(FIELD_TEMPLATES[key] ?? {})
    : type === "array"
      ? []
      : type === "boolean"
        ? false
        : type === "number"
          ? 0
          : type === "string"
            ? ""
            : null;
}
export function setStructuredValue(project, path, value, remove = false) {
  if (
    !path.length ||
    path.some((key) => ["__proto__", "constructor", "prototype"].includes(key))
  )
    throw new Error("Clé non autorisée.");
  let parent = project;
  for (const key of path.slice(0, -1)) parent = parent[key] ??= {};
  const key = path.at(-1);
  if (remove) {
    if (Array.isArray(parent)) parent.splice(key, 1);
    else delete parent[key];
  } else parent[key] = value;
}
export function bindStructuredFields(element, { getProject, changed, notify }) {
  const get = (path) => path.reduce((v, key) => v?.[key], getProject());
  element.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.dataset.structuredPath) return;
    try {
      const path = JSON.parse(target.dataset.structuredPath);
      let value;
      if (target.hasAttribute("data-structured-type"))
        value = emptyValue(target.value, path.at(-1));
      else if (target.dataset.structuredValue === "number") {
        if (
          target.value.trim() === "" ||
          !Number.isFinite(Number(target.value))
        )
          throw new Error("Saisissez un nombre valide.");
        value = Number(target.value);
      } else
        value =
          target.dataset.structuredValue === "boolean"
            ? target.value === "true"
            : target.value;
      setStructuredValue(getProject(), path, value);
      changed();
    } catch (error) {
      notify(error.message, true);
    }
  });
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const op = ["Remove", "AddRow", "AddKey", "NewKey"].find(
      (op) => button.dataset[`structured${op}`] !== undefined,
    );
    if (!op) return;
    try {
      const path = JSON.parse(button.dataset[`structured${op}`]);
      if (op === "Remove")
        setStructuredValue(getProject(), path, undefined, true);
      else if (op === "AddRow")
        get(path).push(
          structuredClone(rows[path.at(-1)] ?? get(path)[0] ?? {}),
        );
      else {
        const key =
          op === "AddKey"
            ? button.dataset.key
            : button.parentElement.querySelector("input").value.trim();
        if (!key || ["__proto__", "constructor", "prototype"].includes(key))
          throw new Error("Saisissez une clé valide.");
        if (Object.hasOwn(get(path), key))
          throw new Error("Cette clé existe déjà.");
        const value =
          op === "AddKey"
            ? structuredClone(FIELD_TEMPLATES[path.at(-1)][key])
            : emptyValue(
                button.parentElement.querySelector("select").value,
                key,
              );
        setStructuredValue(getProject(), [...path, key], value);
      }
      changed();
    } catch (error) {
      notify(error.message, true);
    }
  });
}
