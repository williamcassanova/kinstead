const SETTINGS_KEY = "kinstead.settings.v2";

const DEFAULT_SETTINGS = {
  quality: "high",
  sensitivity: 1,
  invertY: false,
  showFps: true,
  character: null,
};

export class UIManager {
  constructor() {
    this.callbacks = {};
    this.settings = loadSettings();
    this.characters = [];
    this.selectedId = this.settings.character;
    this.joystick = { x: 0, y: 0 };
    this.runHeld = false;
    this.atlasEntries = [];
    this.atlasFilter = "all";
    this.fpsVisible = this.settings.showFps;
    this._toastTimer = 0;

    this.el = {};
    const ids = [
      "loading-screen",
      "loading-bar",
      "loading-label",
      "loading-tip",
      "menu-screen",
      "menu-play",
      "menu-character-grid",
      "menu-character-name",
      "menu-character-role",
      "menu-atlas",
      "menu-settings",
      "menu-help",
      "menu-status",
      "hud",
      "hud-fps",
      "hud-character",
      "hud-time",
      "hud-region",
      "hud-money",
      "hud-tool",
      "btn-pause",
      "btn-characters",
      "btn-questlog",
      "btn-inventory",
      "btn-settings",
      "btn-help",
      "btn-atlas",
      "pause-screen",
      "pause-resume",
      "pause-characters",
      "pause-settings",
      "pause-help",
      "pause-atlas",
      "pause-menu",
      "settings-modal",
      "settings-close",
      "settings-quality",
      "settings-sensitivity",
      "settings-invert",
      "settings-fps",
      "settings-reset",
      "help-modal",
      "help-close",
      "atlas-screen",
      "atlas-close",
      "atlas-grid",
      "atlas-filters",
      "atlas-subtitle",
      "mobile-controls",
      "joystick",
      "joystick-knob",
      "btn-run",
      "btn-jump",
      "btn-interact",
      "btn-attack",
      "toast",
      "interaction-prompt",
      "interaction-text",
      "quest-notification",
      "quest-notification-title",
      "quest-notification-desc",
      "dialog-screen",
      "dialog-close",
      "dialog-npc-avatar",
      "dialog-npc-name",
      "dialog-npc-title",
      "dialog-text",
      "dialog-choices",
      "questlog-screen",
      "questlog-close",
      "questlog-content",
      "inventory-screen",
      "inventory-close",
      "inventory-grid",
      "inventory-detail",
      "inventory-detail-icon",
      "inventory-detail-name",
      "inventory-detail-category",
      "inventory-detail-desc",
      "inventory-use",
      "inventory-drop",
      "shop-screen",
      "shop-close",
      "shop-title",
      "shop-subtitle",
      "shop-balance",
      "shop-content",
      "strategy-screen",
      "strategy-close",
      "strategy-map-canvas",
      "strategy-selected-title",
      "strategy-selected-desc",
      "strategy-details",
      "strategy-stat-coord",
      "strategy-stat-radius",
      "strategy-stat-pool",
      "btn-visit-village",
      "btn-strategy-map",
      "transition-overlay",
      "transition-text",
    ];
    for (const id of ids) this.el[camel(id)] = document.getElementById(id);

    this._applySettingsToForm();
    this._bind();
    this._detectTouch();
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  showQuestNotification(title, desc) {
    if (!this.el.questNotification || !this.el.questNotificationTitle || !this.el.questNotificationDesc) return;
    this.el.questNotificationTitle.textContent = title;
    this.el.questNotificationDesc.textContent = desc || "";
    this.el.questNotification.classList.remove("hidden");
    setTimeout(() => {
      this.el.questNotification?.classList.add("hidden");
    }, 3200);
  }

  showDialogue({ npc, text, choices }) {
    if (!this.el.dialogScreen) return;
    if (this.el.dialogNpcAvatar) this.el.dialogNpcAvatar.textContent = npc.name?.[0] || "K";
    if (this.el.dialogNpcName) this.el.dialogNpcName.textContent = npc.name || "Penduduk";
    if (this.el.dialogNpcTitle) this.el.dialogNpcTitle.textContent = npc.title || roleLabel(npc.role) || "";
    if (this.el.dialogText) this.el.dialogText.textContent = text || "";
    
    const choicesEl = this.el.dialogChoices;
    if (choicesEl) {
      choicesEl.innerHTML = "";
      for (const choice of choices || []) {
        const btn = document.createElement("button");
        btn.className = "dialog-choice" + (choice.text.includes("[Misi]") || choice.text.includes("[Selesai]") ? " quest" : "");
        btn.textContent = choice.text;
        btn.addEventListener("click", () => {
          this.callbacks.dialogueChoice?.(choice.id);
        });
        choicesEl.appendChild(btn);
      }
    }
    
    this.el.dialogScreen.classList.remove("hidden");
  }

  hideDialogue() {
    this.el.dialogScreen?.classList.add("hidden");
  }

  showQuestLog() {
    if (!this.el.questlogScreen) return;
    this.el.questlogScreen.classList.remove("hidden");
    this._renderQuestLog("active");
  }

  hideQuestLog() {
    this.el.questlogScreen?.classList.add("hidden");
  }

  showInventory() {
    if (!this.el.inventoryScreen) return;
    this.el.inventoryScreen.classList.remove("hidden");
    this.selectedInventorySlot = -1;
    if (this.el.inventoryDetail) this.el.inventoryDetail.classList.add("hidden");
    this._renderInventory("all");
  }

  hideInventory() {
    this.el.inventoryScreen?.classList.add("hidden");
    this.selectedInventorySlot = -1;
    if (this.el.inventoryDetail) this.el.inventoryDetail.classList.add("hidden");
  }

  _renderInventory(filter) {
    const grid = this.el.inventoryGrid;
    if (!grid) return;
    grid.innerHTML = "";
    
    const slots = this.callbacks.getInventory?.() || Array(24).fill(null);
    const filtered = slots.map((slot, idx) => ({ slot, idx })).filter(item => {
      if (filter === "all") return true;
      if (!item.slot) return false;
      return item.slot.category === filter;
    });
    
    // Show all slots but style empty ones
    for (let i = 0; i < slots.length; i++) {
      const slotData = slots[i];
      const btn = document.createElement("button");
      btn.className = "inventory-slot" + (!slotData ? " empty" : "") + (slotData?.questItem ? " quest" : "");
      if (this.selectedInventorySlot === i) btn.classList.add("selected");
      
      if (slotData) {
        const icon = document.createElement("span");
        icon.className = "inventory-slot-icon";
        icon.textContent = slotData.icon || "📦";
        btn.appendChild(icon);
        
        const name = document.createElement("span");
        name.className = "inventory-slot-name";
        name.textContent = slotData.name || "";
        btn.appendChild(name);
        
        if (slotData.count > 1) {
          const count = document.createElement("span");
          count.className = "inventory-slot-count";
          count.textContent = slotData.count;
          btn.appendChild(count);
        }
      }
      
      btn.addEventListener("click", () => {
        this.selectedInventorySlot = i;
        this._renderInventory(this.currentInventoryFilter || "all");
        this._showInventoryDetail(i);
      });
      
      grid.appendChild(btn);
    }
  }

  _showInventoryDetail(slotIndex) {
    const detail = this.el.inventoryDetail;
    if (!detail) return;
    const slots = this.callbacks.getInventory?.() || [];
    const slotData = slots[slotIndex];
    
    if (!slotData) {
      detail.classList.add("hidden");
      return;
    }
    
    detail.classList.remove("hidden");
    if (this.el.inventoryDetailIcon) this.el.inventoryDetailIcon.textContent = slotData.icon || "📦";
    if (this.el.inventoryDetailName) this.el.inventoryDetailName.textContent = slotData.name || "";
    if (this.el.inventoryDetailCategory) {
      const cats = {
        bahan_alam: "Bahan Alam",
        makanan: "Makanan",
        peralatan: "Peralatan",
        barang_perdagangan: "Barang Perdagangan",
        barang_quest: "Barang Misi"
      };
      this.el.inventoryDetailCategory.textContent = cats[slotData.category] || slotData.category;
    }
    if (this.el.inventoryDetailDesc) this.el.inventoryDetailDesc.textContent = slotData.description || "";
    
    if (this.el.inventoryUse) {
      this.el.inventoryUse.style.display = (slotData.usable || slotData.equipable) ? "inline-flex" : "none";
      this.el.inventoryUse.onclick = () => {
        this.callbacks.inventoryUse?.(slotIndex);
        setTimeout(() => {
          this._renderInventory(this.currentInventoryFilter || "all");
          this._showInventoryDetail(this.selectedInventorySlot);
        }, 50);
      };
    }
    
    if (this.el.inventoryDrop) {
      this.el.inventoryDrop.style.display = slotData.questItem ? "none" : "inline-flex";
      this.el.inventoryDrop.onclick = () => {
        this.callbacks.inventoryDrop?.(slotIndex);
        setTimeout(() => {
          this._renderInventory(this.currentInventoryFilter || "all");
          detail.classList.add("hidden");
        }, 50);
      };
    }
  }

  _renderQuestLog(tab) {
    const content = this.el.questlogContent;
    if (!content) return;
    content.innerHTML = "";
    
    const log = this.callbacks.getQuestLog?.() || { active: [], completed: [], failed: [] };
    const quests = log[tab] || [];
    
    if (quests.length === 0) {
      const empty = document.createElement("div");
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "12px";
      empty.style.textAlign = "center";
      empty.style.padding = "20px";
      empty.textContent = "Tidak ada misi di kategori ini.";
      content.appendChild(empty);
      return;
    }
    
    for (const quest of quests) {
      const card = document.createElement("div");
      card.className = "quest-card";
      
      const header = document.createElement("div");
      header.className = "quest-card-header";
      
      const title = document.createElement("div");
      title.className = "quest-card-title";
      title.textContent = quest.title;
      
      const status = document.createElement("div");
      status.className = "quest-card-status " + quest.status;
      status.textContent = quest.status === "active" ? "Aktif" : quest.status === "completed" ? "Selesai" : "Gagal";
      
      header.appendChild(title);
      header.appendChild(status);
      
      const desc = document.createElement("div");
      desc.className = "quest-card-desc";
      desc.textContent = quest.description || "";
      
      const objectives = document.createElement("div");
      objectives.className = "quest-objectives";
      for (const obj of quest.objectives || []) {
        const objEl = document.createElement("div");
        objEl.className = "quest-objective" + (obj.done ? " done" : "");
        const bullet = document.createElement("div");
        bullet.className = "quest-objective-bullet";
        const label = document.createElement("span");
        label.textContent = obj.label || "";
        objEl.appendChild(bullet);
        objEl.appendChild(label);
        objectives.appendChild(objEl);
      }
      
      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(objectives);
      
      if (quest.reward) {
        const reward = document.createElement("div");
        reward.className = "quest-reward";
        reward.textContent = "Hadiah: " + quest.reward;
        card.appendChild(reward);
      }
      
      content.appendChild(card);
    }
  }

  // ------------------------------------------------------------------ screens
  showLoading() {
    this.el.loadingScreen?.classList.remove("hidden");
  }

  hideLoading() {
    this.el.loadingScreen?.classList.add("hidden");
  }

  setLoading(progress, label) {
    const pct = Math.max(0, Math.min(1, progress)) * 100;
    if (this.el.loadingBar) this.el.loadingBar.style.width = pct.toFixed(1) + "%";
    if (label && this.el.loadingLabel) this.el.loadingLabel.textContent = label;
    const tip = this.el.loadingTip;
    if (tip) {
      const tips = [
        "Tip: tahan Shift untuk berlari menyusuri jalan utama.",
        "Tip: geser untuk memutar kamera, gulir untuk memperbesar.",
        "Tip: sungai itu dalam — ikuti jalan dan jembatan.",
        "Tip: setiap penduduk adalah aset Kinstead yang nyata.",
        "Tip: buka Atlas Aset untuk melihat semua model.",
        "Tip: dunia membentang 5,7 km — jelajahi desa dan hutan di sekitarnya.",
      ];
      const index = Math.min(tips.length - 1, Math.floor(progress * tips.length));
      tip.textContent = tips[index];
    }
  }

  showMenu() {
    this.hideHUD();
    this.el.menuScreen?.classList.remove("hidden");
    this.el.pauseScreen?.classList.add("hidden");
  }

  hideMenu() {
    this.el.menuScreen?.classList.add("hidden");
  }

  showHUD() {
    this.el.hud?.classList.remove("hidden");
  }

  hideHUD() {
    this.el.hud?.classList.add("hidden");
  }

  setPaused(paused) {
    if (paused) this.el.pauseScreen?.classList.remove("hidden");
    else this.el.pauseScreen?.classList.add("hidden");
  }

  setFps(fps) {
    if (!this.el.hudFps) return;
    this.el.hudFps.textContent = Math.round(fps) + " fps";
    this.el.hudFps.classList.toggle("hidden", !this.fpsVisible);
  }

  setClock(value) {
    if (!this.el.hudTime) return;
    if (typeof value === "string") {
      this.el.hudTime.textContent = value;
      return;
    }
    const seconds = Number(value) || 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.el.hudTime.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  setRegion(name) {
    if (this.el.hudRegion) this.el.hudRegion.textContent = name;
  }

  toast(message, duration = 2600) {
    const el = this.el.toast;
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("show"), duration);
  }

  // --------------------------------------------------------------- characters
  buildCharacterCards(entries, thumbnails) {
    this.characters = entries;
    const grid = this.el.menuCharacterGrid;
    if (!grid) return;
    grid.innerHTML = "";

    for (const entry of entries) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "character-card";
      card.dataset.id = entry.id;
      card.title = `${entry.label} — ${entry.role || "Villager"}`;

      const img = document.createElement("img");
      img.alt = entry.label;
      img.src = thumbnails[entry.id] || "";
      img.loading = "lazy";
      card.appendChild(img);

      const name = document.createElement("span");
      name.className = "character-card-name";
      name.textContent = entry.label;
      card.appendChild(name);

      const role = document.createElement("span");
      role.className = "character-card-role";
      role.textContent = roleLabel(entry.role);
      card.appendChild(role);

      card.addEventListener("click", () => {
        this.setSelectedCharacter(entry.id);
        this.callbacks.characterSelect?.(entry.id);
      });

      grid.appendChild(card);
    }

    if (!this.selectedId && entries.length) {
      const preferred = entries.find((e) => e.id === "villager-farmer-1007") || entries[0];
      this.selectedId = preferred.id;
    }
    this.setSelectedCharacter(this.selectedId || entries[0]?.id);
  }

