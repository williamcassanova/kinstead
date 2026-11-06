import * as THREE from "three";

export class QuestManager {
  constructor({ npcManager, ui, toast }) {
    this.npcManager = npcManager;
    this.ui = ui;
    this.toast = toast;
    this.quests = [];
    this.activeQuests = new Map();
    this.completedQuests = new Set();
    this.failedQuests = new Set();
    this.questDefinitions = this._buildDefinitions();
    this._loadProgress();
  }

  _buildDefinitions() {
    return [
      {
        id: "bantu-bram",
        giverNpcId: "villager-farmer-1007",
        giverName: "Bram",
        title: "Panen Perdana",
        description: "Bram membutuhkan bantuan untuk memeriksa ladang. Berjalanlah ke ladang pertanian di sebelah timur rumahnya dan laporkan kembali padanya.",
        type: "go_to",
        objectives: [
          { id: "visit-field", type: "visit_location", target: { x: 34.2, z: 36.0 }, radius: 3.0, label: "Kunjungi ladang pertanian", done: false }
        ],
        reward: "Ucapan terima kasih penduduk",
        dialogueAccept: "Kalau kamu bisa sekedar melirik ladangku hari ini, aku sangat berterima kasih. Sudah lama tak ada yang meluangkan waktu.",
        dialogueComplete: "Terima kasih, Nak! Melihat ladang tetap terawat sudah cukup membuatku lega. Anggap saja ini penghormatan desa padamu.",
      },
      {
        id: "roti-maribel",
        giverNpcId: "villager-shop-1131",
        giverName: "Maribel",
        title: "Pesanan Roti Pagi",
        description: "Maribel meminta tolong mengantarkan perhatian ke alun-alun. Temui warga di sekitar plaza dan kembali melapor.",
        type: "go_to",
        objectives: [
          { id: "visit-plaza", type: "visit_location", target: { x: 27.2, z: 26.0 }, radius: 4.0, label: "Kunjungi alun-alun Kinstead", done: false }
        ],
        reward: "Roti hangat sebagai ucapan terima kasih",
        dialogueAccept: "Bisakah kamu melintas ke alun-alun sebentar? Kadang aku terlalu sibuk di oven hingga tak sempat menyapa warga.",
        dialogueComplete: "Ah, kamu sudah kembali. Terima kasih banyak! Sering-seringlah singgah, roti hangat selalu menantimu.",
      },
      {
        id: "patroli-hal",
        giverNpcId: "villager-watch-1279",
        giverName: "Hal",
        title: "Patroli Singkat",
        description: "Penjaga Hal mengajak mengenali jalan utama. Lakukan patroli singkat mengelilingi High Street dan lapor kembali.",
        type: "go_to",
        objectives: [
          { id: "visit-highstreet", type: "visit_location", target: { x: 27.2, z: 34.0 }, radius: 3.5, label: "Lakukan patroli di jalan utama", done: false }
        ],
        reward: "Rasa aman dan sambutan warga",
        dialogueAccept: "Kalau kamu baru di Kinstead, tak ada salahnya mengenal jalan utamaku. Coba keliling sebentar dan kembalilah padaku.",
        dialogueComplete: "Bagus. Jalan ini aman berkat warga saling menjaga. Kinstead lebih kuat karena orang seperti kamu.",
      }
    ];
  }

  canAcceptQuest(npcId) {
    const def = this.questDefinitions.find(q => q.giverNpcId === npcId);
    if (!def) return null;
    if (this.activeQuests.has(def.id)) return null;
    if (this.completedQuests.has(def.id)) return null;
    if (this.failedQuests.has(def.id)) return null;
    return def;
  }

  acceptQuest(questId, npcId) {
    const def = this.questDefinitions.find(q => q.id === questId);
    if (!def || def.giverNpcId !== npcId) return false;
    if (this.activeQuests.has(questId) || this.completedQuests.has(questId)) return false;

    const quest = {
      ...def,
      status: "active",
      acceptedAt: Date.now(),
      objectives: def.objectives.map(o => ({ ...o, done: false, progress: 0 })),
      rewardClaimed: false
    };
    this.activeQuests.set(questId, quest);
    this._saveProgress();
    if (this.toast) this.toast(`Misi Baru: ${quest.title}`);
    if (this.ui?.showQuestNotification) this.ui.showQuestNotification("Misi Baru", quest.title);
    return true;
  }

