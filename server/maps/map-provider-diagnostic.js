export function isMapProviderFailure(error) {
  return Boolean(
    error.providerCode ||
      error.providerStatus ||
      error.message === "fetch failed" ||
      ["TimeoutError", "AbortError"].includes(error.name),
  );
}

/** Diagnostic sans polygone, URL, corps du fournisseur ni identifiant de joueur. */
export function mapProviderDiagnostic(error, operation) {
  return {
    operation,
    name: error.name,
    code: error.cause?.code ?? null,
    causes: Array.from(
      error.cause?.errors ?? [],
      (cause) => cause.code ?? cause.name,
    ),
    ...(error.providerStatus ? { httpStatus: error.providerStatus } : {}),
    ...(error.provider ? { provider: error.provider } : {}),
  };
}

/** Même message dans le jeu et le Dashboard ; ne présente jamais le cache comme un succès réseau. */
export function mapErrorPayload(
  error,
  operationLabel = "Extraction de la zone OSM",
) {
  const timeout =
    ["TimeoutError", "AbortError"].includes(error.name) ||
    error.providerCode === "map_provider_timeout";
  const network = error.message === "fetch failed";
  const code =
    error.providerCode ??
    (timeout
      ? "map_provider_timeout"
      : network
        ? "map_provider_unreachable"
        : null);
  const cache =
    "Les données déjà en banque restent disponibles. Les surfaces manquantes ne sont pas encore téléchargées.";
  let message = timeout
    ? `${operationLabel} : le fournisseur n’a pas répondu à temps. ${cache}`
    : network
      ? `${operationLabel} : le serveur n’a pas pu joindre le fournisseur. ${cache}`
      : error.message;
  if (error.retryAfter && error.status !== 429)
    message += ` Nouvelle tentative dans ${error.retryAfter} secondes au minimum.`;
  return {
    error: message,
    ...(code ? { code } : {}),
    ...(error.providerStatus ? { providerStatus: error.providerStatus } : {}),
    ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
  };
}
