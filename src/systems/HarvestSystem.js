export class HarvestSystem {
  constructor(game) {
    this.game = game;
  }

  getNearestTree() {
    const player = this.game.player;
    if (!player) return null;
    
    const px = player.position.x;
    const pz = player.position.z;
    let target = null;
    let minDist = 4.0; // Jarak jangkauan

    const resManager = this.game.resourceManager;
    if (resManager && resManager.resources) {
      for (let r of resManager.resources) {
        if (!r || r.chopped) continue;
        const rx = r.position?.x || r.mesh?.position?.x || 0;
        const rz = r.position?.z || r.mesh?.position?.z || 0;
        const dist = Math.sqrt((rx - px) ** 2 + (rz - pz) ** 2);
        
        if (dist < minDist) {
          minDist = dist;
          target = r;
        }
      }
    }
    return target;
  }
  interact() {
    const player = this.game.player;
    const tool = this.game.equipmentManager?.getCurrentTool();
    const ui = this.game.ui;

    if (!player) return;

    if (!tool) {
      if (ui && ui.toast) ui.toast("Pegang Kapak/Beliung dulu!");
      return;
    }

    const px = player.position.x;
    const pz = player.position.z;
    let target = null;
    let minDist = 5.0;

    // Cari pohon di ResourceManager
    const resManager = this.game.resourceManager;
    if (resManager && resManager.resources) {
      for (let r of resManager.resources) {
        if (!r || r.chopped) continue;
        const rx = r.position?.x || r.mesh?.position?.x || 0;
        const rz = r.position?.z || r.mesh?.position?.z || 0;
        const dist = Math.sqrt((rx - px) ** 2 + (rz - pz) ** 2);
        
        if (dist < minDist) {
          minDist = dist;
          target = r;
        }
      }
    }

    if (target) {
      const result = target.hit(tool);
      if (result && result.success) {
        if (ui && ui.toast) ui.toast("Berhasil menebang!");
        if (result.drop && this.game.inventoryManager) {
          this.game.inventoryManager.addItem(result.drop.itemId, result.drop.amount);
        }
      } else {
        if (ui && ui.toast) ui.toast("Alat salah atau resource habis.");
      }
    } else {
      if (ui && ui.toast) ui.toast("Nggak ada pohon di deket lu.");
    }
  }
}
