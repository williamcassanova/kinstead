import * as THREE from "three";

export class InventoryManager {
  constructor({ ui, toast }) {
    this.ui = ui;
    this.toast = toast;
    this.maxSlots = 24;
    this.slots = Array(this.maxSlots).fill(null);
    this.itemDefinitions = this._buildDefinitions();
    this._load();
    this._ensureStarterTools();
  }

  _buildDefinitions() {
    return {
      "jerami": {
        id: "jerami",
        name: "Jerami",
        category: "bahan_alam",
        icon: "🌾",
        description: "Jerami kering hasil panen, bisa digunakan untuk berbagai keperluan.",
        stackable: true,
        maxStack: 99,
        usable: false,
        questItem: false
      },
      "roti": {
        id: "roti",
        name: "Roti",
        category: "makanan",
        icon: "🍞",
        description: "Roti hangat buatan Maribel. Mengembalikan tenaga.",
        stackable: true,
        maxStack: 20,
        usable: true,
        effect: { type: "heal", value: 10 },
        questItem: false
      },
      "batu": {
        id: "batu",
        name: "Batu",
        category: "bahan_alam",
        icon: "🪨",
        description: "Batu biasa yang bisa ditemukan di sekitar desa.",
        stackable: true,
        maxStack: 99,
        usable: false,
        questItem: false
      },
      "palu": {
        id: "palu",
        name: "Palu Besi",
        category: "peralatan",
        icon: "🔨",
        description: "Palu besi tempa Cato. Berguna untuk pekerjaan bangunan.",
        stackable: false,
        maxStack: 1,
        usable: false,
        questItem: false
      },
      "kain": {
        id: "kain",
        name: "Kain",
        category: "barang_perdagangan",
        icon: "🧵",
        description: "Kain berkualitas untuk perdagangan antar warga.",
        stackable: true,
        maxStack: 50,
        usable: false,
        questItem: false
      },
      "surat": {
        id: "surat",
        name: "Surat Penting",
        category: "barang_quest",
        icon: "📜",
        description: "Surat penting yang harus disampaikan. Jangan sampai hilang.",
        stackable: false,
        maxStack: 1,
        usable: false,
        questItem: true
      },
      "ikan": {
        id: "ikan",
        name: "Ikan Segar",
        category: "makanan",
        icon: "🐟",
        description: "Ikan segar hasil tangkapan Nell. Sangat lezat dimakan.",
        stackable: true,
        maxStack: 30,
        usable: true,
        effect: { type: "heal", value: 15 },
        questItem: false
      }
    };
  }

  getDefinition(itemId) {
    return this.itemDefinitions[itemId] || null;
  }

  addItem(itemId, amount = 1) {
    const def = this.getDefinition(itemId);
    if (!def) return false;
    amount = Math.max(1, Math.floor(amount));

    if (def.stackable) {
      for (let i = 0; i < this.maxSlots; i++) {
        if (this.slots[i] && this.slots[i].id === itemId) {
          const canAdd = Math.min(amount, def.maxStack - this.slots[i].count);
          if (canAdd > 0) {
            this.slots[i].count += canAdd;
            amount -= canAdd;
            if (amount <= 0) {
              this._save();
              return true;
            }
          }
        }
      }
    }

    for (let i = 0; i < this.maxSlots; i++) {
      if (!this.slots[i]) {
        const toAdd = def.stackable ? Math.min(amount, def.maxStack) : amount;
        this.slots[i] = {
          id: itemId,
          count: toAdd
        };
        amount -= toAdd;
        if (amount <= 0) {
          this._save();
          if (this.toast) this.toast(`Mendapat: ${def.name} x${toAdd}`);
          return true;
        }
      }
    }

    if (amount > 0 && this.toast) {
      this.toast("Inventaris penuh!");
    }
    this._save();
    return amount <= 0;
  }

  removeItem(slotIndex, amount = 1) {
    if (slotIndex < 0 || slotIndex >= this.maxSlots) return false;
    if (!this.slots[slotIndex]) return false;
    
    const slot = this.slots[slotIndex];
    const def = this.getDefinition(slot.id);
    if (!def) return false;
    if (def.questItem) return false; // Protect quest items
    
    amount = Math.max(1, Math.floor(amount));
    if (amount >= slot.count) {
      this.slots[slotIndex] = null;
    } else {
      slot.count -= amount;
    }
    this._save();
    return true;
  }

  useItem(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.maxSlots) return false;
    if (!this.slots[slotIndex]) return false;
    
    const slot = this.slots[slotIndex];
    const def = this.getDefinition(slot.id);
    if (!def) return false;

    if (def.equipable) {
      if (this.toast) this.toast(`Memasang ${def.name}...`);
      const toolMap = { "kapak": "axe", "beliung": "pickaxe", "pedang": "sword" };
      if (window.kinsteadGame && window.kinsteadGame.equipmentManager) {
        window.kinsteadGame.equipmentManager.equip(toolMap[def.id] || def.id);
      }
      return true;
    }

    if (!def.usable) return false;
    
    // Apply effect (basic implementation)
    if (def.effect && def.effect.type === "heal") {
      if (this.toast) this.toast(`Menggunakan ${def.name}... Pulih ${def.effect.value} tenaga.`);
    }
    
