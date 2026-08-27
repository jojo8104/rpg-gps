export function createDebugPauseControl({ element = document.body, onResume = () => {} } = {}) {
  let paused = false;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "debug-pause-control";

  const updateButton = () => {
    button.classList.toggle("is-paused", paused);
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Reprendre les mises à jour de l’interface" : "Suspendre les mises à jour de l’interface");
    button.title = paused ? "Reprendre les mises à jour de l’interface" : "Suspendre les mises à jour de l’interface";
    button.innerHTML = paused ? '<span aria-hidden="true">▶</span><small>UI figée</small>' : '<span aria-hidden="true">Ⅱ</span><small>Pause UI</small>';
  };

  button.addEventListener("click", () => {
    paused = !paused;
    document.documentElement.classList.toggle("is-ui-debug-paused", paused);
    updateButton();
    if (!paused) onResume();
  });

  updateButton();
  element.append(button);

  return {
    get isPaused() { return paused; },
    element: button,
  };
}
