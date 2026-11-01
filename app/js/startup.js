// L'accueil anime sa progression visuelle et attend les ressources avant d'ouvrir le jeu.
const enter = document.querySelector("#enter-app");
const progress = document.querySelector("#startup-progress");
const resume = document.querySelector("#resume-app");
const loadGame = document.querySelector("#load-game-app");
const newGame = document.querySelector("#new-game-app");
const actions = document.querySelector(".presentation-screen__actions");
let application;
let busy = false;
let portraitsReady = false;
let modulesReady = false;

function animateProgress() {
  const startedAt = performance.now();
  let frame;
  const tick = (at) => {
    progress.value = Math.min(95, ((at - startedAt) / 12000) * 95);
    if (progress.value < 95) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

async function finishProgress() {
  const initial = progress.value;
  const startedAt = performance.now();
  await new Promise((resolve) => {
    const tick = (at) => {
      const fraction = Math.min(1, (at - startedAt) / 250);
      progress.value = initial + (100 - initial) * fraction;
      if (fraction < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function boot() {
  if (busy) return;
  busy = true;
  enter.disabled = true;
  actions.hidden = true;
  if (resume) resume.disabled = true;
  if (newGame) newGame.disabled = true;
  if (loadGame) loadGame.disabled = true;
  progress.hidden = false;
  progress.value = 0;
  const stopAnimation = animateProgress();
  try {
    const { gameAssets, PORTRAIT_IMAGES } = await import(
      "./asset-preloader.js"
    );
    // Les portraits se téléchargent pendant que le graphe de modules arrive.
    const results = await Promise.allSettled([
      (async () => {
        application ??= await import("./main.js");
        await application.initializeGameData();
        modulesReady = true;
      })(),
      (async () => {
        const failed = await gameAssets.load(PORTRAIT_IMAGES, {
          concurrency: 3,
        });
        if (failed.length) throw new Error("Portraits indisponibles.");
        portraitsReady = true;
      })(),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    stopAnimation();
    await finishProgress();
    progress.hidden = true;
    actions.hidden = false;
    enter.disabled = false;
    if (resume) resume.disabled = false;
    if (newGame) newGame.disabled = false;
    if (loadGame) loadGame.disabled = false;
  } catch {
    // Une erreur d'import peut rester mémorisée par le navigateur : un nouveau
    // document permet alors de retenter aussi le chargement des modules.
    setTimeout(() => {
      if (!application) location.reload();
      else void boot();
    }, 2000);
  } finally {
    stopAnimation();
    busy = false;
  }
}

void boot();
