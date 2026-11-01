import { MapView } from "../ui/map-view.js";

// Possède la vue Leaflet et la navigation de la carte, sans règles de jeu.
export function createMapController({
  element,
  getSession,
  isPaused,
  onFollowState,
  onDeferredRender,
  createView = (options) => new MapView(options),
  schedule = (callback) => setTimeout(callback, 0),
}) {
  let view = null,
    followMode = "free",
    revision = 0;
  const layers = {
    fogVisible: true,
    heatmapVisible: true,
    traceVisibility: new Set(["blue", "green", "red", "gray"]),
  };
  function updateFollow() {
    const { mode } = getSession();
    const states = {
      free: { icon: "◎", label: "Recentrer sur le joueur" },
      centered: {
        icon: "◉",
        label: "Suivre le héros de dos",
      },
      bearing: { icon: "➤", label: "Arrêter la rotation automatique" },
    };
    onFollowState({ ...states[followMode], mode: followMode });
  }
  function reset() {
    revision++;
    view?.map.remove();
    view = null;
    followMode = "free";
  }
  function initialize(options) {
    reset();
    const current = revision;
    view = createView({
      element,
      ...options,
      onAstralTarget: async (target) => {
        const { game, hero, playerId } = getSession();
        try {
          const result = await game.selectHeroAstralTarget({
            playerId,
            heroId: hero.id,
            kind: target.kind,
            targetId:
              target.targetId ??
              game.heroes.find((item) => item.playerId === target.playerId)?.id,
          });
          if (current !== revision || !result?.success) return;
          if (target.kind === "location")
            options.onLocationSelect(target.targetId);
          else if (target.kind === "group")
            options.onAutonomousGroupSelect(target.targetId);
          else options.onPlayerSelect(result.playerId);
        } catch (error) {
          console.warn("Cible astrale non confirmée", error);
        }
      },
    });
    followMode = "free";
    view.map.on("dragstart camerainteraction", () => {
      if (current === revision) {
        view.setBearingEnabled(false);
        followMode = "free";
        updateFollow();
      }
    });
    updateFollow();
    return view;
  }
  function recenter() {
    if (!view) return;
    if (followMode === "free") {
      view.setBearingEnabled(false);
      followMode = "centered";
    } else if (followMode === "centered") {
      view.setBearingEnabled(true);
      followMode = view.bearingEnabled ? "bearing" : "centered";
    } else {
      view.setBearingEnabled(false);
      followMode = "centered";
    }
    view.focus(getSession().position, view.map.getZoom?.());
    updateFollow();
  }
  function invalidateSize() {
    const current = revision;
    schedule(() => {
      if (current === revision) view?.map.invalidateSize();
    });
  }
  return {
    layers,
    initialize,
    reset,
    recenter,
    invalidateSize,
    updateFollow,
    get view() {
      return view;
    },
    get followMode() {
      return followMode;
    },
    follow(position) {
      if (followMode !== "free" && !isPaused() && !getSession().setupActive)
        view?.follow(position);
    },
    displayPosition(position, accuracy, heading) {
      if (isPaused()) {
        onDeferredRender();
        return;
      }
      view?.setHeroPosition(position, accuracy, heading);
      if (followMode !== "free" && !getSession().setupActive)
        view?.follow(position);
    },
    setHeading(heading) {
      if (isPaused()) onDeferredRender();
      else view?.setHeroHeading(heading);
    },
    render(model, allies) {
      if (isPaused()) {
        onDeferredRender();
        return;
      }
      view?.render(model);
      view?.setAlliedHeroes(allies);
    },
  };
}
