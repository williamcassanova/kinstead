import * as THREE from "three";

export class ResourceNode {
  constructor({ type, position, scene, collision }) {
    this.type = type; // tree, rock
    this.position = position;
    this.scene = scene;
    this.collision = collision;
    this.health = type === "tree" ? 3 : 4;
    this.maxHealth = this.health;
    this.chopped = false;
    this.group = new THREE.Group();
    this.group.position.set(position.x, 0, position.z);
    this.createMesh();
    scene.add(this.group);
  }

  createMesh() {
    if (this.type === "tree") {
      const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 2.5, 8);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      this.group.add(trunk);
      
      const leavesGeo = new THREE.SphereGeometry(1.2, 8, 6);
      const leavesMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3d });
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 2.8;
      leaves.castShadow = true;
      this.group.add(leaves);
    } else if (this.type === "rock") {
      const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.8 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.y = 0.6;
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    }
  }

  hit(tool) {
    if (this.chopped) return { success: false };
    
    if (this.type === "tree" && tool === "axe") {
      this.health--;
      if (this.health <= 0) {
        this.chop();
        return { success: true, drop: { itemId: "kayu", amount: 4 } };
      }
      return { success: true, progress: true };
    } else if (this.type === "rock" && tool === "pickaxe") {
      this.health--;
      if (this.health <= 0) {
        this.mine();
        return { success: true, drop: { itemId: "batu", amount: 3 } };
      }
      return { success: true, progress: true };
    }
    return { success: false };
  }

  chop() {
    this.chopped = true;
    // Animate falling
    const startRot = this.group.rotation.z;
    let t = 0;
    const animate = () => {
      t += 0.02;
      this.group.rotation.z = startRot + t * 1.2;
      this.group.position.y = -t * 2;
      if (t < 0.8) {
        requestAnimationFrame(animate);
      } else {
        if (this.group.parent) this.group.parent.remove(this.group);
      }
    };
    animate();
  }

  mine() {
    this.chopped = true;
    // Break into pieces
    this.group.scale.set(0.6, 0.6, 0.6);
    setTimeout(() => {
      if (this.group.parent) this.group.parent.remove(this.group);
    }, 500);
  }

  getDistance(pos) {
    const dx = this.group.position.x - pos.x;
    const dz = this.group.position.z - pos.z;
    return Math.hypot(dx, dz);
  }
}

export class ResourceManager {
  constructor({ scene, inventoryManager, equipmentManager, ui, worldBuilder }) {
    this.scene = scene;
    this.inventory = inventoryManager;
    this.equipment = equipmentManager;
    this.ui = ui;
    this.worldBuilder = worldBuilder;
    this.nodes = [];
    this.interactRange = 3.0;
    this._init();
  }

  _init() {
    // Add some trees and rocks near village/workshop areas
    const positions = [
      { type: "tree", x: 40, z: 30 },
      { type: "tree", x: 42, z: 28 },
      { type: "tree", x: 38, z: 32 },
      { type: "tree", x: 36, z: 16 },
      { type: "tree", x: 43, z: 12 },
      { type: "rock", x: 18, z: 28 },
      { type: "rock", x: 16, z: 30 },
      { type: "rock", x: 20, z: 26 },
      { type: "rock", x: 34, z: 23 },
      { type: "rock", x: 36, z: 24 },
    ];
    
    for (const p of positions) {
      this.nodes.push(new ResourceNode({
        type: p.type,
        position: { x: p.x, z: p.z },
        scene: this.scene
      }));
    }
  }

  tryUseResource(playerPosition) {
    if (!playerPosition) return null;
    const tool = this.equipment?.getCurrentTool?.();
    if (!tool || (tool !== "axe" && tool !== "pickaxe")) {
      if (this.ui) this.ui.toast("Peralatan salah atau belum dipasang. Gunakan kapak untuk pohon atau beliung untuk batu.");
      return null;
    }
    
    let nearest = null;
    let minDist = this.interactRange;
    
    for (const node of this.nodes) {
      if (node.chopped) continue;
      const dist = node.getDistance(playerPosition);
      if (dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    }
    
    if (!nearest) return null;
    
    const result = nearest.hit(tool);
    if (result.success) {
      if (this.ui) {
        if (result.progress) {
          const tool = this.equipment?.getCurrentTool?.();
          if (tool === "axe") this.ui.toast("Menebang pohon...");
          else if (tool === "pickaxe") this.ui.toast("Menambang batu...");
          else this.ui.toast("Menggunakan alat...");
        } else if (result.drop) {
          // will toast on drop
        }
      }
      if (result.drop && this.inventory) {
        setTimeout(() => {
          this.inventory.addItem(result.drop.itemId, result.drop.amount);
          if (this.ui) {
            const def = this.inventory.getDefinition ? this.inventory.getDefinition(result.drop.itemId) : null;
            this.ui.toast(`Mendapat: ${def?.name || result.drop.itemId} x${result.drop.amount}`);
          }
        }, 700);
      }
      return result;
    }
    return null;
  }

  getNearestResource(playerPosition) {
    if (!playerPosition) return null;
    const tool = this.equipment?.getCurrentTool?.();
    if (!tool || (tool !== "axe" && tool !== "pickaxe")) return null;
    
    let nearest = null;
    let minDist = this.interactRange;
    
    for (const node of this.nodes) {
      if (node.chopped) continue;
      const dist = node.getDistance(playerPosition);
      if (dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    }
    return nearest;
  }
}