  update(playerPosition, dt, inventoryManager) {
    if (!playerPosition) return;
    for (const [questId, quest] of this.activeQuests) {
      let changed = false;
      for (const obj of quest.objectives) {
        if (obj.done) continue;
        if (obj.type === "visit_location" && obj.target) {
          const dx = playerPosition.x - obj.target.x;
          const dz = playerPosition.z - obj.target.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= (obj.radius || 2.5)) {
            obj.done = true;
            changed = true;
            if (this.toast) this.toast(`Tujuan Selesai: ${obj.label}`);
            if (this.ui?.showQuestNotification) this.ui.showQuestNotification("Tujuan Selesai", obj.label);
          }
        } else if (obj.type === "collect_item" && obj.itemId) {
          const inv = inventoryManager || this.inventoryManager;
          if (inv && typeof inv.getItemCount === 'function') {
            const count = inv.getItemCount(obj.itemId);
            if (count >= (obj.required || 1)) {
              obj.done = true;
              obj.current = count;
              changed = true;
              if (this.toast) this.toast(`Tujuan Selesai: ${obj.label}`);
              if (this.ui?.showQuestNotification) this.ui.showQuestNotification("Tujuan Selesai", obj.label);
            } else {
              obj.current = count;
            }
          }
        }
      }
      if (changed) {
        this._checkCompletion(questId);
        this._saveProgress();
      }
    }
  }

  setInventoryManager(inv) {
    this.inventoryManager = inv;
  }

  _checkCompletion(questId) {
    const quest = this.activeQuests.get(questId);
    if (!quest) return;
    const allDone = quest.objectives.every(o => o.done);
    if (allDone) {
      quest.status = "completed";
      this.activeQuests.delete(questId);
      this.completedQuests.add(questId);
      if (this.toast) this.toast(`Misi Selesai: ${quest.title}`);
      if (this.ui?.showQuestNotification) this.ui.showQuestNotification("Misi Selesai", quest.title);
      this._saveProgress();
    }
  }

  completeQuest(questId, economyManager) {
    const quest = this.activeQuests.get(questId) || Array.from(this.completedQuests).includes(questId) ? null : null;
    // Check if in active
    const activeQuest = this.activeQuests.get(questId);
    if (activeQuest && activeQuest.status !== "completed") {
      const allDone = activeQuest.objectives.every(o => o.done);
      if (allDone && !activeQuest.rewardClaimed) {
        activeQuest.rewardClaimed = true;
        if (economyManager && typeof economyManager.addMoney === 'function') {
          economyManager.addMoney(25);
        }
        if (this.inventoryManager && typeof this.inventoryManager.addItem === 'function' && activeQuest.rewardItems) {
          for (const ri of activeQuest.rewardItems) {
            this.inventoryManager.addItem(ri.itemId, ri.amount || 1);
          }
        }
      }
    }
    this._checkCompletion(questId);
  }

  getQuestLog() {
    const active = Array.from(this.activeQuests.values());
    const completed = this.questDefinitions.filter(q => this.completedQuests.has(q.id)).map(q => ({ ...q, status: "completed" }));
    const failed = this.questDefinitions.filter(q => this.failedQuests.has(q.id)).map(q => ({ ...q, status: "failed" }));
    return { active, completed, failed };
  }

  getQuestByGiver(npcId) {
    const active = Array.from(this.activeQuests.values()).find(q => q.giverNpcId === npcId && q.status === "active");
    if (active) return active;
    return null;
  }

  _saveProgress() {
    try {
      if (typeof localStorage === "undefined") return;
      const data = {
        active: Array.from(this.activeQuests.entries()),
        completed: Array.from(this.completedQuests),
        failed: Array.from(this.failedQuests)
      };
      localStorage.setItem("kinstead.quests.v1", JSON.stringify(data));
    } catch (e) {
      console.warn("Gagal menyimpan progres quest:", e);
    }
  }

  _loadProgress() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem("kinstead.quests.v1");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.completed) this.completedQuests = new Set(data.completed);
      if (data.failed) this.failedQuests = new Set(data.failed);
      if (data.active) {
        for (const [id, quest] of data.active) {
          this.activeQuests.set(id, quest);
        }
      }
    } catch (e) {
      console.warn("Gagal memuat progres quest:", e);
    }
  }
}