  setSelectedCharacter(id) {
    if (!id) return;
    this.selectedId = id;
    const entry = this.characters.find((c) => c.id === id);
    if (this.el.menuCharacterName) {
      this.el.menuCharacterName.textContent = entry?.label || "Villager";
    }
    if (this.el.menuCharacterRole) {
      this.el.menuCharacterRole.textContent = roleLabel(entry?.role);
    }
    if (this.el.hudCharacter) {
      this.el.hudCharacter.textContent = entry?.label || "Villager";
    }
    for (const card of this.el.menuCharacterGrid?.querySelectorAll(".character-card") || []) {
      card.classList.toggle("selected", card.dataset.id === id);
    }
    this.settings.character = id;
    saveSettings(this.settings);
  }

  getSelectedCharacter() {
    return this.selectedId;
  }

  // -------------------------------------------------------------------- atlas
  buildAtlas(entries) {
    this.atlasEntries = entries;
    this._renderAtlas();
  }

  setAtlasThumbnail(key, dataUrl) {
    const tile = this.el.atlasGrid?.querySelector(`[data-key="${cssEscape(key)}"] img`);
    if (tile) tile.src = dataUrl;
    const entry = this.atlasEntries.find((e) => e.key === key);
    if (entry) entry.thumbnail = dataUrl;
  }

