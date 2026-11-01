// Les refus réseau sont déjà signalés par le raccord serveur. Cette frontière
// évite qu'un événement DOM laisse une promesse rejetée sans traitement.
export function confirmedAction(action, report = () => {}) {
  return async (...args) => {
    try {
      return await action(...args);
    } catch (error) {
      report(`Action non confirmée : ${error.message}`);
      return null;
    }
  };
}
