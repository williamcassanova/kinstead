import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const $ = id => document.getElementById(id);
let manifest = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb8bd);

const camera = new THREE.PerspectiveCamera(55,1,0.1,5000);
camera.position.set(18,18,22);

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

$('canvas').appendChild(renderer.domElement);

const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.target.set(0,0,0);
controls.maxPolarAngle = Math.PI*.48;

scene.add(new THREE.HemisphereLight(0xffffff,0x63705b,2));

const sun = new THREE.DirectionalLight(0xfff1d6,2.5);
sun.position.set(20,35,15);
scene.add(sun);

const ground = new THREE.Mesh(
 new THREE.PlaneGeometry(200,200),
 new THREE.MeshStandardMaterial({color:0x78945d,roughness:1})
);
ground.rotation.x=-Math.PI/2;
ground.name='WORLD_GROUND';
scene.add(ground);

const grid = new THREE.GridHelper(200,100,0x526b4c,0x78906e);
grid.position.y=.015;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const loader = new GLTFLoader();
const exporter = new GLTFExporter();

let sourceModel=null;
let sourceParts=[];
let selectedPart=null;
let sourceMeshes=[];
let selected=null;
let mode='place';
let objects=[];
let history=[];

function resize(){
 const el=$('viewport');
 const w=el.clientWidth,h=el.clientHeight;
 if(!w||!h)return;
 camera.aspect=w/h;
 camera.updateProjectionMatrix();
 renderer.setSize(w,h);
}
new ResizeObserver(resize).observe($('viewport'));
resize();

function setStatus(message){
 $('status').textContent=message;
}

function disposeObject(object){
 object.traverse(child=>{
  if(child.geometry)child.geometry.dispose();
  if(child.material){
   const mats=Array.isArray(child.material)?child.material:[child.material];
   mats.forEach(m=>m.dispose());
  }
 });
}

function refreshObjects(){
 $('objects').innerHTML=objects.length
  ? objects.map((o,i)=>`${i+1}. ${o.name}`).join('<br>')
  : 'Belum ada objek.';
}

function selectObject(object){
 selected=object;
 $('selected').textContent=object?object.name:'Belum ada objek';

 if(object){
  $('rotation').value=THREE.MathUtils.radToDeg(object.rotation.y)%360;
  $('scale').value=Math.round(object.scale.x*100);
 }
}

function getSelectedAsset(){
 return $('asset').value;
}

function updateAssets(){
 const category=$('category').value;
 const list=manifest.assets.filter(a=>
  category==='all'||a.category===category
 );

 $('asset').innerHTML='';
 list.forEach(item=>{
  const option=document.createElement('option');
  option.value=item.file;
  option.textContent=item.name;
  $('asset').appendChild(option);
 });
}

async function loadAsset(){
 const file=getSelectedAsset();
 if(!file)return;

 const item=manifest.assets.find(a=>a.file===file);
 setStatus('Memuat '+item.name+'...');

 try{
  const gltf=await loader.loadAsync(
   '/KINSTEAD-ASSET-LIBRARY/'+file
  );

  sourceModel=gltf.scene;

  let nodes=[...sourceModel.children];

  // Turun satu tingkat jika GLB memiliki
  // satu grup pembungkus.
  while(
   nodes.length===1 &&
   nodes[0].children.length>1
  ){
   nodes=[...nodes[0].children];
  }

  sourceParts=nodes.filter(node=>{
   let found=false;
   node.traverse(child=>{
    if(child.isMesh)found=true;
   });
   return found;
  });

  const selector=$('part');
  selector.innerHTML='';

  sourceParts.forEach((part,index)=>{
   const option=document.createElement('option');
   option.value=index;
   option.textContent=
    part.name || `Model ${index+1}`;
   selector.appendChild(option);
  });

  selectedPart=sourceParts[0]||null;

  selector.onchange=()=>{
   selectedPart=sourceParts[Number(selector.value)]||null;
   $('selected').textContent=
    selectedPart?.name || 'Belum dipilih';
  };

  $('selected').textContent=
   selectedPart?.name || 'Tidak ada model';

  setStatus(
   `${item.name}: ${sourceParts.length} model ditemukan.`
  );

 }catch(error){
  console.error(error);
  setStatus('Gagal memuat: '+error.message);
 }
}
function cloneMesh(mesh){
 const clone=mesh.clone(true);

 clone.traverse(child=>{
  if(child.isMesh){
   child.geometry=child.geometry.clone();

   if(Array.isArray(child.material)){
    child.material=child.material.map(m=>m.clone());
   }else{
    child.material=child.material.clone();
   }
  }
 });

 return clone;
}

