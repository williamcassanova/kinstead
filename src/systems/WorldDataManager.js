/**
 * WorldDataManager
 *
 * Memuat data peta dunia dari JSON dan menyimpannya di state internal.
 * Semua modul lain (ModeManager, StrategyUIManager) membaca data melalui
 * class ini agar sumber kebenaran data wilayah tetap satu.
 */
export class WorldDataManager {
  /**
   * @param {{ url?: string }} options
   */
  constructor({ url = "worlds/prototype-world.json" } = {}) {
    this.url = url;
    this.state = {
      loaded: false,
      loading: false,
      error: null,
      meta: {},
      regions: [],
    };
    this._loadPromise = null;
  }

  /**
   * Mengambil file JSON dunia lalu menyimpannya ke state.
   * Pemanggilan berulang akan memakai promise yang sama (tidak fetch ganda).
   *
   * @param {string} [url]
   * @returns {Promise<Array<object>>}
   */
  async fetch(url = this.url) {
    if (this.state.loaded) return this.getAllRegions();
    if (this._loadPromise) return this._loadPromise;

    this.state.loading = true;
    this.state.error = null;

    this._loadPromise = (async () => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Gagal memuat data dunia (${response.status} ${response.statusText})`);
      }

      const data = await response.json();
      this._applyData(data);
      this.state.loaded = true;
      this.state.loading = false;
      return this.getAllRegions();
    })().catch((error) => {
      this.state.loading = false;
      this.state.error = error;
      this._loadPromise = null;
      throw error;
    });

    return this._loadPromise;
  }

  /**
   * Menormalkan berbagai bentuk JSON (array langsung atau object dengan
   * key `wilayah`/`regions`) menjadi state wilayah yang konsisten.
   *
   * @param {object|Array<object>} data
   */
  _applyData(data) {
    const rawRegions = Array.isArray(data)
      ? data
      : data?.wilayah || data?.regions || data?.regions_list || [];

    if (!Array.isArray(rawRegions)) {
      throw new Error("Format data dunia tidak valid: wilayah harus berupa array");
    }

    this.state.meta = Array.isArray(data)
      ? {}
      : {
          id: data?.id ?? "world",
          nama: data?.nama ?? data?.name ?? "Dunia Kinstead",
          versi: data?.versi ?? 1,
        };

    this.state.regions = rawRegions.map((region, index) => ({
      id: String(region?.id ?? `wilayah_${index + 1}`),
      nama: String(region?.nama ?? region?.name ?? `Wilayah ${index + 1}`),
      pemilik: String(region?.pemilik ?? region?.owner ?? "Netral"),
      koordinat_x: toFiniteNumber(region?.koordinat_x ?? region?.x, 0),
      koordinat_z: toFiniteNumber(region?.koordinat_z ?? region?.z, 0),
      populasi: toFiniteNumber(region?.populasi ?? region?.population, 0),
      pajak_dasar: toFiniteNumber(region?.pajak_dasar ?? region?.tax, 0),
    }));
  }

  /**
   * Mengambil satu wilayah berdasarkan id.
   *
   * @param {string} id
   * @returns {object|null}
   */
  getRegionById(id) {
    if (id == null) return null;
    return this.state.regions.find((region) => region.id === String(id)) || null;
  }

  /**
   * Mengambil seluruh wilayah sebagai salinan array agar state tidak
   * termodifikasi dari luar tanpa sengaja.
   *
   * @returns {Array<object>}
   */
  getAllRegions() {
    return this.state.regions.map((region) => ({ ...region }));
  }

  /**
   * Metadata dunia (id, nama, versi) dari file JSON.
   *
   * @returns {object}
   */
  getMeta() {
    return { ...this.state.meta };
  }

  /**
   * @returns {boolean}
   */
  isLoaded() {
    return this.state.loaded;
  }
}

/**
 * Mengubah nilai apa pun menjadi angka finite, atau nilai cadangan.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
