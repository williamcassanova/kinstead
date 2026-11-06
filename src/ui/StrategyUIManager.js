/**
 * StrategyUIManager
 *
 * Merender overlay Peta Strategi 2D (HTML/CSS/SVG) dari data yang disimpan
 * oleh WorldDataManager. Setiap kota ditampilkan sebagai marker yang
 * diposisikan berdasarkan konversi koordinat_x/koordinat_z ke persentase.
 *
 * Klik marker akan memanggil ModeManager.switchToExplore(region) sehingga
 * karakter 3D langsung dipindahkan ke koordinat kota tersebut.
 */
const OVERLAY_ID = "world-strategy-overlay";
const STYLE_ID = "world-strategy-style";

export class StrategyUIManager {
  /**
   * @param {{
   *   worldDataManager: import("../systems/WorldDataManager.js").WorldDataManager,
   *   modeManager: import("../systems/ModeManager.js").ModeManager
   * }} options
   */
  constructor({ worldDataManager, modeManager } = {}) {
    this.worldDataManager = worldDataManager;
    this.modeManager = modeManager;

    this.overlay = null;
    this.mapStage = null;
    this.markersLayer = null;
    this.linesSvg = null;
    this.regionList = null;
    this.statusEl = null;
    this._mounted = false;
  }

