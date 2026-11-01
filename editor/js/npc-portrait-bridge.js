import {
  createPortraitEditorState,
  parsePortraitEditorState,
} from "../../app/js/core/portrait-editor-state.js";

/** Le résultat appartient à la fiche ouverte et au projet d’origine. */
export function createNpcPortraitBridge({
  getProject,
  changed,
  notify,
  host = window,
}) {
  let session;
  host.addEventListener("message", (event) => {
    if (
      !session ||
      event.origin !== host.location.origin ||
      event.source !== session.popup
    )
      return;
    if (
      getProject() !== session.project ||
      !session.project.assets.npcs.includes(session.npc)
    )
      return;
    if (event.data?.type === "quest-npc-ready") {
      const state = session.npc.portraitEditor ?? createPortraitEditorState();
      session.popup.postMessage(
        {
          type: "quest-npc-load",
          state: { ...state, text: { ...state.text, name: session.npc.name } },
        },
        host.location.origin,
      );
    }
    if (event.data?.type === "quest-npc-save") {
      try {
        session.npc.portraitEditor = parsePortraitEditorState(event.data.state);
        changed();
        notify("Personnage enregistré dans le projet de quête.");
      } catch (error) {
        notify(error.message, true);
      }
    }
  });
  return {
    open(npc) {
      const popup = host.open(
        new URL("../../app/portrait-editor.html?questNpc=1", import.meta.url)
          .href,
        "_blank",
      );
      if (!popup)
        return notify(
          "Autorisez l’ouverture de l’éditeur dans un nouvel onglet.",
          true,
        );
      session = { popup, npc, project: getProject() };
    },
  };
}
