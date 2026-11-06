import * as THREE from "three";

export class ItemPickupManager {
  constructor({ scene, inventoryManager, interactionManager, ui }) {
    this.scene = scene;
    this.inventory = inventoryManager;
    this.interaction = interactionManager;
    this.ui = ui;
    this.pickups = [];
    this.group = new THREE.Group();
    this.group.name = "WorldItems";
    this.scene.add(this.group);
    this.pickupRange = 3.5;
    this._initPickups();
  }

  _initPickups() {
    const items = [
      { id: "jerami", position: { x: 34.5, z: 36.5 }, amount: 3 },
      { id: "batu", position: { x: 20.0, z: 30.0 }, amount: 2 },
      { id: "ikan", position: { x: 15.8, z: 24.5 }, amount: 1 },
      { id: "roti", position: { x: 27.3, z: 18.8 }, amount: 1 },
    ];

    for (const item of items) {
      const group = new THREE.Group();
      group.position.set(item.position.x, 0.8, item.position.z);
      group.userData = {
        type: "item_pickup",
        itemId: item.id,
        amount: item.amount,
        collected: false
      };
      
      // Simple visual marker
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({ 
        color: 0xd8b46a,
        emissive: 0xd8b46a,
        emissiveIntensity: 0.2
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.y = Math.random() * Math.PI;
      group.add(mesh);
      
      this.group.add(group);
      this.pickups.push({ group, data: group.userData });
    }
  }

  update(dt, playerPosition) {
    if (!playerPosition) return;
    
    for (const pickup of this.pickups) {
      if (pickup.data.collected) {
        if (pickup.group.parent) {
          pickup.group.parent.remove(pickup.group);
        }
        continue;
      }
      
      // Float animation
      pickup.group.position.y = 0.8 + Math.sin(Date.now() * 0.003) * 0.1;
      pickup.group.rotation.y += dt * 0.5;
      
      // Check distance
      const dx = pickup.group.position.x - playerPosition.x;
      const dz = pickup.group.position.z - playerPosition.z;
      const dist = Math.hypot(dx, dz);
      
      if (dist <= this.pickupRange) {
        // Make glow brighter
        const mesh = pickup.group.children[0];
        if (mesh && mesh.material) {
          mesh.material.emissiveIntensity = 0.4 + Math.sin(Date.now() * 0.005) * 0.2;
        }
      }
    }
  }

  tryPickup(playerPosition) {
    if (!playerPosition || !this.inventory) return null;
    
    for (const pickup of this.pickups) {
      if (pickup.data.collected) continue;
      
      const dx = pickup.group.position.x - playerPosition.x;
      const dz = pickup.group.position.z - playerPosition.z;
      const dist = Math.hypot(dx, dz);
      
      if (dist <= this.pickupRange) {
        const success = this.inventory.addItem(pickup.data.itemId, pickup.data.amount);
        if (success) {
          pickup.data.collected = true;
          if (this.ui) {
            const def = this.inventory.getDefinition(pickup.data.itemId);
            this.ui.toast(`Diambil: ${def?.name || pickup.data.itemId}${pickup.data.amount > 1 ? ' x' + pickup.data.amount : ''}`);
          }
          return { itemId: pickup.data.itemId, amount: pickup.data.amount };
        }
      }
    }
    return null;
  }

  getNearestPickup(playerPosition) {
    if (!playerPosition) return null;
    let nearest = null;
    let minDist = this.pickupRange;
    
    for (const pickup of this.pickups) {
      if (pickup.data.collected) continue;
      const dx = pickup.group.position.x - playerPosition.x;
      const dz = pickup.group.position.z - playerPosition.z;
      const dist = Math.hypot(dx, dz);
      if (dist < minDist) {
        minDist = dist;
        nearest = pickup;
      }
    }
    return nearest;
  }
}
