export function bindInspectorResize({
  element,
  workspace,
  onResize = () => {},
}) {
  const handle = document.createElement("div");
  handle.className = "inspector-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Largeur du panneau de propriétés");
  element.prepend(handle);
  handle.setAttribute("aria-valuemin", "300");
  handle.setAttribute("aria-valuemax", "800");
  handle.setAttribute(
    "aria-valuenow",
    String(Math.round(element.getBoundingClientRect().width)),
  );
  let origin = null;
  const set = (width) => {
    const max = Math.max(300, Math.min(800, innerWidth - 570));
    width = Math.max(300, Math.min(max, width));
    workspace.style.setProperty("--inspector-width", `${width}px`);
    handle.setAttribute("aria-valuenow", String(Math.round(width)));
    onResize();
  };
  handle.addEventListener("pointerdown", (event) => {
    origin = { x: event.clientX, width: element.getBoundingClientRect().width };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (origin) set(origin.width + origin.x - event.clientX);
  });
  handle.addEventListener("pointerup", () => {
    origin = null;
  });
  handle.addEventListener("pointercancel", () => {
    origin = null;
  });
  handle.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
      event.preventDefault();
      set(
        event.key === "Home"
          ? 330
          : element.getBoundingClientRect().width +
              (event.key === "ArrowLeft" ? 30 : -30),
      );
    }
  });
}
