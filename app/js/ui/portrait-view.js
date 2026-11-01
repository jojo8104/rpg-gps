import { namedPortraitAppearance } from "../core/portrait-characters.js";
import {
  isPortraitAppearance,
  portraitLayerOrder,
  portraitLayerPath,
  portraitProportions,
  portraitLayerBlock,
  isPortraitBeard,
  portraitAccessories,
  isPortraitBeardReference,
} from "../core/portrait-catalog.js";
import {
  PORTRAIT_HAIR_COLORS,
  portraitColorKeys,
} from "../core/portrait-hair-colors.js";
let colorFilterSequence = 0;
function colorFilter(id, key) {
  const tones = PORTRAIT_HAIR_COLORS[key].tones;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer>${["R", "G", "B"].map((channel, index) => `<feFunc${channel} type="table" tableValues="${tones.map((tone) => (tone[index] / 255).toFixed(6)).join(" ")}"/>`).join("")}</feComponentTransfer></filter>`;
}

/** Affiche uniquement les références du catalogue, jamais de chemin fourni par un PNJ. */
export function portraitLayersMarkup(appearance) {
  if (!isPortraitAppearance(appearance)) return "";
  const base = "assets/portraits/modular/v1/";
  const broadShoulders =
    appearance.gender === "male" &&
    [0, 1, 2, 5, 7].some(
      (index) => appearance.clothing === `male-clothing-${index}`,
    );
  const beard = isPortraitBeard(appearance);
  const { headPercent, bodyPercent } = portraitProportions(appearance);
  const colors = portraitColorKeys(appearance);
  const filterId = `portrait-tone-${++colorFilterSequence}`;
  const beardFilter =
    colors.beard === colors.hair ? `${filterId}-hair` : `${filterId}-beard`;
  const filters = `<svg class="composed-portrait__filters" width="0" height="0" aria-hidden="true" focusable="false"><defs>${colorFilter(`${filterId}-hair`, colors.hair)}${beard && colors.beard !== colors.hair ? colorFilter(beardFilter, colors.beard) : ""}</defs></svg>`;
  return `<span class="composed-portrait" data-portrait-gender="${appearance.gender}" data-portrait-clothing="${appearance.clothing}" data-portrait-beard="${beard}" data-broad-shoulders="${broadShoulders}" style="--portrait-head-width:${headPercent / 100};--portrait-body-width:${bodyPercent / 100};--portrait-beard-opacity:1" aria-hidden="true">${filters}<img class="composed-portrait__background" src="${base}background-${appearance.background}.png" alt="" decoding="async"><span class="composed-portrait__person"><span class="composed-portrait__figure">${portraitLayerOrder(
    appearance,
  )
    .flatMap((part) =>
      part === "accessory"
        ? portraitAccessories(appearance).map((reference) => ({
            part,
            reference,
          }))
        : [{ part }],
    )
    .map(({ part, reference }) => {
      const single = reference
        ? { ...appearance, accessory: reference, additionalAccessories: [] }
        : appearance;
      const beardPiece =
        part === "accessory" && isPortraitBeardReference(reference);
      const tone = ["hair", "hairBack"].includes(part)
        ? colors.hair
        : beardPiece
          ? colors.beard
          : null;
      const filter = beardPiece ? beardFilter : `${filterId}-hair`;
      const clip =
        ["hair", "hairBack"].includes(part) &&
        [1, 4].some(
          (index) =>
            appearance.headwear === `${appearance.gender}-headwear-${index}`,
        )
          ? ";clip-path:inset(14% 0 0 0)"
          : "";
      return `<span class="composed-portrait__layer" data-portrait-block="${portraitLayerBlock(single, part)}"><img data-portrait-layer="${part}"${reference ? ` data-portrait-accessory="${reference}" data-portrait-beard-piece="${beardPiece}"` : ""} src="${portraitLayerPath(single, part)}"${tone ? ` data-portrait-color="${tone}" style="filter:url(#${filter})${clip}"` : ""} alt="" decoding="async"></span>`;
    })
    .join("")}</span></span></span>`;
}

export function dialoguePortraitMarkup(conversation, escapeAttribute) {
  const named = namedPortraitAppearance(conversation.portrait);
  if (named)
    conversation = { ...conversation, portrait: null, appearance: named };
  // Les autres portraits narratifs et les images de l’éditeur restent prioritaires.
  const composed = conversation.portrait
    ? ""
    : portraitLayersMarkup(conversation.appearance);
  return `<div class="dialogue-art${composed ? " dialogue-art--composed" : ""}"${conversation.portrait ? ` style="background-image:url('${escapeAttribute(conversation.portrait)}')"` : ""} role="img" aria-label="${escapeAttribute(conversation.name)}">${composed}</div>`;
}

export function usesComposedPortrait(conversation) {
  return (
    Boolean(namedPortraitAppearance(conversation.portrait)) ||
    (!conversation.portrait && isPortraitAppearance(conversation.appearance))
  );
}
