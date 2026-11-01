/** Envoie une définition ; seule l’API serveur valide et écrit les fichiers. */
export function bindServerInstallation(
  button,
  { getProject, validate, notify },
) {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const report = await validate();
      if (!report?.valid) return;
      const response = await fetch("/api/editor/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getProject()),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || !result.installed)
        throw new Error(
          result.error ??
            result.errors?.map((entry) => entry.message).join(" ; ") ??
            "Installation refusée.",
        );
      notify(
        `${result.questIds.length} quête(s) enregistrée(s). Redémarrez le serveur puis créez une nouvelle partie.`,
      );
      button.title = `Dernier enregistrement : ${result.packageDirectory}. Redémarrage serveur requis.`;
    } catch (issue) {
      notify(issue.message, true);
    } finally {
      button.disabled = false;
    }
  });
}
