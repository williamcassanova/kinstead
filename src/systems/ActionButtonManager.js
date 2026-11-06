export class ActionButtonManager {
  constructor(game) {
    this.game = game;
    this.btn = document.getElementById("btn-interact");
    this.currentText = "";
    
    // Jalankan pengecekan tiap 0.2 detik (biar nggak berat)
    setInterval(() => this.updateButton(), 200);
  }

  updateButton() {
    if (!this.btn) return;
    const player = this.game.player;
    if (!player) return;

    const tool = this.game.equipmentManager?.getCurrentTool();
    const px = player.position.x;
    const pz = player.position.z;
    let isNearTree = false;

    if (tool && this.game.resourceManager && this.game.resourceManager.resources) {
      for (let r of this.game.resourceManager.resources) {
        if (!r || r.chopped) continue;
        const rx = r.position?.x || r.mesh?.position?.x || 0;
        const rz = r.position?.z || r.mesh?.position?.z || 0;
        const dist = Math.sqrt((rx - px) ** 2 + (rz - pz) ** 2);
        if (dist < 4.0) {
          isNearTree = true;
          break;
        }
      }
    }

    // Ganti teks tombol & warna
    const newText = isNearTree ? "TEBANG" : "AKSI";
    if (this.currentText !== newText) {
      this.currentText = newText;
      this.btn.innerText = newText;
      this.btn.style.background = isNearTree ? "#4CAF50" : "";
    }
  }
}
