/**
 * ModeManager
 *
 * State machine sederhana untuk dua mode permainan:
 * - EXPLORE  : dunia 3D aktif dan karakter bisa dikendalikan.
 * - STRATEGY : overlay peta 2D aktif dan render loop 3D dijeda.
 *
 * ModeManager tidak mengimpor Three.js secara langsung. Semua akses ke
 * game/camera/character dilakukan melalui object `game` yang diberikan,
 * sehingga sistem ini tetap mudah dipakai ulang.
 */
export const GAME_MODE = Object.freeze({
  EXPLORE: "EXPLORE",
  STRATEGY: "STRATEGY",
});

export class ModeManager {
  /**
   * @param {{
   *   game: object,
   *   worldDataManager: import("./WorldDataManager.js").WorldDataManager,
   *   strategyUI?: object
   * }} options
   */
  constructor({ game, worldDataManager, strategyUI = null } = {}) {
    this.game = game;
    this.worldDataManager = worldDataManager;
    this.strategyUI = strategyUI;

    this.state = GAME_MODE.EXPLORE;
    this._previousGameState = null;
    this._initialized = false;

    // Simpan referensi handler agar bisa dilepas saat dispose().
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /**
   * Menyambungkan overlay peta strategi setelah instance dibuat.
   *
   * @param {object} strategyUI
   */
  setStrategyUI(strategyUI) {
    this.strategyUI = strategyUI;
  }

  /**
   * Memasang listener keyboard global (tombol M).
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
    window.addEventListener("keydown", this._onKeyDown);
  }

  /**
   * Melepas listener keyboard. Berguna untuk hot-reload/cleanup.
   */
  dispose() {
    if (!this._initialized) return;
    this._initialized = false;
    window.removeEventListener("keydown", this._onKeyDown);
  }

  /**
   * @returns {boolean}
   */
  isStrategyMode() {
    return this.state === GAME_MODE.STRATEGY;
  }

  /**
   * Berpindah dari dunia 3D ke peta strategi 2D.
   * Render loop 3D dijeda lewat flag `game._renderPaused`.
   *
   * @returns {Promise<boolean>}
   */
  async switchToStrategy() {
    if (this.state === GAME_MODE.STRATEGY) return true;

    const game = this.game;
    if (!game) return false;

    if (!game.player) {
      this._toast("Masuk ke permainan terlebih dahulu untuk membuka peta strategi.");
      return false;
    }

    if (game.state !== "playing" && game.state !== "paused") {
      this._toast("Peta strategi hanya bisa dibuka saat menjelajahi dunia.");
      return false;
    }

    if (game.state === "playing" && game._modalOpen?.()) {
      this._toast("Tutup panel yang sedang terbuka sebelum membuka peta strategi.");
      return false;
    }

    this._previousGameState = game.state;
    this.state = GAME_MODE.STRATEGY;

    // Hentikan input dan bekukan update/render dunia 3D.
    game._clearInput?.();
    game.state = "strategy";
    game._renderPaused = true;
    game.ui?.setPaused?.(false);

    // Tampilkan overlay peta. show() akan menunggu data wilayah siap.
    try {
      await this.strategyUI?.show?.();
    } catch (error) {
      console.error("[Kinstead] Gagal membuka peta strategi:", error);
      this._toast("Peta strategi gagal dibuka.");
      this.switchToExplore();
      return false;
    }

    return true;
  }

  /**
   * Berpindah kembali ke dunia 3D.
   * Jika `region` diberikan, karakter langsung dipindahkan ke koordinat kota.
   *
   * @param {object|null} region
   * @returns {boolean}
   */
  switchToExplore(region = null) {
    const game = this.game;
    const wasStrategy = this.state === GAME_MODE.STRATEGY;

    this.state = GAME_MODE.EXPLORE;
    this.strategyUI?.hide?.();

    if (region) this._teleportTo(region);

    if (game) {
      game._renderPaused = false;
      game._clearInput?.();

      if (game.player) {
        game.state = "playing";
        game.ui?.setPaused?.(false);
      } else if (wasStrategy) {
        game.state = this._previousGameState === "paused" ? "paused" : "menu";
      }

      this._alignCameraBehindPlayer();
    }

    this._previousGameState = null;

    if (region?.nama) {
      this._toast(`Tiba di ${region.nama}.`);
    }

    return true;
  }

  /**
   * Memindahkan karakter ke wilayah kota lalu menyelaraskan kamera.
   * Mendukung method `setPosition(x, z)` (sesuai kontrak) dan fallback
   * ke `teleport(x, z, heading)` milik CharacterController proyek ini.
   *
   * @param {object} region
   * @returns {boolean}
   */
  _teleportTo(region) {
    const controller = this.game?.player?.controller;
    if (!controller) return false;

    const x = Number(region.koordinat_x ?? region.x ?? 0);
    const z = Number(region.koordinat_z ?? region.z ?? 0);
    const heading = Number(region.heading ?? controller.heading ?? Math.PI);

    let moved = false;

    if (typeof controller.setPosition === "function") {
      moved = controller.setPosition(x, z) !== false;
    }

    if (!moved && typeof controller.teleport === "function") {
      moved = controller.teleport(x, z, heading) !== false;
    }

    if (!moved) {
      // Fallback terakhir: pindahkan posisi secara manual.
      controller.position?.set(x, controller.position?.y ?? 0, z);
      controller.velocity?.set(0, 0, 0);
      if (controller.model) {
        controller.model.position.copy(controller.position);
        controller.model.rotation.y = heading;
      }
      moved = true;
    }

    if (moved) {
      controller.heading = heading;
      controller.targetHeading = heading;
      this.game.world?.regionWorld?.warmup?.(x, z, 2);
      this._alignCameraBehindPlayer(heading);
    }

    return moved;
  }

  /**
   * Menempatkan kamera tepat di belakang karakter.
   * CameraController memakai yaw = arah hadap + PI untuk berada di belakang.
   *
   * @param {number} [forcedHeading]
   */
  _alignCameraBehindPlayer(forcedHeading) {
    const controller = this.game?.player?.controller;
    const cameraController = this.game?.cameraController;

    if (!controller?.position || !cameraController) return;

    const heading = Number.isFinite(forcedHeading)
      ? forcedHeading
      : Number(controller.heading ?? Math.PI);

    cameraController.reset(heading + Math.PI, 0.34, 7.4);
    cameraController.snapTo(controller.position);
  }

  /**
   * Listener tombol M untuk toggle mode dan Escape untuk menutup peta.
   *
   * @param {KeyboardEvent} event
   */
  _onKeyDown(event) {
    if (isTyping(event.target)) return;

    if (event.code === "KeyM") {
      event.preventDefault();
      if (this.state === GAME_MODE.STRATEGY) {
        this.switchToExplore();
      } else {
        this.switchToStrategy();
      }
      return;
    }

    if (event.code === "Escape" && this.state === GAME_MODE.STRATEGY) {
      event.preventDefault();
      this.switchToExplore();
    }
  }

  /**
   * Menampilkan pesan singkat melalui UIManager game bila tersedia.
   *
   * @param {string} message
   */
  _toast(message) {
    this.game?.ui?.toast?.(message);
  }
}

/**
 * Mengabaikan shortcut saat pengguna sedang mengetik di form.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isTyping(target) {
  const tag = target?.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}
