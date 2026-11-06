import * as THREE from "three";
import { CharacterAnimation } from "./CharacterAnimation.js";
import { sourceToWorld } from "./WorldLayout.js";

// Sistem Living NPC: Nama Indonesia, Profesi, Rutinitas Harian, Dialog Interaktif, Persistensi State, & LOD/Culling
export class NPCManager {
  constructor({ scene, assets, collision, heightfield, worldBuilder }) {
    this.scene = scene;
    this.assets = assets;
    this.collision = collision;
    this.heightfield = heightfield;
    this.worldBuilder = worldBuilder;

    this.npcs = [];
    this.group = new THREE.Group();
    this.group.name = "LivingNPCs";
    this.scene.add(this.group);

    this.interactionCallback = null;
    this._loadState();
  }

  // Definisikan daftar NPC Living dengan nama Indonesia, profesi, rumah, tempat kerja, dan rutinitas harian
  initNPCs() {
    const npcDefinitions = [
      {
        id: "villager-farmer-1007",
        name: "Bram",
        role: "petani",
        title: "Petani Senior",
        home: { x: 33.8, z: 33.5 }, // Dekat bangunan farm
        work: { x: 34.2, z: 36.0 }, // Ladang pertanian
        routine: [
          { start: 5, end: 8, activity: "tidur", pos: { x: 33.8, z: 33.5 } },
          { start: 8, end: 12, activity: "bekerja", pos: { x: 34.2, z: 36.0 } },
          { start: 12, end: 13, activity: "istirahat", pos: { x: 27.2, z: 26.0 } }, // Alun-alun
          { start: 13, end: 17, activity: "bekerja", pos: { x: 34.2, z: 36.0 } },
          { start: 17, end: 20, activity: "sosialisasi", pos: { x: 28.15, z: 14.0 } }, // Kedai/Tavern
          { start: 20, end: 5, activity: "tidur", pos: { x: 33.8, z: 33.5 } },
        ],
        dialogues: {
          pagi: "Pagi yang cerah untuk merawat tanaman di ladang Kinstead!",
          siang: "Pekerjaan tani butuh ketekunan. Panen tahun ini tampak menjanjikan.",
          sore: "Waktunya bersantai di kedai setelah seharian mencangkul.",
          malam: "Sudah malam, saatnya istirahat agar tubuh bugar esok hari.",
        }
      },
      {
        id: "villager-shop-1131",
        name: "Maribel",
        role: "pedagang",
        title: "Pembuat Roti",
        home: { x: 26.25, z: 17.3 }, // Bakery
        work: { x: 27.05, z: 18.5 }, // Market/Bakery area
        routine: [
          { start: 6, end: 9, activity: "tidur", pos: { x: 26.25, z: 17.3 } },
          { start: 9, end: 17, activity: "bekerja", pos: { x: 27.05, z: 18.5 } },
          { start: 17, end: 19, activity: "sosialisasi", pos: { x: 27.2, z: 26.0 } },
          { start: 19, end: 6, activity: "tidur", pos: { x: 26.25, z: 17.3 } },
        ],
        dialogues: {
          pagi: "Roti hangat baru saja keluar dari oven! Silakan dicicipi.",
          siang: "Dagangan hari ini sangat laris manis diborong warga.",
          sore: "Menjelang sore udara mulai sejuk, toko segera kukunci.",
          malam: "Pintu toko tutup. Selamat malam, semoga mimpimu indah.",
        }
      },
      {
        id: "villager-builder-1031",
        name: "Cato",
        role: "pandai besi", // Atau tukang/pembangun
        title: "Ahli Logam & Bangunan",
        home: { x: 31.9, z: 25.0 }, // Workshop
        work: { x: 32.2, z: 25.6 },
        routine: [
          { start: 6, end: 8, activity: "tidur", pos: { x: 31.9, z: 25.0 } },
          { start: 8, end: 16, activity: "bekerja", pos: { x: 32.2, z: 25.6 } },
          { start: 16, end: 19, activity: "sosialisasi", pos: { x: 28.15, z: 14.0 } },
          { start: 19, end: 6, activity: "tidur", pos: { x: 31.9, z: 25.0 } },
        ],
        dialogues: {
          pagi: "Suara dentuman palu menandakan dimulainya hari baru di bengkel.",
          siang: "Baja dan besi ini harus ditempa kuat untuk menahan angin desa.",
          sore: "Besi sudah dingin, saatnya membersihkan peralatan.",
          malam: "Api perapian pandai besi padam. Istirahatlah.",
        }
      },
      {
        id: "villager-fisher-1093",
        name: "Nell",
        role: "nelayan",
        title: "Nelayan Sungai",
        home: { x: 15.4, z: 23.0 }, // Fishery
        work: { x: 15.4, z: 24.0 }, // Riverbank
        routine: [
          { start: 5, end: 7, activity: "tidur", pos: { x: 15.4, z: 23.0 } },
          { start: 7, end: 15, activity: "bekerja", pos: { x: 15.4, z: 24.0 } },
          { start: 15, end: 18, activity: "sosialisasi", pos: { x: 27.2, z: 26.0 } },
          { start: 18, end: 5, activity: "tidur", pos: { x: 15.4, z: 23.0 } },
        ],
        dialogues: {
          pagi: "Ikan-ikan segar melompat di sungai jernih pagi ini.",
          siang: "Air sungai tenang sekali. Semoga jaringku penuh.",
          sore: "Tangkapan hari ini cukup untuk dibagikan ke tetangga.",
          malam: "Sungai berbisik di dalam gelap. Selamat malam.",
        }
      },
      {
        id: "villager-teacher-1186",
        name: "Ada",
        role: "guru",
        title: "Pengajar Desa",
        home: { x: 28.15, z: 33.0 }, // School
        work: { x: 29.3, z: 32.2 },
        routine: [
          { start: 7, end: 8, activity: "tidur", pos: { x: 28.15, z: 33.0 } },
          { start: 8, end: 14, activity: "bekerja", pos: { x: 29.3, z: 32.2 } },
          { start: 14, end: 18, activity: "sosialisasi", pos: { x: 25.6, z: 30.4 } }, // Library
          { start: 18, end: 7, activity: "tidur", pos: { x: 28.15, z: 33.0 } },
        ],
        dialogues: {
          pagi: "Anak-anak sudah berkumpul di kelas untuk belajar sejarah Kinstead.",
          siang: "Ilmu adalah cahaya yang menerangi jalan hidup kita.",
          sore: "Membaca buku di perpustakaan adalah ketenangan sejati.",
          malam: "Lilin perpustakaan padam. Waktunya tidur.",
        }
      },
      {
        id: "villager-nurse-1248",
        name: "Rose",
        role: "perawat",
        title: "Petugas Klinik",
        home: { x: 28.15, z: 38.6 }, // Clinic
        work: { x: 28.0, z: 37.5 },
        routine: [
          { start: 6, end: 8, activity: "tidur", pos: { x: 28.15, z: 38.6 } },
          { start: 8, end: 17, activity: "bekerja", pos: { x: 28.0, z: 37.5 } },
          { start: 17, end: 19, activity: "sosialisasi", pos: { x: 27.2, z: 26.0 } },
          { start: 19, end: 6, activity: "tidur", pos: { x: 28.15, z: 38.6 } },
        ],
        dialogues: {
          pagi: "Klinik terbuka dan bersih. Semoga hari ini semua warga sehat.",
          siang: "Kesehatan adalah harta termahal di desa ini.",
          sore: "Udara sore segar, bagus untuk pemulihan pasien.",
          malam: "Obat-obatan tersusun rapi. Selamat malam istirahat.",
        }
      },
      {
        id: "villager-watch-1279",
        name: "Hal",
        role: "penjaga",
        title: "Penjaga Keamanan",
        home: { x: 25.6, z: 33.6 }, // Watchhouse
        work: { x: 27.2, z: 34.0 }, // High street
        routine: [
          { start: 6, end: 9, activity: "tidur", pos: { x: 25.6, z: 33.6 } },
          { start: 9, end: 18, activity: "bekerja", pos: { x: 27.2, z: 34.0 } },
          { start: 18, end: 22, activity: "patroli", pos: { x: 27.2, z: 26.0 } },
          { start: 22, end: 6, activity: "tidur", pos: { x: 25.6, z: 33.6 } },
        ],
        dialogues: {
          pagi: "Desa aman terkendali. Selamat beraktivitas!",
          siang: "Aku berjaga di pos utama untuk memastikan ketertiban.",
          sore: "Menjelang senja, perbatasan desa semakin sunyi.",
          malam: "Patroli malam dimulai. Tenang saja, aku mengawasimu.",
        }
      }
    ];

    for (const def of npcDefinitions) {
      const node = this.assets.getCollectionNode("villagers", def.id);
      if (!node) continue;

      const proto = this.assets.makePrototype(node, {
        mode: "character",
        targetHeight: 1.72,
        castShadow: true,
        receiveShadow: true,
      });

      const startWorld = sourceToWorld(def.home.x, def.home.z);
      const groundY = this._ground(startWorld.x, startWorld.z);
      proto.root.position.set(startWorld.x, groundY, startWorld.z);
      proto.root.name = "npc_living_" + def.id;
      this.group.add(proto.root);

      const animation = new CharacterAnimation(proto.root);

      // Load persistent state if exists
      const savedState = this.persistedStates[def.id] || {};

      const npcData = {
        id: def.id,
        name: def.name,
        role: def.role,
        title: def.title,
        root: proto.root,
        animation,
        home: def.home,
        work: def.work,
        routine: def.routine,
        dialogues: def.dialogues,
        currentActivity: savedState.activity || "bekerja",
        mood: savedState.mood || "senang",
        friendship: savedState.friendship || 0,
        targetPos: new THREE.Vector3(startWorld.x, groundY, startWorld.z),
        currentPos: new THREE.Vector3(startWorld.x, groundY, startWorld.z),
        heading: 0,
        speed: 1.1 + Math.random() * 0.3,
        waitTimer: 0,
        phase: Math.random() * Math.PI * 2,
        lodLevel: 0, // 0 = full, 1 = low freq update, 2 = hidden
      };

      this.npcs.push(npcData);
    }
  }

