import {
  addProjectImage,
  removeProjectImage,
  imagePreview,
  imagePath,
  MAX_IMAGE_BYTES,
} from "./media-model.js";
import { renderFieldRoles } from "./field-help.js";
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderMediaLibrary(project) {
  return `<section class="asset-section media-library"><h3>Bibliothèque d’images · ${project.media?.images?.length ?? 0}</h3><p class="help">PNG, JPEG ou WebP, 2 Mo par image, 8 Mo par projet. Importez une image puis choisissez-la dans une fiche. Les images fixes n’ajoutent pas d’animation.</p><label class="button">+ Importer des images<input type="file" data-media-upload accept="image/png,image/jpeg,image/webp" multiple hidden></label><div class="media-grid">${(project.media?.images ?? []).map((image) => `<figure><img src="${escape(image.dataUrl)}" alt="${escape(image.name)}"><figcaption>${escape(image.name)}<small>${image.width} × ${image.height}</small></figcaption><button class="button small" data-media-remove="${image.id}">Retirer</button></figure>`).join("")}</div></section>`;
}
export function renderVisualFields(entity, path, project) {
  return `<section class="visual-fields"><h4>Apparence</h4>${renderFieldRoles([...path, "visual", "icon"])}<p class="help">Par défaut : visuel habituel du jeu. Importez vos images dans PNJ, GA & objets. L’apparence ne change aucune règle.</p>${[
    "icon",
    "illustration",
  ]
    .map((role) => {
      const reference = entity.visual?.[role] ?? "",
        preview = imagePreview(project, reference);
      const choices = (project.media?.images ?? []).map((image) => ({
        reference: imagePath(image),
        name: image.name,
      }));
      if (reference && !choices.some((image) => image.reference === reference))
        choices.push({ reference, name: "Image installée" });
      return `<div class="field"><label><span>${role === "icon" ? "Icône / symbole de carte" : "Illustration / portrait"}</span><select data-visual-bind="${escape(JSON.stringify([...path, "visual", role]))}"><option value="">Apparence du jeu (par défaut)</option>${choices.map((image) => `<option value="${escape(image.reference)}" ${reference === image.reference ? "selected" : ""}>${escape(image.name)}</option>`).join("")}</select></label>${preview ? `<img class="visual-preview" src="${escape(preview)}" alt="Aperçu du visuel">` : ""}</div>`;
    })
    .join("")}</section>`;
}
export function bindMediaEditor(element, { getProject, changed, notify }) {
  element.addEventListener("click", (event) => {
    const button = event.target.closest("[data-media-remove]");
    if (!button) return;
    try {
      removeProjectImage(getProject(), button.dataset.mediaRemove);
      changed();
    } catch (issue) {
      notify(issue.message, true);
    }
  });
  element.addEventListener("change", async (event) => {
    const target = event.target;
    try {
      if (target.dataset.visualBind) {
        const path = JSON.parse(target.dataset.visualBind),
          project = getProject();
        let value = project;
        for (const key of path.slice(0, -1)) value = value[key] ??= {};
        if (target.value) value[path.at(-1)] = target.value;
        else delete value[path.at(-1)];
        changed();
      } else if (target.hasAttribute("data-media-upload")) {
        const project = getProject();
        for (const file of target.files) {
          if (getProject() !== project)
            throw new Error("Le projet a changé pendant l’import.");
          if (file.size > MAX_IMAGE_BYTES)
            throw new Error("Image trop volumineuse : maximum 2 Mo.");
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
            throw new Error("Formats acceptés : PNG, JPEG ou WebP.");
          const bitmap = await createImageBitmap(file);
          const width = bitmap.width,
            height = bitmap.height;
          bitmap.close();
          if (width > 4096 || height > 4096)
            throw new Error("Dimensions maximales : 4096 × 4096 pixels.");
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          if (getProject() !== project)
            throw new Error("Le projet a changé pendant l’import.");
          addProjectImage(project, {
            name: file.name,
            mimeType: file.type,
            size: file.size,
            width,
            height,
            dataUrl,
          });
          changed();
        }
        notify("Images ajoutées à la bibliothèque du projet.");
      }
    } catch (issue) {
      notify(issue.message || "Image illisible.", true);
    }
  });
}
