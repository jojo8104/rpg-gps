/** Affichage de la préparation, sans règle du moteur de jeu. */
export class GameLoadingView {
  constructor(root) {
    this.root = root;
    this.progress = root.querySelector("progress");
    this.status = root.querySelector("[role='status']");
    this.retry = root.querySelector("button");
    root.addEventListener("cancel", (event) => event.preventDefault());
  }

  show() {
    this.previousFocus = document.activeElement;
    if (!this.root.open) this.root.showModal();
    this.retry.hidden = true;
  }

  update(message, value = null) {
    this.status.textContent = message;
    if (value === null) this.progress.removeAttribute("value");
    else this.progress.value = value;
  }

  error(error, retry, { reload = false } = {}) {
    this.update(`Préparation interrompue : ${error.message}`, 0);
    this.retry.textContent = reload ? "Recharger le jeu" : "Réessayer";
    this.retry.onclick = retry;
    this.retry.hidden = false;
    this.retry.focus();
  }

  close() {
    this.root.close();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}

// Laisser le navigateur peindre l’étape avant le travail synchrone du moteur.
export function paintLoadingStep() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0)),
  );
}
