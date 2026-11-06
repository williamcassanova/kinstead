import * as THREE from "three";

export class EconomyManager {
  constructor({ inventoryManager, ui, toast }) {
    this.inventory = inventoryManager;
    this.ui = ui;
    this.toast = toast;
    this.currency = "Koin Kinstead";
    this.money = 50; // Starting money
    this.shopStock = {};
    this.traders = this._buildTraders();
    this._load();
    this._initShops();
  }

  _buildTraders() {
    return {
      "villager-shop-1131": {
        id: "villager-shop-1131",
        name: "Maribel",
        title: "Pembuat Roti",
        shopType: "bakery",
        buyMultiplier: 0.4,
        sellMultiplier: 1.0,
        stock: [
          { itemId: "roti", price: 5, stock: 20, maxStock: 20 },
          { itemId: "kain", price: 12, stock: 10, maxStock: 10 }
        ]
      },
      "villager-farmer-1007": {
        id: "villager-farmer-1007",
        name: "Bram",
        title: "Petani Senior",
        shopType: "farm",
        buyMultiplier: 0.35,
        sellMultiplier: 0.9,
        stock: [
          { itemId: "jerami", price: 2, stock: 50, maxStock: 50 },
          { itemId: "batu", price: 3, stock: 30, maxStock: 30 }
        ]
      },
      "villager-fisher-1093": {
        id: "villager-fisher-1093",
        name: "Nell",
        title: "Nelayan Sungai",
        shopType: "fishery",
        buyMultiplier: 0.4,
        sellMultiplier: 1.1,
        stock: [
          { itemId: "ikan", price: 8, stock: 15, maxStock: 15 }
        ]
      },
      "villager-builder-1031": {
        id: "villager-builder-1031",
        name: "Cato",
        title: "Ahli Logam & Bangunan",
        shopType: "smith",
        buyMultiplier: 0.3,
        sellMultiplier: 0.95,
        stock: [
          { itemId: "palu", price: 45, stock: 2, maxStock: 2 },
          { itemId: "batu", price: 4, stock: 40, maxStock: 40 }
        ]
      }
    };
  }

  _initShops() {
    for (const [npcId, trader] of Object.entries(this.traders)) {
      if (!this.shopStock[npcId]) {
        this.shopStock[npcId] = trader.stock.map(s => ({ ...s }));
      }
    }
  }

  getTrader(npcId) {
    return this.traders[npcId] || null;
  }

  isTrader(npcId) {
    return !!this.traders[npcId];
  }

  getShopItems(npcId) {
    const trader = this.traders[npcId];
    if (!trader) return [];
    const stock = this.shopStock[npcId] || trader.stock;
    
    return stock.map(item => {
      const def = this.inventory?.getDefinition(item.itemId);
      const buyPrice = Math.ceil(item.price * trader.sellMultiplier);
      const sellPrice = Math.floor(item.price * trader.buyMultiplier);
      return {
        itemId: item.itemId,
        name: def?.name || item.itemId,
        icon: def?.icon || "📦",
        category: def?.category || "lainnya",
        description: def?.description || "",
        buyPrice,
        sellPrice,
        stock: item.stock,
        maxStock: item.maxStock
      };
    });
  }

  buyItem(npcId, itemId, amount = 1) {
    const trader = this.traders[npcId];
    if (!trader) return { success: false, reason: "Bukan pedagang" };
    
    const stock = this.shopStock[npcId];
    const stockItem = stock?.find(s => s.itemId === itemId);
    if (!stockItem || stockItem.stock <= 0) return { success: false, reason: "Stok habis" };
    
    amount = Math.max(1, Math.floor(amount));
    if (amount > stockItem.stock) amount = stockItem.stock;
    
    const def = this.inventory?.getDefinition(itemId);
    const buyPrice = Math.ceil(stockItem.price * trader.sellMultiplier);
    const totalCost = buyPrice * amount;
    
    if (this.money < totalCost) return { success: false, reason: "Saldo tidak cukup" };
    
    // Check inventory space
    if (this.inventory) {
      // Try to add
      const canAdd = this._canAddItem(itemId, amount);
      if (!canAdd) return { success: false, reason: "Inventaris penuh" };
      
      this.money -= totalCost;
      stockItem.stock -= amount;
      this.inventory.addItem(itemId, amount);
      this._save();
      if (this.toast) this.toast(`Membeli ${def?.name || itemId} x${amount} - ${totalCost} koin`);
      return { success: true, cost: totalCost };
    }
    
    return { success: false, reason: "Sistem inventaris tidak tersedia" };
  }

  sellItem(npcId, itemId, amount = 1) {
    const trader = this.traders[npcId];
    if (!trader) return { success: false, reason: "Bukan pedagang" };
    
    if (!this.inventory) return { success: false, reason: "Sistem inventaris tidak tersedia" };
    
    amount = Math.max(1, Math.floor(amount));
    if (!this.inventory.hasItem(itemId, amount)) return { success: false, reason: "Item tidak cukup" };
    
    const stock = this.shopStock[npcId];
    const stockItem = stock?.find(s => s.itemId === itemId);
    const basePrice = stockItem?.price || 5;
    const sellPrice = Math.floor(basePrice * trader.buyMultiplier);
    const totalGain = sellPrice * amount;
    
    const def = this.inventory.getDefinition(itemId);
    if (def?.questItem) return { success: false, reason: "Item quest tidak dapat dijual" };
    
    // Remove from inventory
    const removed = this.inventory.removeItemById(itemId, amount);
    if (!removed) return { success: false, reason: "Gagal menjual item" };
    
    this.money += totalGain;
    
    // Restock shop
    if (stockItem) {
      stockItem.stock = Math.min(stockItem.maxStock, stockItem.stock + amount);
    } else if (stock) {
      stock.push({ itemId, price: basePrice, stock: Math.min(20, amount), maxStock: 20 });
    }
    
    this._save();
    if (this.toast) this.toast(`Menjual ${def?.name || itemId} x${amount} + ${totalGain} koin`);
    return { success: true, gain: totalGain };
  }

  _canAddItem(itemId, amount) {
    if (!this.inventory) return false;
    const def = this.inventory.getDefinition(itemId);
    if (!def) return false;
    
    if (def.stackable) {
      // Check existing stacks
      for (let i = 0; i < this.inventory.maxSlots; i++) {
        const slot = this.inventory.slots[i];
        if (slot && slot.id === itemId && slot.count + amount <= def.maxStack) return true;
      }
    }
    
    // Check empty slots
    let empty = 0;
    for (let i = 0; i < this.inventory.maxSlots; i++) {
      if (!this.inventory.slots[i]) empty++;
    }
    if (def.stackable) {
      // Need at most ceil(amount/maxStack) slots
      return empty >= Math.ceil(amount / def.maxStack);
    }
    return empty >= amount;
  }

  addMoney(amount) {
    amount = Math.max(0, Math.floor(amount));
    this.money += amount;
    this._save();
    if (this.toast && amount > 0) this.toast(`+${amount} koin`);
  }

  getMoney() {
    return this.money;
  }

  _save() {
    try {
      if (typeof localStorage === "undefined") return;
      const data = {
        money: this.money,
        shopStock: this.shopStock
      };
      localStorage.setItem("kinstead.economy.v1", JSON.stringify(data));
    } catch (e) {
      console.warn("Gagal menyimpan ekonomi:", e);
    }
  }

  _load() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem("kinstead.economy.v1");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.money === 'number') this.money = data.money;
      if (data.shopStock) this.shopStock = data.shopStock;
    } catch (e) {
      console.warn("Gagal memuat ekonomi:", e);
    }
  }
}
