// File d'animations partagée par les récompenses de marche et de progression.
export function createProgressRewardView({ element, documentRef = document }) {
  const queue = [];
  let active = null;
  let epoch = 0;
  function next() {
    if (active || !queue.length) return;
    const { caption, title, className = "" } = queue.shift();
    const revision = epoch;
    const reward = documentRef.createElement("div");
    reward.className = `travel-reward ${className}`.trim();
    const captionElement = documentRef.createElement("span");
    captionElement.className = "travel-reward__distance";
    captionElement.textContent = caption;
    const titleElement = documentRef.createElement("strong");
    titleElement.className = "travel-reward__xp";
    titleElement.textContent = title;
    reward.append(captionElement, titleElement);
    active = reward;
    element.append(reward);
    reward.addEventListener(
      "animationend",
      () => {
        if (revision !== epoch || active !== reward) return;
        reward.remove();
        active = null;
        next();
      },
      { once: true },
    );
  }
  return {
    show(reward) {
      queue.push(reward);
      next();
    },
    reset() {
      epoch++;
      queue.length = 0;
      active?.remove();
      active = null;
    },
  };
}