    // Reduce count
    if (slot.count <= 1) {
      this.slots[slotIndex] = null;
    } else {
      slot.count -= 1;
    }
    this._save();
    return true;
  }

  moveItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.maxSlots || toIndex < 0 || toIndex >= this.maxSlots) return false;
    if (fromIndex === toIndex) return false;
    
    const fromSlot = this.slots[fromIndex];
    const toSlot = this.slots[toIndex];
    
    if (!fromSlot) return false;
    
    // Try to stack
    if (toSlot && toSlot.id === fromSlot.id) {
      const def = this.getDefinition(fromSlot.id);
      if (def && def.stackable) {
        const canAdd = def.maxStack - toSlot.count;
        if (canAdd > 0) {
          const moveAmount = Math.min(fromSlot.count, canAdd);
          toSlot.count += moveAmount;
          if (fromSlot.count <= moveAmount) {
            this.slots[fromIndex] = null;
          } else {
            fromSlot.count -= moveAmount;
          }
          this._save();
          return true;
        }
      }
    }
    
    // Swap
    this.slots[fromIndex] = toSlot;
    this.slots[toIndex] = fromSlot;
    this._save();
    return true;
  }

  getItemCount(itemId) {
    let total = 0;
    for (let i = 0; i < this.maxSlots; i++) {
      if (this.slots[i] && this.slots[i].id === itemId) {
        total += this.slots[i].count;
      }
    }
    return total;
  }

  hasItem(itemId, amount = 1) {
    return this.getItemCount(itemId) >= amount;
  }

  removeItemById(itemId, amount = 1) {
    const def = this.getDefinition(itemId);
    if (!def) return false;
    if (def.questItem) return false;
    
    let remaining = amount;
    for (let i = 0; i < this.maxSlots && remaining > 0; i++) {
      if (this.slots[i] && this.slots[i].id === itemId) {
        const take = Math.min(remaining, this.slots[i].count);
        if (take >= this.slots[i].count) {
          this.slots[i] = null;
        } else {
          this.slots[i].count -= take;
        }
        remaining -= take;
      }
    }
    if (remaining < amount) {
      this._save();
      return true;
    }
    return false;
  }

  getSlots() {
    return this.slots.map((slot, idx) => {
      if (!slot) return null;
      const def = this.getDefinition(slot.id);
      return {
        index: idx,
        id: slot.id,
        count: slot.count,
        name: def?.name || slot.id,
        category: def?.category || "lainnya",
        icon: def?.icon || "📦",
        description: def?.description || "",
        usable: def?.usable || false,
        stackable: def?.stackable || false,
        questItem: def?.questItem || false,
        equipable: def?.equipable || false
      };
    });
  }

  _save() {
    try {
      if (typeof localStorage === "undefined") return;
      const data = {
        slots: this.slots
      };
      localStorage.setItem("kinstead.inventory.v1", JSON.stringify(data));
    } catch (e) {
      console.warn("Gagal menyimpan inventaris:", e);
    }
  }

  _load() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem("kinstead.inventory.v1");
      if (!raw) {
        this._hasSavedData = false;
        return;
      }
      this._hasSavedData = true;
      const data = JSON.parse(raw);
      if (data.slots && Array.isArray(data.slots)) {
        for (let i = 0; i < this.maxSlots; i++) {
          this.slots[i] = data.slots[i] || null;
        }
      }
    } catch (e) {
      console.warn("Gagal memuat inventaris:", e);
      this._hasSavedData = false;
    }
  }

  _ensureStarterTools() {
    // Ensure tool definitions exist
    if (!this.itemDefinitions["kapak"]) {
      this.itemDefinitions["kapak"] = {
        id: "kapak", name: "Kapak", category: "peralatan", icon: "🪓", description: "Kapak untuk menebang pohon.", stackable: false, maxStack: 1, usable: false, equipable: true, toolType: "axe", questItem: false
      };
    }
    if (!this.itemDefinitions["beliung"]) {
      this.itemDefinitions["beliung"] = {
        id: "beliung", name: "Beliung", category: "peralatan", icon: "⛏️", description: "Beliung untuk menambang batu.", stackable: false, maxStack: 1, usable: false, equipable: true, toolType: "pickaxe", questItem: false
      };
    }
    if (!this.itemDefinitions["pedang"]) {
      this.itemDefinitions["pedang"] = {
        id: "pedang", name: "Pedang", category: "peralatan", icon: "⚔️", description: "Pedang untuk pertarungan.", stackable: false, maxStack: 1, usable: false, equipable: true, toolType: "sword", questItem: false
      };
    }
    if (!this.itemDefinitions["kayu"]) {
      this.itemDefinitions["kayu"] = {
        id: "kayu", name: "Kayu", category: "bahan_alam", icon: "🪵", description: "Kayu hasil tebangan.", stackable: true, maxStack: 99, usable: false, questItem: false
      };
    }

    // Check if tools already exist
    const hasAxe = this.slots.some(s => s && s.id === "kapak");
    const hasPick = this.slots.some(s => s && s.id === "beliung");
    const hasSword = this.slots.some(s => s && s.id === "pedang");
    
    if (hasAxe && hasPick && hasSword) return;
    
    // Add missing tools to empty slots
    if (!hasAxe) this._addToEmptySlot("kapak");
    if (!hasPick) this._addToEmptySlot("beliung");
    if (!hasSword) this._addToEmptySlot("pedang");
    
    this._save();
  }

  _addToEmptySlot(itemId) {
    for (let i = 0; i < this.maxSlots; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { id: itemId, count: 1 };
        return true;
      }
    }
    return false;
  }
}
