import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('voxel-canvas-container');
if (container) {
  initVoxelScene(container);
}

function initVoxelScene(container) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    35,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(6, 5, 7);
  camera.lookAt(0, 0.2, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Theme-aware palette
  function getPalette() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      fill: dark ? 0x3a3a3a : 0xf0f0f0,
      edge: dark ? 0xfafafa : 0x111111,
      accent: dark ? 0x9a9a9a : 0xdddddd,
    };
  }

  // Lights — strong directional from above-right to create top/right/left face differentiation
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(5, 8, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  // Group holding all voxel objects
  const group = new THREE.Group();
  scene.add(group);

  // Track meshes for theme updates
  const meshes = [];
  const lineSegments = [];

  function makeBox(w, h, d, x, y, z, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: getPalette().edge });
    const lines = new THREE.LineSegments(edges, lineMat);
    mesh.add(lines);

    meshes.push({ mesh, baseColor: color });
    lineSegments.push(lines);
    group.add(mesh);
    return mesh;
  }

  function buildScene() {
    const p = getPalette();

    // Book 1 — biggest, bottom
    makeBox(2.2, 0.45, 1.5, 0, -1.0, 0, p.fill);
    // Book 2 — middle, slightly offset
    makeBox(1.85, 0.4, 1.25, 0.1, -0.55, 0.05, p.accent);
    // Book 3 — smaller, top of stack
    makeBox(1.55, 0.38, 1.05, -0.05, -0.16, -0.05, p.fill);

    // Mug — cube on top of stack
    makeBox(0.7, 0.85, 0.7, 0.0, 0.45, 0.0, p.accent);
    // Mug handle — small cube on side
    makeBox(0.18, 0.4, 0.32, 0.45, 0.45, 0.0, p.accent);

    // Small accent floating cube — a little flourish
    makeBox(0.35, 0.35, 0.35, -1.1, 0.7, 0.6, p.fill);
  }

  // Rebuild scene on theme change (re-creates meshes with fresh palette)
  function rebuild() {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    meshes.length = 0;
    lineSegments.length = 0;
    buildScene();
  }

  buildScene();

  // Watch for theme attribute changes
  const themeObserver = new MutationObserver(() => {
    rebuild();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // Controls — drag to rotate, no zoom, no pan, gentle auto-rotate
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minPolarAngle = Math.PI / 4;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.target.set(0, 0.0, 0);

  // Pause auto-rotate while user is dragging, resume after a pause
  let resumeTimer;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    if (resumeTimer) clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', () => {
    resumeTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, 2500);
  });

  // Animation loop
  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  // Handle resize
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // Respect reduced motion: turn off auto-rotate
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) {
    controls.autoRotate = false;
  }
}
