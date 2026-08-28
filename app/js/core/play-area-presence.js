/** Produit uniquement les transitions d'entrée/sortie d'une PlayArea. */
export class PlayAreaPresence {
  constructor(playArea = null, { confirmations = 1 } = {}) {
    if (!Number.isInteger(confirmations) || confirmations < 1)
      throw new RangeError("Le nombre de confirmations doit être positif.");
    this.confirmations = confirmations;
    this.setPlayArea(playArea);
  }

  setPlayArea(playArea, position = null) {
    this.playArea = playArea;
    this.inside = playArea && position ? playArea.contains(position) : null;
    this.pendingInside = null;
    this.pendingCount = 0;
    return this.inside;
  }

  update(position) {
    if (!this.playArea) return null;
    const inside = this.playArea.contains(position);
    if (this.inside === null) {
      this.inside = inside;
      return null;
    }
    if (inside === this.inside) {
      this.pendingInside = null;
      this.pendingCount = 0;
      return null;
    }
    if (this.pendingInside !== inside) {
      this.pendingInside = inside;
      this.pendingCount = 0;
    }
    this.pendingCount += 1;
    if (this.pendingCount < this.confirmations) return null;
    this.inside = inside;
    this.pendingInside = null;
    this.pendingCount = 0;
    return { type: inside ? "PlayAreaEntered" : "PlayAreaExited", inside };
  }
}