  setAtlasSubtitle(text) {
    if (this.el.atlasSubtitle) this.el.atlasSubtitle.textContent = text;
  }

  _renderAtlas() {
    const grid = this.el.atlasGrid;
    if (!grid) return;
    grid.innerHTML = "";
    const filter = this.atlasFilter;
    const entries = this.atlasEntries.filter(
      (entry) => filter === "all" || entry.category === filter
    );

    for (const entry of entries) {
      const tile = document.createElement("div");
      tile.className = "atlas-tile";
      tile.dataset.key = entry.key;

      const img = document.createElement("img");
      img.alt = entry.label;
      if (entry.thumbnail) img.src = entry.thumbnail;
      tile.appendChild(img);

      const label = document.createElement("span");
      label.className = "atlas-label";
      label.textContent = entry.label;
      tile.appendChild(label);

      const category = document.createElement("span");
      category.className = "atlas-category";
      category.textContent = categoryLabel(entry.category);
      tile.appendChild(category);

      grid.appendChild(tile);
    }

    if (this.el.atlasSubtitle) {
      this.el.atlasSubtitle.textContent = `${entries.length} assets`;
    }
  }

  setAtlasFilter(filter) {
    this.atlasFilter = filter;
    for (const button of this.el.atlasFilters?.querySelectorAll("button") || []) {
      button.classList.toggle("active", button.dataset.filter === filter);
    }
    this._renderAtlas();
  }

