import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export class EquipmentManager {
  constructor({ scene, player, inventoryManager, ui, toast }) {
    this.scene = scene;
    this.player = player;
    this.inventory = inventoryManager;
    this.ui = ui;
    this.toast = toast;
    this.loader = new GLTFLoader();
    this.equipped = {
      axe: null,
      pickaxe: null,
      sword: null,
      current: null
    };
    this.tools = {};
    this.hands = { left: null, right: null };
    this.loadTools();
  }

  async loadTools() {
    const toolDefs = [
      { key: "axe", file: "./public/assets/models/tools/kapak.glb", name: "Kapak" },
      { key: "pickaxe", file: "./public/assets/models/tools/pickaxe.glb", name: "Beliung" },
      { key: "sword", file: "./public/assets/models/tools/sword.glb", name: "Pedang" }
    ];

    for (const def of toolDefs) {
      try {
        const gltf = await this.loader.loadAsync(def.file);
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        // Scale and orient
        model.scale.set(0.8, 0.8, 0.8);
        model.rotation.set(0, Math.PI, 0);
        this.tools[def.key] = { model: model.clone(), def };
      } catch (e) {
        console.warn(`Gagal memuat alat ${def.name}:`, e);
      }
    }
  }

  findHandNodes() {
    if (!this.player?.root) return;
    const root = this.player.root;
    root.traverse((node) => {
      const name = node.name.toLowerCase();
      if (name.includes("hand") || name.includes("r_hand") || name.includes("right")) {
        if (!this.hands.right && (name.includes("r") || name.includes("right"))) {
          this.hands.right = node;
        }
      }
      if (name.includes("l_hand") || name.includes("left")) {
        if (!this.hands.left) this.hands.left = node;
      }
    });
    if (!this.hands.right) {
      // Fallback: use right arm if exists
      root.traverse((node) => {
        const base = node.name.replace(/[._-]?\d+$/, "").toLowerCase();
        if (base === "arm" && !this.hands.right) {
          // check if right side
          if (node.name.toLowerCase().includes("r") || node.position.x > 0) {
            this.hands.right = node;
          }
        }
      });
    }
  }

  equip(toolKey) {
    // Map names
    if (toolKey === "kapak") toolKey = "axe";
    if (toolKey === "beliung") toolKey = "pickaxe";
    if (toolKey === "pedang") toolKey = "sword";
    
    if (!this.tools[toolKey]) {
      if (this.toast) this.toast(`Alat ${toolKey} belum dimuat`);
      // Try to load again
      this.loadTools();
      setTimeout(() => {
        if (this.tools[toolKey]) this.equip(toolKey);
      }, 500);
      return false;
    }
    if (!this.hands.right) this.findHandNodes();
    
    // Unequip current
    if (this.equipped.current && this.equipped.current.parent) {
      this.equipped.current.parent.remove(this.equipped.current);
    }
    
    const tool = this.tools[toolKey];
    const model = tool.model.clone();
    model.position.set(0, 0, 0);
    model.rotation.set(-Math.PI/2, 0, Math.PI/2);
    model.scale.set(0.75, 0.75, 0.75);
    
    if (this.hands.right) {
      this.hands.right.add(model);
    } else if (this.player?.root) {
      // Attach to player root as fallback
      model.position.copy(this.player.root.position);
      model.position.y += 1.0;
      model.position.x += 0.4;
      model.position.z += 0.2;
      this.player.root.add(model);
    }
    
    this.equipped.current = model;
    this.equipped.currentTool = toolKey;
    const toolNames = { axe: "Kapak", pickaxe: "Beliung", sword: "Pedang" };
    if (this.toast) this.toast(`${toolNames[toolKey] || tool.def.name} dipasang`);
    if (this.ui && this.ui.setTool) {
      this.ui.setTool(`Alat: ${toolNames[toolKey] || tool.def.name}`);
    }
    return true;
  }

  unequip() {
    if (this.equipped.current && this.equipped.current.parent) {
      this.equipped.current.parent.remove(this.equipped.current);
    }
    this.equipped.current = null;
    this.equipped.currentTool = null;
    if (this.toast) this.toast("Peralatan dilepas");
  }

  getCurrentTool() {
    return this.equipped.currentTool;
  }

  canUse(toolKey) {
    // Check if player has tool in inventory
    if (!this.inventory) return false;
    const toolMap = { axe: "kapak", pickaxe: "beliung", sword: "pedang" };
    // For now just check if equipped
    return this.equipped.currentTool === toolKey;
  }
}
