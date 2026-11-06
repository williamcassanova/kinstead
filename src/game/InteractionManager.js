import * as THREE from "three";

export class InteractionManager {
  constructor({ scene, camera, player, npcManager, questManager, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.npcManager = npcManager;
    this.questManager = questManager;
    this.ui = ui;
    this.interactionRange = 4.0;
    this.currentTarget = null;
    this.dialogueState = {
      open: false,
      npc: null,
      quest: null,
      mode: "dialogue",
      choices: []
    };
  }

  update(dt, playerPosition) {
    if (!playerPosition || !this.npcManager) {
      this._hidePrompt();
      this.currentTarget = null;
      return;
    }

    // Don't show prompt if dialog is open
    if (this.dialogueState.open) {
      this._hidePrompt();
      return;
    }

    // Find nearest interactable NPC
    let nearest = null;
    let minDistSq = this.interactionRange * this.interactionRange;

    for (const npc of this.npcManager.npcs || []) {
      if (!npc.root || !npc.root.visible) continue;
      const dx = npc.root.position.x - playerPosition.x;
      const dz = npc.root.position.z - playerPosition.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearest = npc;
      }
    }

    if (nearest) {
      this.currentTarget = nearest;
      const dist = Math.sqrt(minDistSq);
      if (dist <= this.interactionRange) {
        this._showPrompt(nearest);
      } else {
        this._hidePrompt();
      }
    } else {
      this.currentTarget = null;
      this._hidePrompt();
    }
  }

  _showPrompt(npc) {
    if (!this.ui?.el?.interactionPrompt) return;
    const promptText = this.ui.el.interactionText;
    if (promptText) {
      const isTouch = document.body.classList.contains("touch");
      if (isTouch) {
        promptText.innerHTML = `Sentuh <b>BICARA</b> untuk berbicara dengan ${npc.name}`;
      } else {
        promptText.innerHTML = `Tekan <b>E</b> untuk berbicara dengan ${npc.name}`;
      }
    }
    this.ui.el.interactionPrompt.classList.remove("hidden");
  }

  _hidePrompt() {
    if (!this.ui?.el?.interactionPrompt) return;
    this.ui.el.interactionPrompt.classList.add("hidden");
  }

  interact() {
    if (!this.currentTarget) return;
    this.openDialogue(this.currentTarget);
  }

  openDialogue(npc) {
    if (!this.ui) return;

    // Face player to NPC
    if (this.player && this.player.controller) {
      const pPos = this.player.controller.position;
      npc.heading = Math.atan2(pPos.x - npc.root.position.x, pPos.z - npc.root.position.z);
      npc.waitTimer = 6.0;
    }

    this.dialogueState = {
      open: true,
      npc: npc,
      quest: null,
      mode: "dialogue",
      choices: []
    };

    // Check for quest
    const availableQuest = this.questManager?.canAcceptQuest(npc.id);
    const activeQuest = this.questManager?.getQuestByGiver(npc.id);

    // Build choices
    const choices = [];
    
    if (availableQuest) {
      choices.push({
        id: "accept_quest",
        text: `[Misi] ${availableQuest.title} - Terima misi`,
        action: () => this._acceptQuest(availableQuest)
      });
    }
    
    if (activeQuest) {
      const allDone = activeQuest.objectives.every(o => o.done);
      if (allDone) {
        choices.push({
          id: "complete_quest",
          text: `[Selesai] ${activeQuest.title} - Laporkan penyelesaian`,
          action: () => this._completeQuest(activeQuest)
        });
      } else {
        choices.push({
          id: "quest_progress",
          text: `[Dalam Proses] ${activeQuest.title} - Lihat progres`,
          action: () => this._showQuestProgress(activeQuest)
        });
      }
    }

    choices.push({
      id: "chat",
      text: "Hanya berbincang-bincang",
      action: () => this._showChat(npc)
    });

    choices.push({
      id: "farewell",
      text: "Permisi, saya harus pergi",
      action: () => this.closeDialogue()
    });

    this.dialogueState.choices = choices;

    // Show dialogue UI
    if (this.ui.showDialogue) {
      const hour = (this.npcManager.worldBuilder?.dayTime || 0.3) * 24;
      let timeKey = "siang";
      if (hour >= 5 && hour < 11) timeKey = "pagi";
      else if (hour >= 11 && hour < 15) timeKey = "siang";
      else if (hour >= 15 && hour < 19) timeKey = "sore";
      else timeKey = "malam";
      
      const greeting = npc.dialogues?.[timeKey] || `Halo, aku ${npc.name}. Ada yang bisa kubantu?`;
      
      this.ui.showDialogue({
        npc: {
          name: npc.name,
          title: npc.title,
          role: npc.role
        },
        text: greeting,
        choices: choices
      });
    }

    this._hidePrompt();
  }