  // ----------------------------------------------------------------- settings
  _applySettingsToForm() {
    if (this.el.settingsQuality) this.el.settingsQuality.value = this.settings.quality;
    if (this.el.settingsSensitivity) {
      this.el.settingsSensitivity.value = String(this.settings.sensitivity);
    }
    if (this.el.settingsInvert) this.el.settingsInvert.checked = this.settings.invertY;
    if (this.el.settingsFps) this.el.settingsFps.checked = this.settings.showFps;
    this.fpsVisible = this.settings.showFps;
  }

  _emitSettings() {
    this.settings.quality = this.el.settingsQuality?.value || "high";
    this.settings.sensitivity = Number(this.el.settingsSensitivity?.value || 1);
    this.settings.invertY = !!this.el.settingsInvert?.checked;
    this.settings.showFps = !!this.el.settingsFps?.checked;
    this.fpsVisible = this.settings.showFps;
    if (this.el.hudFps) this.el.hudFps.classList.toggle("hidden", !this.fpsVisible);
    saveSettings(this.settings);
    this.callbacks.settingsChange?.({ ...this.settings });
  }

  getSettings() {
    return { ...this.settings };
  }

  setMoney(money) {
    if (this.el.hudMoney) {
      this.el.hudMoney.textContent = `🪙 ${money} koin`;
    }
  }

