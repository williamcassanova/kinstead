// import { Game } from "./game/Game.js";
import { WorldDataManager } from "./systems/WorldDataManager.js";
import { ModeManager } from "./systems/ModeManager.js";
import { StrategyUIManager } from "./ui/StrategyUIManager.js";

/**
 * Entry point game Kinstead.
 *
 * Urutan inisialisasi sengaja dibuat seperti ini:
 * 1. Game dibuat lebih dulu agar renderer, scene, dan karakter tersedia.
 * 2. WorldDataManager mulai mengambil JSON peta secara paralel.
 * 3. StrategyUIManager dipasang (overlay masih tersembunyi).
 * 4. Game.start() menyelesaikan loading dunia 3D.
 * 5. ModeManager baru mengaktifkan listener tombol M setelah game siap.
 */
async function boot() {
  try {
    const { Game } = await import("./game/Game.js");
  const canvas = document.getElementById("game-canvas");
  if (!canvas) {
    throw new Error("Canvas #game-canvas tidak ditemukan.");
  }

  const game = new Game(canvas);
  window.kinsteadGame = game;

  const worldDataManager = new WorldDataManager({
    url: "worlds/prototype-world.json",
  });

  const modeManager = new ModeManager({ game, worldDataManager });
  const strategyUIManager = new StrategyUIManager({
    worldDataManager,
    modeManager,
  });

  modeManager.setStrategyUI(strategyUIManager);
  strategyUIManager.mount();

  // Simpan referensi agar bisa diakses dari console/debug atau sistem lain.
  game.modeManager = modeManager;
  game.worldDataManager = worldDataManager;
  game.strategyUIManager = strategyUIManager;

  // Mulai fetch lebih awal supaya peta siap saat pemain menekan M.
  // Error ditangkap di sini agar tidak menjadi unhandled rejection.
  const dataReady = worldDataManager
    .fetch()
    .then(() => null)
    .catch((error) => error);

  game.start().catch(err => console.error("3D load error:", err));
  document.getElementById("loading-screen")?.classList.add("hidden");
  document.getElementById("menu-screen")?.classList.remove("hidden");

  // Listener M/Escape baru aktif setelah dunia 3D selesai dimuat.
  modeManager.init();

  const dataError = await dataReady;
  if (dataError) {
    console.warn("[Kinstead] Gagal memuat data peta strategi:", dataError);
    game.ui?.toast?.("Data peta strategi gagal dimuat.");
  }
  } catch (e) {
    console.error("BOOT ERROR:", e);
    document.getElementById("loading-label").textContent = "ERROR: " + e.message;
  }
}

boot().catch((error) => {
  console.error("[Kinstead] startup failed", error);
  const label = document.getElementById("loading-label");
  const tip = document.getElementById("loading-tip");
  if (label) label.textContent = "Gagal memuat Kinstead";
  if (tip) {
    tip.textContent =
      "Jalankan folder ini lewat HTTP server (mis. python3 -m http.server) lalu muat ulang. " +
      String(error?.message || error);
  }
});