  _acceptQuest(quest) {
    const success = this.questManager?.acceptQuest(quest.id, this.dialogueState.npc.id);
    if (success) {
      if (this.ui.showDialogue) {
        this.ui.showDialogue({
          npc: {
            name: this.dialogueState.npc.name,
            title: this.dialogueState.npc.title,
            role: this.dialogueState.npc.role
          },
          text: quest.dialogueAccept || "Baiklah, ini misimu. Kembalilah padaku saat sudah selesai.",
          choices: [
            { id: "ok", text: "Mengerti", action: () => this.closeDialogue() }
          ]
        });
      }
    }
  }

  _completeQuest(quest) {
    // Get economy from game if possible
    const game = typeof window !== 'undefined' ? window.kinsteadGame : null;
    this.questManager?.completeQuest(quest.id, game?.economyManager);
    if (this.ui.showDialogue) {
      this.ui.showDialogue({
        npc: {
          name: this.dialogueState.npc.name,
          title: this.dialogueState.npc.title,
          role: this.dialogueState.npc.role
        },
        text: quest.dialogueComplete || "Terima kasih atas bantuanmu! Ini hadiah kecil dariku.",
        choices: [
          { id: "ok", text: "Sama-sama", action: () => this.closeDialogue() }
        ]
      });
    }
  }

  _showQuestProgress(quest) {
    const objectives = quest.objectives.map(o => 
      o.done ? `✓ ${o.label}` : `○ ${o.label}`
    ).join('\n');
    
    if (this.ui.showDialogue) {
      this.ui.showDialogue({
        npc: {
          name: this.dialogueState.npc.name,
          title: this.dialogueState.npc.title,
          role: this.dialogueState.npc.role
        },
        text: `Progres misi "${quest.title}":\n\n${objectives}`,
        choices: [
          { id: "ok", text: "Mengerti", action: () => this.openDialogue(this.dialogueState.npc) }
        ]
      });
    }
  }

  _showChat(npc) {
    const hour = (this.npcManager.worldBuilder?.dayTime || 0.3) * 24;
    let timeKey = "siang";
    if (hour >= 5 && hour < 11) timeKey = "pagi";
    else if (hour >= 11 && hour < 15) timeKey = "siang";
    else if (hour >= 15 && hour < 19) timeKey = "sore";
    else timeKey = "malam";
    
    const chats = [
      npc.dialogues?.[timeKey],
      "Kinstead adalah desa kecil yang hangat. Semua orang saling mengenal di sini.",
      "Cuaca hari ini cukup bagus untuk beraktivitas, bukan?",
      "Sudah lama aku tinggal di sini. Desa ini selalu punya tempat khusus di hatiku.",
      "Kalau ada yang butuh bantuan, jangan sungkan untuk bertanya."
    ].filter(Boolean);
    
    const randomChat = chats[Math.floor(Math.random() * chats.length)];
    
    if (this.ui.showDialogue) {
      this.ui.showDialogue({
        npc: {
          name: npc.name,
          title: npc.title,
          role: npc.role
        },
        text: randomChat,
        choices: [
          { id: "back", text: "Kembali", action: () => this.openDialogue(npc) },
          { id: "farewell", text: "Permisi", action: () => this.closeDialogue() }
        ]
      });
    }
  }

  closeDialogue() {
    this.dialogueState = {
      open: false,
      npc: null,
      quest: null,
      mode: "dialogue",
      choices: []
    };
    if (this.ui.hideDialogue) {
      this.ui.hideDialogue();
    }
  }

  handleChoice(choiceId) {
    const choice = this.dialogueState.choices.find(c => c.id === choiceId);
    if (choice && choice.action) {
      choice.action();
    }
  }
}