  update(dt, dayTime, playerPosition) {
    const currentHour = dayTime * 24;

    for (const npc of this.npcs) {
      // LOD / Culling calculation for Android optimization
      if (playerPosition) {
        const dx = npc.root.position.x - playerPosition.x;
        const dz = npc.root.position.z - playerPosition.z;
        const distSq = dx * dx + dz * dz;

        // Beyond 60 meters: LOD level 1 (update less frequently)
        // Beyond 120 meters: LOD level 2 (cull animations/hidden)
        if (distSq > 14400) {
          npc.root.visible = false;
          continue;
        } else {
          npc.root.visible = true;
          npc.lodLevel = distSq > 3600 ? 1 : 0;
        }
      }

      // If LOD level 1, update every other frame or skip animation heavy updates
      if (npc.lodLevel === 1 && Math.random() > 0.5) continue;

      // Determine routine activity based on hour
      const routineItem = npc.routine.find(
        (r) => currentHour >= r.start && currentHour < r.end
      ) || npc.routine[0];

      if (routineItem && routineItem.activity !== npc.currentActivity) {
        npc.currentActivity = routineItem.activity;
        const targetWorld = sourceToWorld(routineItem.pos.x, routineItem.pos.z);
        const gy = this._ground(targetWorld.x, targetWorld.z);
        npc.targetPos.set(targetWorld.x, gy, targetWorld.z);
      }

      // Movement logic towards targetPos
      const root = npc.root;
      const dx = npc.targetPos.x - root.position.x;
      const dz = npc.targetPos.z - root.position.z;
      const dist = Math.hypot(dx, dz);

      let moveSpeed = 0;
      if (dist > 0.5) {
        if (npc.waitTimer > 0) {
          npc.waitTimer -= dt;
        } else {
          const step = Math.min(dist, npc.speed * dt);
          const nx = root.position.x + (dx / dist) * step;
          const nz = root.position.z + (dz / dist) * step;
          const ground = this._ground(nx, nz);

          if (ground !== null && !this.collision.isBlockedXZ(nx, nz, 0.25, false)) {
            root.position.x = nx;
            root.position.z = nz;
          } else {
            // Find alternate wander or wait
            npc.waitTimer = 2.0;
          }
          npc.heading = Math.atan2(dx, dz);
          moveSpeed = npc.speed;
        }
      } else {
        // Reached destination, idle or slight look around
        moveSpeed = 0;
        if (Math.random() < 0.01) {
          npc.heading += (Math.random() - 0.5) * 1.5;
        }
      }

      // Ground alignment
      const currentGround = this._ground(root.position.x, root.position.z);
      if (currentGround !== null) {
        root.position.y += (currentGround - root.position.y) * (1 - Math.exp(-14 * dt));
      }

      root.rotation.y = angleLerp(npc.heading, root.rotation.y, 1 - Math.exp(-8 * dt));
      npc.animation.update(dt, {
        speed: moveSpeed,
        running: false,
        grounded: true,
        idleTime: performance.now() * 0.001 + npc.phase,
      });
    }
  }

