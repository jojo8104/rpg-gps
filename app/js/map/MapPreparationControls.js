/** Recherche explicite de lieu, sans requêtes d'autocomplétion. */
export function createMapPreparationControls(
  map,
  {
    fetchImpl = globalThis.fetch,
    container = null,
    leadingControl = null,
  } = {},
) {
  let disposed = false,
    revision = 0;
  let root;
  const control = {
    addTo(targetMap) {
      this.remove();
      root = createForm();
      if (container) container.append(root);
      else targetMap.getContainer().before(root);
      return this;
    },
    remove() {
      revision++;
      root?.remove();
      root = null;
      return this;
    },
  };
  const createForm = () => {
    const root = L.DomUtil.create("div", "rpg-map-preparation");
    root.innerHTML =
      '<form><label>Choisir un lieu<input type="search" placeholder="Ville, adresse…" minlength="3" maxlength="200" required aria-label="Ville ou adresse"></label><button type="submit">Rechercher</button></form><div class="rpg-map-search-results"></div><p role="status" aria-live="polite"></p>';
    if (leadingControl) root.prepend(leadingControl);
    L.DomEvent.disableClickPropagation(root);
    L.DomEvent.disableScrollPropagation(root);
    const form = root.querySelector("form"),
      results = root.querySelector(".rpg-map-search-results"),
      status = root.querySelector("p");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const current = ++revision;
      results.replaceChildren();
      status.textContent = "Recherche…";
      try {
        const response = await fetchImpl(
          `/api/maps/search?q=${encodeURIComponent(form.querySelector("input").value.trim())}`,
        );
        const data = await response.json();
        if (disposed || current !== revision) return;
        if (!response.ok)
          throw new Error(data.error || "Recherche impossible.");
        status.textContent = data.length
          ? "Choisissez un résultat, puis tracez votre zone."
          : "Aucun résultat.";
        for (const item of data) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = item.label;
          button.addEventListener("click", () => {
            map.setView([item.latitude, item.longitude], 15);
            results.replaceChildren();
          });
          results.append(button);
        }
      } catch (error) {
        if (!disposed && current === revision)
          status.textContent = error.message;
      }
    });
    return root;
  };
  map.on("unload", () => {
    disposed = true;
    revision++;
    control.remove();
  });
  return control.addTo(map);
}
