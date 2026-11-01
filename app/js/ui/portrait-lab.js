import {
  createPortraitAppearance,
  PORTRAIT_GENDERS,
  PORTRAIT_LAYER_ORDER,
  portraitLayerPath,
  PORTRAIT_VARIANTS,
} from "../core/portrait-catalog.js";
import { portraitLayersMarkup } from "./portrait-view.js";
import { heroPortrait, heroClassName } from "./hero-appearance.js";
import { heroPoseStyle } from "../map/hero-sprite-atlas.js";
import { LocationChiefService } from "../core/location-chief-service.js";
import { buildingConversation } from "../core/building-dialogue-catalog.js";
import { closeDialogueView, renderDialogueView } from "./dialogue-view.js";

const heroes = document.querySelector("#heroes");
for (const gender of ["male", "female"]) {
  for (const classId of ["warrior", "mage", "ranger"]) {
    heroes.insertAdjacentHTML(
      "beforeend",
      `<figure><img src="${heroPortrait(classId, gender)}" alt="${heroClassName(classId, gender)}"><figcaption>${heroClassName(classId, gender)} · ${gender === "male" ? "Homme" : "Femme"}</figcaption></figure>`,
    );
  }
}
let batch = 0;
const examples = [
  ["Chef de village", "village", "chief"],
  ["Bourgmestre", "town", "chief"],
  ["Chef des mineurs", "mine", "mine"],
  ["Chef des carriers", "quarry", "quarry"],
  ["Chef des bûcherons", "lumber-camp", "lumber-camp"],
  ["Seigneur du fort", "fort", "fort"],
  ["Forgeron", "village", "forge"],
  ["Tavernier", "village", "tavern"],
  ["Géologue", "tavern", "specialist"],
  ["Mineur aguerri", "tavern", "worker"],
  ["Officier instructeur", "tavern", "officer"],
  ["Sage itinérant", "tavern", "trainer"],
];
async function verifyImages() {
  const images = [...document.images];
  await Promise.all(images.map((image) => image.decode().catch(() => {})));
  const failed = images.filter((image) => !image.naturalWidth);
  document.querySelector("#status").textContent = failed.length
    ? `${failed.length} image(s) indisponible(s)`
    : `${images.length} images chargées · lot ${batch + 1}`;
}
function render() {
  const clothingNames = [
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
  document.querySelector("#wardrobe").innerHTML = PORTRAIT_GENDERS.flatMap(
    (gender) => {
      const base = createPortraitAppearance({
        identity: "atelier:proportions",
        gender,
      });
      return Array.from(
        { length: PORTRAIT_VARIANTS[gender].clothing },
        (_, index) => {
          const appearance = {
            ...base,
            clothing: `${gender}-clothing-${index}`,
            body: `${gender}-body-${index}`,
            clothingBack: `${gender}-clothingBack-${index}`,
            accessory: null,
          };
          return `<figure><div class="portrait portrait--anatomy">${portraitLayersMarkup(appearance)}</div><figcaption>${gender === "male" ? "Homme" : "Femme"} · ${clothingNames[index]}</figcaption></figure>`;
        },
      );
    },
  ).join("");
  document.querySelector("#npcs").innerHTML = PORTRAIT_GENDERS.map(
    (gender) =>
      `<section><h3>Bibliothèque ${gender === "male" ? "masculine" : "féminine"}</h3><div class="gallery">${examples
        .map(([name, locationType, role], index) => {
          const appearance = createPortraitAppearance({
            identity: `atelier:${batch}:${index}`,
            locationType,
            role,
            gender,
          });
          return `<figure><div class="portrait" role="img" aria-label="${name}">${portraitLayersMarkup(appearance)}</div><figcaption>${name}</figcaption></figure>`;
        })
        .join("")}</div></section>`,
  ).join("");
  document.querySelector("#hairstyles").innerHTML = PORTRAIT_GENDERS.flatMap(
    (gender) => {
      const base = createPortraitAppearance({
        identity: "atelier:coiffure",
        gender,
      });
      return Array.from(
        { length: PORTRAIT_VARIANTS[gender].hair },
        (_, index) => {
          const appearance = {
            ...base,
            hair: `${gender}-hair-${index}`,
            hairBack:
              gender === "female" ? `${gender}-hairBack-${index}` : null,
          };
          return `<figure><div class="portrait">${portraitLayersMarkup(appearance)}</div><figcaption>${gender === "male" ? "Homme" : "Femme"} · coupe ${index + 1} · même visage</figcaption></figure>`;
        },
      );
    },
  ).join("");
  renderLayers();
  verifyImages();
}
function renderLayers() {
  const gender = document.querySelector("#layer-gender").value;
  const appearance = createPortraitAppearance({
    identity: "atelier:calques",
    gender,
  });
  document.querySelector("#layers").innerHTML = PORTRAIT_LAYER_ORDER.filter(
    (part) => appearance[part] !== null,
  )
    .map(
      (part) =>
        `<figure><div class="layer"><img src="${portraitLayerPath(appearance, part)}" alt="Calque ${part}"></div><figcaption>${appearance[part]}</figcaption></figure>`,
    )
    .join("");
}
document.querySelector("#layer-gender").addEventListener("change", () => {
  renderLayers();
  verifyImages();
});
document.querySelector("#next").addEventListener("click", () => {
  batch++;
  render();
});
render();
document.querySelector("#dialogue-preview").addEventListener("click", () => {
  const element = document.querySelector("#dialogue-check");
  const isForge = document.querySelector("#dialogue-scene").value === "forge";
  const gender = document.querySelector("#dialogue-gender").value;
  const content = document.querySelector("#dialogue-content").value;
  const conversation = isForge
    ? buildingConversation({
        buildingId: "forge",
        remaining: 3,
        location: {
          id: "atelier:forge",
          name: "Capitale royale",
          type: "capital",
          infrastructure: { forge: 1 },
        },
      })
    : new LocationChiefService().getConversation({
        location: {
          id: "atelier:mine",
          name: "Mine de contrôle",
          type: "mine",
        },
      });
  conversation.appearance = {
    ...createPortraitAppearance({
      identity: `atelier:${isForge ? "forge" : "mine"}`,
      gender,
      role: isForge ? "forge" : "mine",
      locationType: isForge ? "forge" : "mine",
    }),
    hair: `${gender}-hair-0`,
    hairBack: gender === "female" ? "female-hairBack-0" : null,
    eyes: `${gender}-eyes-0`,
    accessory: null,
  };
  if (content === "short")
    conversation.openingLines = ["Bienvenue dans mon atelier."];
  if (content === "long")
    conversation.openingLines = [
      Array(5).fill(conversation.openingLines[0]).join(" "),
    ];
  if (content === "choices")
    conversation.options = Array.from({ length: 12 }, (_, index) => ({
      id: `preview-${index}`,
      label: `Choix de contrôle ${index + 1}`,
    }));
  const draw = (showChoices = false) =>
    renderDialogueView({
      element,
      conversation,
      lines: conversation.openingLines,
      lineIndex: 0,
      showChoices,
      onAdvance: () => draw(true),
      onChoose: () => closeDialogueView(element),
      onClose: () => closeDialogueView(element),
    });
  draw(content === "choices");
});
for (let direction = 0; direction < 8; direction++) {
  for (let step = 0; step < 3; step++) {
    const frame = document.createElement("div");
    frame.className = "sprite-frame";
    frame.setAttribute("aria-label", `Direction ${direction}, pose ${step}`);
    const sprite = document.createElement("span");
    Object.assign(sprite.style, heroPoseStyle(direction, step, "mage", "male"));
    frame.append(sprite);
    document.querySelector("#mage-sprites").append(frame);
  }
}