  /**
   * Membuat overlay beserta style-nya sekali saja (idempotent).
   */
  mount() {
    if (this._mounted && this.overlay?.isConnected) return;

    injectStyles();

    if (!document.getElementById(OVERLAY_ID)) {
      const overlay = document.createElement("section");
      overlay.id = OVERLAY_ID;
      overlay.className = "ks-strategy-overlay ks-hidden";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `
        <div class="ks-strategy-shell">
          <header class="ks-strategy-head">
            <div>
              <p class="ks-strategy-kicker">PETA STRATEGI &middot; 1914</p>
              <h2>Kekuasaan Wilayah</h2>
              <p class="ks-strategy-sub">Pilih kota untuk berpindah dan menjelajahinya secara langsung.</p>
            </div>
            <button type="button" class="ks-strategy-close" data-ks-close aria-label="Tutup peta strategi">
              Tutup <span>M</span>
            </button>
          </header>
          <div class="ks-strategy-body">
            <div class="ks-strategy-map" data-ks-map>
              <div class="ks-map-grid" aria-hidden="true"></div>
              <svg class="ks-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
              <div class="ks-map-markers" data-ks-markers></div>
              <div class="ks-map-compass" aria-hidden="true">U</div>
              <p class="ks-map-status" data-ks-status>Memuat data wilayah...</p>
            </div>
            <aside class="ks-strategy-side">
              <div class="ks-side-head">
                <span>Wilayah Terdaftar</span>
                <strong data-ks-count>0</strong>
              </div>
              <div class="ks-region-list" data-ks-list></div>
              <p class="ks-side-hint">Klik marker atau kartu wilayah untuk teleport ke kota tersebut.</p>
            </aside>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    this.overlay = document.getElementById(OVERLAY_ID);
    this.mapStage = this.overlay.querySelector("[data-ks-map]");
    this.markersLayer = this.overlay.querySelector("[data-ks-markers]");
    this.linesSvg = this.overlay.querySelector(".ks-map-lines");
    this.regionList = this.overlay.querySelector("[data-ks-list]");
    this.statusEl = this.overlay.querySelector("[data-ks-status]");
    this.countEl = this.overlay.querySelector("[data-ks-count]");

    this.overlay
      .querySelector("[data-ks-close]")
      ?.addEventListener("click", () => this.modeManager?.switchToExplore?.());

    this._mounted = true;
  }

  /**
   * Menampilkan overlay. Data dimuat lebih dulu bila belum tersedia.
   *
   * @returns {Promise<boolean>}
   */
  async show() {
    this.mount();
    this.overlay.classList.remove("ks-hidden");
    this.overlay.setAttribute("aria-hidden", "false");
    this._renderStatus("Memuat data wilayah...");

    try {
      if (!this.worldDataManager?.isLoaded?.()) {
        await this.worldDataManager?.fetch?.();
      }
      this.render();
      return true;
    } catch (error) {
      this._renderError(error);
      return false;
    }
  }

  /**
   * Menyembunyikan overlay peta strategi.
   */
  hide() {
    if (!this.overlay) return;
    this.overlay.classList.add("ks-hidden");
    this.overlay.setAttribute("aria-hidden", "true");
  }

  /**
   * Merender ulang seluruh marker, garis rute, dan daftar wilayah.
   */
  render() {
    if (!this.overlay) return;

    const regions = this.worldDataManager?.getAllRegions?.() || [];
    this.markersLayer.replaceChildren();
    this.regionList.replaceChildren();
    this.linesSvg.replaceChildren();

    if (this.countEl) this.countEl.textContent = String(regions.length);

    if (!regions.length) {
      this._renderStatus("Belum ada data wilayah pada worlds/prototype-world.json.");
      return;
    }

    this.statusEl?.classList.add("ks-hidden");

    const positions = computeMapPositions(regions);
    this._renderRouteLines(regions, positions);

    for (const region of regions) {
      const position = positions.get(region.id);
      if (!position) continue;
      this._renderMarker(region, position);
      this._renderRegionCard(region, position);
    }
  }

  /**
   * Menggambar garis penghubung antar wilayah memakai SVG.
   *
   * @param {Array<object>} regions
   * @param {Map<string, {x: number, y: number}>} positions
   */
  _renderRouteLines(regions, positions) {
    const points = regions
      .map((region) => positions.get(region.id))
      .filter(Boolean)
      .map((position) => `${position.x.toFixed(2)},${position.y.toFixed(2)}`)
      .join(" ");

    if (!points) return;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", points);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "rgba(216, 180, 106, 0.35)");
    line.setAttribute("stroke-width", "0.55");
    line.setAttribute("stroke-dasharray", "2 1.6");
    line.setAttribute("stroke-linecap", "round");
    this.linesSvg.appendChild(line);
  }

  /**
   * Membuat satu marker kota dan memasang event klik.
   *
   * @param {object} region
   * @param {{x: number, y: number}} position
   */
  _renderMarker(region, position) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "ks-city-marker";
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.dataset.regionId = region.id;
    marker.setAttribute(
      "aria-label",
      `${region.nama}, milik ${region.pemilik}, populasi ${formatNumber(region.populasi)}`
    );

    const badge = document.createElement("span");
    badge.className = "ks-city-badge";
    badge.textContent = firstLetter(region.nama);

    const label = document.createElement("span");
    label.className = "ks-city-label";

    const name = document.createElement("strong");
    name.textContent = region.nama;

    const meta = document.createElement("small");
    meta.textContent = `${region.pemilik} · ${formatNumber(region.populasi)} jiwa`;

    label.append(name, meta);
    marker.append(badge, label);

    marker.addEventListener("click", () => this._travelTo(region));
    this.markersLayer.appendChild(marker);
  }

  /**
   * Membuat kartu wilayah pada panel samping.
   *
   * @param {object} region
   * @param {{x: number, y: number}} position
   */
  _renderRegionCard(region, position) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ks-region-card";
    card.dataset.regionId = region.id;

    const top = document.createElement("span");
    top.className = "ks-region-card-top";

    const name = document.createElement("strong");
    name.textContent = region.nama;

    const owner = document.createElement("span");
    owner.className = "ks-region-owner";
    owner.textContent = region.pemilik;

    top.append(name, owner);

    const stats = document.createElement("span");
    stats.className = "ks-region-stats";
    stats.textContent =
      `Populasi ${formatNumber(region.populasi)} · Pajak ${formatNumber(region.pajak_dasar)}`;

    const coords = document.createElement("span");
    coords.className = "ks-region-coords";
    coords.textContent =
      `X ${formatNumber(region.koordinat_x)} · Z ${formatNumber(region.koordinat_z)} ` +
      `· Peta ${position.x.toFixed(0)}%, ${position.y.toFixed(0)}%`;

    card.append(top, stats, coords);
    card.addEventListener("click", () => this._travelTo(region));
    this.regionList.appendChild(card);
  }

  /**
   * Menutup peta dan meminta ModeManager memindahkan karakter.
   *
   * @param {object} region
   */
  _travelTo(region) {
    this.modeManager?.switchToExplore?.(region);
  }

  /**
   * Menampilkan pesan status di atas peta.
   *
   * @param {string} message
   */
  _renderStatus(message) {
    if (!this.statusEl) return;
    this.statusEl.classList.remove("ks-hidden");
    this.statusEl.textContent = message;
  }

  /**
   * Menampilkan pesan error pemuatan data.
   *
   * @param {Error} error
   */
  _renderError(error) {
    const message = `Gagal memuat peta: ${error?.message || error}`;
    this.markersLayer?.replaceChildren();
    this.regionList?.replaceChildren();
    this.linesSvg?.replaceChildren();
    this._renderStatus(message);
    console.error("[Kinstead] StrategyUIManager:", error);
  }
}

/**
 * Menghitung posisi persentase setiap wilayah di dalam peta.
 * Sumbu Z dibalik agar koordinat +Z tampil di bagian atas peta.
 *
 * @param {Array<object>} regions
 * @returns {Map<string, {x: number, y: number}>}
 */
function computeMapPositions(regions) {
  const xs = regions.map((region) => Number(region.koordinat_x) || 0);
  const zs = regions.map((region) => Number(region.koordinat_z) || 0);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const padding = 12;
  const usable = 100 - padding * 2;

  const positions = new Map();

  for (const region of regions) {
    const x = Number(region.koordinat_x) || 0;
    const z = Number(region.koordinat_z) || 0;

    positions.set(region.id, {
      x: padding + ((x - minX) / spanX) * usable,
      y: padding + ((maxZ - z) / spanZ) * usable,
    });
  }

  return positions;
}

/**
 * Menyuntikkan CSS overlay sekali saja agar modul ini mandiri.
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ks-strategy-overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background:
        radial-gradient(120% 90% at 50% 0%, rgba(26, 45, 34, 0.42), transparent 60%),
        rgba(4, 10, 7, 0.82);
      backdrop-filter: blur(10px);
    }

    .ks-strategy-overlay.ks-hidden {
      display: none !important;
    }

    .ks-strategy-shell {
      width: min(1120px, 100%);
      height: min(780px, 100%);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--line, rgba(236, 226, 200, 0.16));
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(19, 34, 26, 0.98), rgba(8, 17, 12, 0.98));
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
      color: var(--cream, #f2e8d4);
    }

    .ks-strategy-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--line-soft, rgba(236, 226, 200, 0.08));
    }

    .ks-strategy-kicker {
      margin: 0 0 4px;
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--gold, #d8b46a);
    }

    .ks-strategy-head h2 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(22px, 2.6vw, 32px);
      font-weight: 400;
      letter-spacing: 0.02em;
    }

    .ks-strategy-sub {
      margin: 6px 0 0;
      color: var(--muted, #a6b7a5);
      font-size: 12px;
    }

    .ks-strategy-close {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border: 1px solid var(--line, rgba(236, 226, 200, 0.16));
      border-radius: 999px;
      color: var(--cream, #f2e8d4);
      background: rgba(255, 255, 255, 0.03);
      font-size: 12px;
    }

    .ks-strategy-close span {
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: rgba(216, 180, 106, 0.16);
      color: var(--gold, #d8b46a);
      font-size: 10px;
      font-weight: 700;
    }

    .ks-strategy-body {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(250px, 310px);
      gap: 16px;
      padding: 16px;
    }

    .ks-strategy-map {
      position: relative;
      min-height: 320px;
      overflow: hidden;
      border: 1px solid var(--line, rgba(236, 226, 200, 0.16));
      border-radius: 16px;
      background:
        radial-gradient(80% 80% at 50% 45%, rgba(42, 67, 48, 0.42), transparent 70%),
        #08120d;
      touch-action: manipulation;
    }

    .ks-map-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(236, 226, 200, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(236, 226, 200, 0.055) 1px, transparent 1px);
      background-size: 10% 10%;
      mask-image: radial-gradient(circle at 50% 50%, black 45%, transparent 100%);
    }

    .ks-map-lines {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .ks-map-markers {
      position: absolute;
      inset: 0;
    }

    .ks-city-marker {
      position: absolute;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0;
      transform: translate(-50%, -50%);
      color: var(--cream, #f2e8d4);
      text-align: left;
      white-space: nowrap;
    }

    .ks-city-badge {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border: 1px solid rgba(216, 180, 106, 0.7);
      border-radius: 50%;
      background: linear-gradient(180deg, #2b4a36, #14271c);
      color: var(--gold-strong, #f1d494);
      box-shadow: 0 0 0 4px rgba(216, 180, 106, 0.08), 0 10px 20px rgba(0, 0, 0, 0.35);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 13px;
      transition: transform 0.16s ease, box-shadow 0.16s ease;
    }

    .ks-city-label {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 5px 8px;
      border: 1px solid var(--line-soft, rgba(236, 226, 200, 0.08));
      border-radius: 8px;
      background: rgba(5, 12, 8, 0.78);
      backdrop-filter: blur(4px);
    }

    .ks-city-label strong {
      font-size: 12px;
      font-weight: 600;
    }

    .ks-city-label small {
      color: var(--muted, #a6b7a5);
      font-size: 9px;
    }

    .ks-city-marker:hover .ks-city-badge,
    .ks-city-marker:focus-visible .ks-city-badge {
      transform: scale(1.12);
      box-shadow: 0 0 0 8px rgba(216, 180, 106, 0.14), 0 12px 24px rgba(0, 0, 0, 0.4);
    }

    .ks-map-compass {
      position: absolute;
      top: 14px;
      right: 14px;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--line, rgba(236, 226, 200, 0.16));
      border-radius: 50%;
      color: var(--gold, #d8b46a);
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12px;
      opacity: 0.8;
    }

    .ks-map-status {
      position: absolute;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      max-width: 90%;
      margin: 0;
      padding: 8px 12px;
      border: 1px solid var(--line-soft, rgba(236, 226, 200, 0.08));
      border-radius: 8px;
      background: rgba(5, 12, 8, 0.8);
      color: var(--muted, #a6b7a5);
      font-size: 11px;
      text-align: center;
    }

    .ks-map-status.ks-hidden {
      display: none;
    }

    .ks-strategy-side {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .ks-side-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 2px 4px;
      color: var(--muted, #a6b7a5);
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .ks-side-head strong {
      color: var(--gold, #d8b46a);
      font-size: 12px;
    }

    .ks-region-list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 2px;
    }

    .ks-region-card {
      display: flex;
      flex-direction: column;
      gap: 5px;
      width: 100%;
      padding: 11px 12px;
      border: 1px solid var(--line-soft, rgba(236, 226, 200, 0.08));
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.025);
      color: var(--cream, #f2e8d4);
      text-align: left;
      transition: border-color 0.16s ease, background 0.16s ease;
    }

    .ks-region-card:hover,
    .ks-region-card:focus-visible {
      border-color: rgba(216, 180, 106, 0.5);
      background: rgba(216, 180, 106, 0.07);
    }

    .ks-region-card-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }

    .ks-region-card-top strong {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px;
      font-weight: 400;
    }

    .ks-region-owner {
      color: var(--gold, #d8b46a);
      font-size: 10px;
      white-space: nowrap;
    }

    .ks-region-stats,
    .ks-region-coords {
      color: var(--muted, #a6b7a5);
      font-size: 10px;
      line-height: 1.4;
    }

    .ks-region-coords {
      opacity: 0.72;
    }

    .ks-side-hint {
      margin: 0;
      padding: 0 2px;
      color: var(--muted, #a6b7a5);
      font-size: 10px;
      line-height: 1.5;
    }

    @media (max-width: 760px) {
      .ks-strategy-overlay {
        padding: 10px;
      }

      .ks-strategy-shell {
        height: 100%;
        border-radius: 16px;
      }

      .ks-strategy-head {
        padding: 14px 16px 12px;
      }

      .ks-strategy-sub {
        display: none;
      }

      .ks-strategy-body {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(260px, 1fr) auto;
        gap: 10px;
        padding: 10px;
      }

      .ks-strategy-side {
        max-height: 190px;
      }

      .ks-city-label small {
        display: none;
      }

      .ks-region-card:nth-child(n + 4) {
        display: none;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Mengambil huruf pertama dari nama wilayah untuk badge marker.
 *
 * @param {string} value
 * @returns {string}
 */
function firstLetter(value) {
  return String(value || "?").trim().charAt(0).toUpperCase() || "?";
}

/**
 * Format angka dengan pemisah ribuan lokal Indonesia.
 *
 * @param {unknown} value
 * @returns {string}
 */
function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("id-ID").format(number);
}