  // Interaksi pemain dengan NPC terdekat
  interactWithNearest(playerPosition) {
    if (!playerPosition || !this.npcs.length) return null;

    let nearest = null;
    let minDistSq = 4.0 * 4.0; // Jangkauan interaksi 4 meter

    for (const npc of this.npcs) {
      if (!npc.root || !npc.root.visible) continue;
      const dx = npc.root.position.x - playerPosition.x;
      const dz = npc.root.position.z - playerPosition.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearest = npc;
      }
    }

    if (!nearest) return null;
    if (Math.sqrt(minDistSq) > 4.0) return null;

    // Hadapkan NPC ke player
    nearest.heading = Math.atan2(
      playerPosition.x - nearest.root.position.x,
      playerPosition.z - nearest.root.position.z
    );
    nearest.waitTimer = 4.0; // Berhenti sejenak saat diajak bicara

    // Pilih dialog berdasarkan waktu
    const hour = typeof this.worldBuilder?.dayTime === 'number' ? (this.worldBuilder.dayTime * 24) : ((new Date().getHours() + new Date().getMinutes()/60));
    let timeKey = "siang";
    if (hour >= 5 && hour < 11) timeKey = "pagi";
    else if (hour >= 11 && hour < 15) timeKey = "siang";
    else if (hour >= 15 && hour < 19) timeKey = "sore";
    else timeKey = "malam";