function placeObject(mesh,point){
 const object=cloneMesh(mesh);
 const box=new THREE.Box3().setFromObject(object);
 const minY=box.min.y;

 object.position.set(point.x,point.y-minY,point.z);
 object.name=mesh.name||'Kinstead Object';

 scene.add(object);
 objects.push(object);
 history.push(object);

 selectObject(object);
 refreshObjects();
}

function pointerPosition(event){
 const rect=renderer.domElement.getBoundingClientRect();
 pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
 pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
 raycaster.setFromCamera(pointer,camera);
}

let downPosition=null;

renderer.domElement.addEventListener('pointerdown',e=>{
 downPosition={x:e.clientX,y:e.clientY};
});

renderer.domElement.addEventListener('pointerup',e=>{
 if(!downPosition)return;

 const moved=Math.hypot(
  e.clientX-downPosition.x,
  e.clientY-downPosition.y
 );

 downPosition=null;
 if(moved>8)return;

 pointerPosition(e);

 if(mode==='place'&&selectedPart){
  const hits=raycaster.intersectObject(ground,false);

  if(hits.length){
   placeObject(selectedPart,hits[0].point);
  }
 }else{
  const hits=raycaster.intersectObjects(objects,true);

  if(hits.length){
   let obj=hits[0].object;

   while(obj.parent&&!objects.includes(obj)){
    obj=obj.parent;
   }

   if(objects.includes(obj)){
    selectObject(obj);
   }
  }else{
   selectObject(null);
  }
 }
});

$('category').addEventListener('change',updateAssets);
$('load').addEventListener('click',loadAsset);

$('modePlace').addEventListener('click',()=>{
 mode='place';
 $('hint').textContent='PLACE: sentuh permukaan untuk menempatkan asset.';
});

$('modeCamera').addEventListener('click',()=>{
 mode='camera';
 $('hint').textContent='CAMERA: geser untuk memutar, pinch untuk zoom.';
});

$('rotation').addEventListener('input',e=>{
 if(selected)selected.rotation.y=THREE.MathUtils.degToRad(+e.target.value);
});

$('scale').addEventListener('input',e=>{
 if(selected){
  const s=+e.target.value/100;
  selected.scale.setScalar(s);
 }
});

$('delete').addEventListener('click',()=>{
 if(!selected)return;
 scene.remove(selected);
 objects=objects.filter(o=>o!==selected);
 history=history.filter(o=>o!==selected);
 disposeObject(selected);
 selectObject(null);
 refreshObjects();
});

$('duplicate').addEventListener('click',()=>{
 if(!selected)return;
 const clone=selected.clone(true);
 clone.position.x+=2;
 clone.name=selected.name+' Copy';
 scene.add(clone);
 objects.push(clone);
 history.push(clone);
 selectObject(clone);
 refreshObjects();
});

$('undo').addEventListener('click',()=>{
 const last=history.pop();
 if(!last||!objects.includes(last))return;
 scene.remove(last);
 objects=objects.filter(o=>o!==last);
 disposeObject(last);
 selectObject(null);
 refreshObjects();
});

$('export').addEventListener('click',async()=>{
 if(!objects.length){
  setStatus('Belum ada objek untuk diekspor.');
  return;
 }

 setStatus('Mengekspor dunia GLB...');

 try{
  const exportScene=new THREE.Scene();
  for(const obj of objects)exportScene.add(obj.clone(true));

  const result=await exporter.parseAsync(exportScene,{
   binary:true,
   onlyVisible:true
  });

  const blob=new Blob([result],{type:'model/gltf-binary'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='kinstead-world.glb';
  a.click();
  URL.revokeObjectURL(url);

  setStatus('World berhasil diekspor.');
 }catch(error){
  console.error(error);
  setStatus('Export gagal: '+error.message);
 }
});

async function init(){
 try{
  const response=await fetch('/KINSTEAD-ASSET-LIBRARY/manifest.json');
  if(!response.ok)throw new Error('Manifest tidak ditemukan');

  manifest=await response.json();

  [...new Set(manifest.assets.map(a=>a.category))].forEach(category=>{
   const option=document.createElement('option');
   option.value=category;
   option.textContent=category;
   $('category').appendChild(option);
  });

  updateAssets();
  setStatus(`${manifest.totalAssets} asset tersedia. Pilih kategori dan muat model.`);
 }catch(error){
  setStatus('Library error: '+error.message);
 }
}

function animate(){
 requestAnimationFrame(animate);
 controls.update();
 renderer.render(scene,camera);
}

animate();
init();