  setTool(toolName) {
    if (this.el.hudTool) {
      this.el.hudTool.textContent = toolName || "Tangan Kosong";
    }
  }

  showShop(npc, items, money) {
    if (!this.el.shopScreen) return;
    if (this.el.shopTitle) this.el.shopTitle.textContent = `Toko ${npc.name}`;
    if (this.el.shopSubtitle) this.el.shopSubtitle.textContent = npc.title || "";
    if (this.el.shopBalance) this.el.shopBalance.textContent = `${money} koin`;
    this.currentShopNpc = npc;
    this.currentShopItems = items;
    this.currentShopTab = "buy";
    this.el.shopScreen.classList.remove("hidden");
    this._renderShop("buy");
  }

  hideShop() {
    this.el.shopScreen?.classList.add("hidden");
  }

  _renderShop(tab) {
    const content = this.el.shopContent;
    if (!content) return;
    content.innerHTML = "";
    this.currentShopTab = tab;
    
    document.querySelectorAll(".shop-tab").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    
    const money = this.callbacks.getMoney?.() || 0;
    if (this.el.shopBalance) this.el.shopBalance.textContent = `${money} koin`;
    
    if (tab === "buy") {
      const items = this.currentShopItems || [];
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "var(--muted)";
        empty.style.fontSize = "12px";
        empty.style.padding = "20px";
        empty.textContent = "Toko ini saat ini tidak menjual apa pun.";
        content.appendChild(empty);
        return;
      }
      for (const item of items) {
        if (item.stock <= 0) continue;
        const row = document.createElement("div");
        row.className = "shop-item";
        
        const icon = document.createElement("span");
        icon.className = "shop-item-icon";
        icon.textContent = item.icon;
        row.appendChild(icon);
        
        const info = document.createElement("div");
        info.className = "shop-item-info";
        const name = document.createElement("div");
        name.className = "shop-item-name";
        name.textContent = item.name;
        const meta = document.createElement("div");
        meta.className = "shop-item-meta";
        meta.textContent = item.description?.substring(0, 60) || "";
        info.appendChild(name);
        info.appendChild(meta);
        row.appendChild(info);
        
        const price = document.createElement("div");
        price.className = "shop-item-price";
        price.textContent = `${item.buyPrice} koin`;
        row.appendChild(price);
        
        const stock = document.createElement("div");
        stock.className = "shop-item-stock";
        stock.textContent = `Stok: ${item.stock}`;
        row.appendChild(stock);
        
        const btn = document.createElement("button");
        btn.className = "shop-btn";
        btn.textContent = "Beli";
        btn.disabled = money < item.buyPrice;
        btn.addEventListener("click", () => {
          const res = this.callbacks.shopBuy?.(this.currentShopNpc?.id, item.itemId, 1);
          if (res?.success) {
            setTimeout(() => {
              const newItems = this.callbacks.getShopItems?.(this.currentShopNpc?.id) || [];
              this.currentShopItems = newItems;
              this._renderShop("buy");
            }, 50);
          }
        });
        row.appendChild(btn);
        content.appendChild(row);
      }
    } else if (tab === "sell") {
      const inv = this.callbacks.getInventory?.() || [];
      const sellable = inv.filter(s => s && !s.questItem && s.count > 0);
      if (sellable.length === 0) {
        const empty = document.createElement("div");
        empty.style.color = "var(--muted)";
        empty.style.fontSize = "12px";
        empty.style.padding = "20px";
        empty.textContent = "Tidak ada item yang bisa dijual.";
        content.appendChild(empty);
        return;
      }
      for (const slot of sellable) {
        const trader = this.currentShopNpc;
        const basePrice = 5;
        const sellPrice = Math.floor(basePrice * 0.5); // fallback
        const row = document.createElement("div");
        row.className = "shop-item";
        
        const icon = document.createElement("span");
        icon.className = "shop-item-icon";
        icon.textContent = slot.icon;
        row.appendChild(icon);
        
        const info = document.createElement("div");
        info.className = "shop-item-info";
        const name = document.createElement("div");
        name.className = "shop-item-name";
        name.textContent = slot.name + (slot.count > 1 ? ` x${slot.count}` : "");
        const meta = document.createElement("div");
        meta.className = "shop-item-meta";
        meta.textContent = slot.description?.substring(0, 60) || "";
        info.appendChild(name);
        info.appendChild(meta);
        row.appendChild(info);
        
        const price = document.createElement("div");
        price.className = "shop-item-price";
        price.textContent = `+${sellPrice} koin`;
        row.appendChild(price);
        
        const stock = document.createElement("div");
        stock.className = "shop-item-stock";
        stock.textContent = "";
        row.appendChild(stock);
        
        const btn = document.createElement("button");
        btn.className = "shop-btn";
        btn.textContent = "Jual";
        btn.addEventListener("click", () => {
          const res = this.callbacks.shopSell?.(this.currentShopNpc?.id, slot.id, 1);
          if (res?.success) {
            setTimeout(() => {
              this._renderShop("sell");
            }, 50);
          }
        });
        row.appendChild(btn);
        content.appendChild(row);
      }
    }
  }

  // ------------------------------------------------------------------- inputs
  getMoveInput() {
    let x = this.joystick.x;
    let y = this.joystick.y;
    if (this.keys) {
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    }
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return { x, y, run: this.runHeld || !!this.keys?.has("ShiftLeft") || !!this.keys?.has("ShiftRight") };
  }

  setKeys(keys) {
    this.keys = keys;
  }

  // ------------------------------------------------------------------- helpers
  _detectTouch() {
    const touch =
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      "ontouchstart" in window;
    document.body.classList.toggle("touch", !!touch);
    if (touch) this.el.mobileControls?.classList.remove("hidden");
  }

  _bind() {
    this.el.menuPlay?.addEventListener("click", () => this.callbacks.play?.());

    this.el.btnPause?.addEventListener("click", () => this.callbacks.pause?.());
    this.el.btnCharacters?.addEventListener("click", () => this.callbacks.characters?.());
    this.el.btnQuestlog?.addEventListener("click", () => this.showQuestLog());
    this.el.btnInventory?.addEventListener("click", () => this.showInventory());
    this.el.btnSettings?.addEventListener("click", () => this.openSettings(true));
    this.el.btnHelp?.addEventListener("click", () => this.openHelp(true));
    this.el.btnAtlas?.addEventListener("click", () => this.callbacks.atlas?.());

    this.el.pauseResume?.addEventListener("click", () => this.callbacks.resume?.());
    this.el.pauseCharacters?.addEventListener("click", () => this.callbacks.characters?.());
    this.el.pauseSettings?.addEventListener("click", () => this.openSettings(true));
    this.el.pauseHelp?.addEventListener("click", () => this.openHelp(true));
    this.el.pauseAtlas?.addEventListener("click", () => this.callbacks.atlas?.());
    this.el.pauseMenu?.addEventListener("click", () => this.callbacks.toMenu?.());

    this.el.menuSettings?.addEventListener("click", () => this.openSettings(true));
    this.el.menuHelp?.addEventListener("click", () => this.openHelp(true));
    this.el.menuAtlas?.addEventListener("click", () => this.callbacks.atlas?.());

    this.el.settingsClose?.addEventListener("click", () => this.openSettings(false));
    this.el.helpClose?.addEventListener("click", () => this.openHelp(false));
    this.el.atlasClose?.addEventListener("click", () => this.callbacks.closeAtlas?.());
    this.el.dialogClose?.addEventListener("click", () => this.callbacks.dialogueClose?.());
    this.el.questlogClose?.addEventListener("click", () => this.hideQuestLog());
    this.el.inventoryClose?.addEventListener("click", () => this.hideInventory());
    this.el.shopClose?.addEventListener("click", () => this.hideShop());
    this.el.btnStrategyMap?.addEventListener("click", () => this.callbacks.openStrategyMap?.());
    this.el.strategyClose?.addEventListener("click", () => this.hideStrategyMap?.());
    this.el.btnVisitVillage?.addEventListener("click", () => {
      if (this.selectedVillage) {
        this.callbacks.visitVillage?.(this.selectedVillage);
      }
    });

    for (const input of [
      this.el.settingsQuality,
      this.el.settingsSensitivity,
      this.el.settingsInvert,
      this.el.settingsFps,
    ]) {
      input?.addEventListener("change", () => this._emitSettings());
      input?.addEventListener("input", () => {
        if (input === this.el.settingsSensitivity) this._emitSettings();
      });
    }

    this.el.settingsReset?.addEventListener("click", () => {
      this.settings = { ...DEFAULT_SETTINGS, character: this.selectedId };
      saveSettings(this.settings);
      this._applySettingsToForm();
      this.callbacks.settingsChange?.({ ...this.settings });
      this.toast("Pengaturan dikembalikan ke bawaan");
    });

    for (const button of this.el.atlasFilters?.querySelectorAll("button") || []) {
      button.addEventListener("click", () => this.setAtlasFilter(button.dataset.filter));
    }

    for (const button of document.querySelectorAll(".questlog-tab")) {
      button.addEventListener("click", () => {
        document.querySelectorAll(".questlog-tab").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        this._renderQuestLog(button.dataset.tab);
      });
    }

    for (const button of document.querySelectorAll(".inventory-filter")) {
      button.addEventListener("click", () => {
        document.querySelectorAll(".inventory-filter").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        this.currentInventoryFilter = button.dataset.filter;
        this._renderInventory(button.dataset.filter);
        if (this.el.inventoryDetail) this.el.inventoryDetail.classList.add("hidden");
        this.selectedInventorySlot = -1;
      });
    }

    for (const button of document.querySelectorAll(".shop-tab")) {
      button.addEventListener("click", () => {
        this._renderShop(button.dataset.tab);
      });
    }

    this._bindJoystick();
    this._bindHoldButton(this.el.btnRun, (held) => {
      this.runHeld = held;
      this.el.btnRun?.classList.toggle("active", held);
    });
    this.el.btnJump?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.callbacks.jump?.();
    });
    this.el.btnInteract?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.callbacks.interact?.();
    });
    this.el.btnAttack?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.callbacks.useTool?.();
    });
  }

  _bindHoldButton(button, setter) {
    if (!button) return;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      setter(true);
    };
    const up = (event) => {
      event.preventDefault();
      setter(false);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("pointerleave", up);
  }

  _bindJoystick() {
    const base = this.el.joystick;
    const knob = this.el.joystickKnob;
    if (!base || !knob) return;
    let pointerId = null;
    const radius = 46;

    const update = (event) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      const nx = dx / radius;
      const ny = dy / radius;
      this.joystick.x = Math.abs(nx) > 0.12 ? nx : 0;
      this.joystick.y = Math.abs(ny) > 0.12 ? -ny : 0;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const end = () => {
      pointerId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      knob.style.transform = "translate(0px, 0px)";
      base.classList.remove("active");
    };

    base.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pointerId = event.pointerId;
      base.setPointerCapture?.(pointerId);
      base.classList.add("active");
      update(event);
    });
    base.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      event.preventDefault();
      update(event);
    });
    base.addEventListener("pointerup", end);
    base.addEventListener("pointercancel", end);
  }

  openSettings(open) {
    this.el.settingsModal?.classList.toggle("hidden", !open);
  }

  openHelp(open) {
    this.el.helpModal?.classList.toggle("hidden", !open);
  }

  openAtlas(open) {
    this.el.atlasScreen?.classList.toggle("hidden", !open);
  }

  isAtlasOpen() {
    return !this.el.atlasScreen?.classList.contains("hidden");
  }

  showStrategyMap(settlements, onSelectVillage) {
    if (!this.el.strategyScreen) return;
    this.el.strategyScreen.classList.remove("hidden");
    this.settlements = settlements;
    this.selectedVillage = null;
    this.onSelectVillage = onSelectVillage || null;
    if (this.el.strategySelectedTitle) this.el.strategySelectedTitle.textContent = "Pilih Desa";
    if (this.el.strategySelectedDesc) this.el.strategySelectedDesc.textContent = "Klik salah satu titik pemukiman pada peta untuk melihat detail, lalu tekan Kunjungi Desa.";
    if (this.el.strategyDetails) this.el.strategyDetails.classList.add("hidden");
    if (this.el.btnVisitVillage) this.el.btnVisitVillage.disabled = true;
    this._renderStrategyMap();
  }

  hideStrategyMap() {
    this.el.strategyScreen?.classList.add("hidden");
  }

  _renderStrategyMap() {
    const canvas = this.el.strategyMapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background map grid
    ctx.fillStyle = "#0c1712";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(236, 226, 200, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center point (Kinstead)
    const cx = width / 2;
    const cy = height / 2;
    ctx.fillStyle = "#c6a16b";
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2e8d4";
    ctx.font = "10px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Kinstead (Pusat)", cx, cy - 8);

    // Scale factor: world coordinate span is approx +/- 1800m -> map canvas 400px
    const scale = 0.09;

    // Draw settlements
    for (const s of (this.settlements || [])) {
      const sx = cx + s.x * scale;
      const sz = cy + s.z * scale;
      const isSelected = this.selectedVillage?.id === s.id;

      ctx.fillStyle = isSelected ? "#d2b07b" : "#6d8b61";
      ctx.beginPath();
      ctx.arc(sx, sz, isSelected ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#c6a16b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sz, 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = "#e6ddcb";
      ctx.font = "9px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.name, sx, sz + 15);
    }

    // Click handler on canvas
    if (!canvas._boundClick) {
      canvas._boundClick = true;
      canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        let clicked = null;
        for (const s of (this.settlements || [])) {
          const sx = cx + s.x * scale;
          const sz = cy + s.z * scale;
          const dist = Math.hypot(clickX - sx, clickY - sz);
          if (dist < 14) {
            clicked = s;
            break;
          }
        }

        if (clicked) {
          this.selectedVillage = clicked;
          this._renderStrategyMap();
          this._updateStrategyInfo(clicked);
        }
      });
    }
  }

  _updateStrategyInfo(s) {
    if (!s) return;
    if (this.el.strategySelectedTitle) this.el.strategySelectedTitle.textContent = s.name;
    if (this.el.strategySelectedDesc) this.el.strategySelectedDesc.textContent = `Pusat pemukiman mandiri dengan berbagai fasilitas perdagangan dan bangunan lokal tahun 1914.`;
    if (this.el.strategyDetails) this.el.strategyDetails.classList.remove("hidden");
    if (this.el.strategyStatCoord) this.el.strategyStatCoord.textContent = `X: ${Math.round(s.x)}, Z: ${Math.round(s.z)}`;
    if (this.el.strategyStatRadius) this.el.strategyStatRadius.textContent = `${s.radius} meter`;
    if (this.el.strategyStatPool) {
      const formatted = (s.pool || []).map(b => titleCase(b)).join(", ");
      this.el.strategyStatPool.textContent = formatted || "-";
    }
    if (this.el.btnVisitVillage) {
      this.el.btnVisitVillage.disabled = false;
    }
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage might be blocked */
  }
}

function roleLabel(value) {
  const labels = {
    farmer: "Petani",
    builder: "Pembangun",
    worker: "Pekerja",
    fisher: "Nelayan",
    shop: "Pedagang",
    clerk: "Juru Tulis",
    teacher: "Guru",
    clergy: "Pendeta",
    nurse: "Perawat",
    watch: "Penjaga",
  };
  return labels[value] || "Penduduk";
}

function categoryLabel(value) {
  const labels = {
    buildings: "Bangunan",
    characters: "Penduduk",
    animals: "Hewan",
    nature: "Alam",
    decorations: "Dekorasi",
  };
  return labels[value] || value;
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function camel(id) {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