    const dialogueText = nearest.dialogues?.[timeKey] || "Halo, senang bertemu denganmu di Kinstead!";
    
    // Tingkatkan friendship sedikit saat berinteraksi
    nearest.friendship = Math.min(100, (nearest.friendship || 0) + 5);
    this._saveState();

    return {
      name: nearest.name,
      role: nearest.role,
      title: nearest.title,
      text: dialogueText,
      friendship: nearest.friendship,
    };
  }

  // Persistensi State (Simpan & Muat via localStorage jika tersedia)
  _saveState() {
    try {
      if (typeof localStorage === "undefined") return;
      const data = {};
      for (const npc of this.npcs) {
        data[npc.id] = {
          activity: npc.currentActivity,
          mood: npc.mood,
          friendship: npc.friendship,
        };
      }
      localStorage.setItem("kinstead.living_npcs.v1", JSON.stringify(data));
    } catch (e) {
      console.warn("Gagal menyimpan state NPC:", e);
    }
  }

  _loadState() {
    try {
      if (typeof localStorage === "undefined") {
        this.persistedStates = {};
        return;
      }
      const raw = localStorage.getItem("kinstead.living_npcs.v1");
      this.persistedStates = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this.persistedStates = {};
    }
  }

  _ground(x, z) {
    if (this.worldBuilder && this.worldBuilder.regionWorld) {
      return this.worldBuilder.regionWorld.heightAt(x, z);
    }
    return this.heightfield ? this.heightfield.sample(x, z) : 0;
  }
}

function angleLerp(target, current, t) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * t;
}
