import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Стеклянные пиксельные объекты брендбука в 3D.
 *
 * Объект — пиксельная картинка, выдавленная кубиками: контур толще и
 * насыщеннее, середина тоньше и прозрачнее — как у объектов в брендбуке.
 * Кубики рисуются InstancedMesh: два меша на объект вместо сотен.
 *
 * Сцена не знает про Vue: страница создаёт её, передаёт указатель,
 * прокрутку и нажатия и вызывает dispose при уходе. Кадры рисуются, только
 * пока сцену видно (start/stop), а при «уменьшить движение» — один
 * неподвижный кадр.
 */

type PixelMap = readonly string[];

const HEART: PixelMap = [
  "..###...###..",
  ".#####.#####.",
  "#############",
  "#############",
  "#############",
  "#############",
  ".###########.",
  "..#########..",
  "...#######...",
  "....#####....",
  ".....###.....",
  "......#......",
];

const STAR: PixelMap = [
  "......#......",
  ".....###.....",
  ".....###.....",
  "....#####....",
  "#############",
  ".###########.",
  "..#########..",
  "...#######...",
  "...#######...",
  "..####.####..",
  "..###...###..",
  ".##.......##.",
];

const ASTERISK: PixelMap = [
  ".....###.....",
  ".....###.....",
  "##...###...##",
  "###..###..###",
  ".###.###.###.",
  "..#########..",
  "....#####....",
  "..#########..",
  ".###.###.###.",
  "###..###..###",
  "##...###...##",
  ".....###.....",
  ".....###.....",
];

const SMILE: PixelMap = [
  "....####....",
  "..########..",
  ".##########.",
  ".###.##.###.",
  "####.##.####",
  "############",
  "############",
  "###.####.###",
  ".###....###.",
  ".##########.",
  "..########..",
  "....####....",
];

const FLAME: PixelMap = [
  "....#.....",
  "....##....",
  "...###....",
  "...####...",
  "..#####.#.",
  "..#######.",
  ".########.",
  ".#########",
  "##########",
  "#####.####",
  "####...###",
  ".###...##.",
  "..######..",
];

const BOLT: PixelMap = [
  "...######",
  "...#####.",
  "..#####..",
  "..####...",
  ".#######.",
  ".######..",
  "....###..",
  "...###...",
  "...##....",
  "..##.....",
  "..#......",
];

const CURSOR: PixelMap = [
  "#........",
  "##.......",
  "###......",
  "####.....",
  "#####....",
  "######...",
  "#######..",
  "########.",
  "#########",
  "#####....",
  "##.###...",
  "#..###...",
  "....###..",
  "....###..",
];

/** Полумесяц: круг минус сдвинутый круг. */
function crescent(size: number): PixelMap {
  const rows: string[] = [];
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const outer = (x - c) ** 2 + (y - c) ** 2 <= (size / 2) ** 2;
      const inner = (x - c - size * 0.3) ** 2 + (y - c + size * 0.18) ** 2 <= (size * 0.4) ** 2;
      row += outer && !inner ? "#" : ".";
    }
    rows.push(row);
  }
  return rows;
}

interface ObjectSpec {
  map: PixelMap;
  color: string;
  /** Место на экране: -1…1 по ширине и высоте видимой области. */
  at: [number, number];
  /** Глубина: ближние сильнее отзываются на указатель. */
  z: number;
  tilt: number;
}

// Цвета — палитра бренда (--color-brand-* в main.css).
const WIDE: ObjectSpec[] = [
  { map: HEART, color: "#1c63ff", at: [-0.78, 0.5], z: 2, tilt: -0.25 },
  { map: STAR, color: "#ff8511", at: [0.8, 0.58], z: 0, tilt: 0.2 },
  { map: ASTERISK, color: "#2ce718", at: [-0.66, -0.6], z: 1, tilt: 0.3 },
  { map: SMILE, color: "#ffcc00", at: [0.72, -0.56], z: 2, tilt: -0.15 },
  { map: crescent(12), color: "#be2aff", at: [-0.95, -0.02], z: -2, tilt: 0.1 },
  { map: FLAME, color: "#f60301", at: [0.97, 0.02], z: -2, tilt: -0.1 },
  { map: BOLT, color: "#3a3a3a", at: [-0.3, 0.86], z: -3, tilt: 0.2 },
  { map: CURSOR, color: "#c9d4ea", at: [0.33, -0.88], z: -1, tilt: -0.3 },
];

// На телефоне надпись занимает середину целиком: объекты сверху и снизу.
const NARROW: ObjectSpec[] = [
  { map: HEART, color: "#1c63ff", at: [-0.6, 0.74], z: 1, tilt: -0.25 },
  { map: STAR, color: "#ff8511", at: [0.62, 0.8], z: 0, tilt: 0.2 },
  { map: ASTERISK, color: "#2ce718", at: [-0.62, -0.78], z: 1, tilt: 0.3 },
  { map: SMILE, color: "#ffcc00", at: [0.6, -0.72], z: 2, tilt: -0.15 },
  { map: FLAME, color: "#f60301", at: [0.02, 0.93], z: -2, tilt: -0.1 },
  { map: crescent(12), color: "#be2aff", at: [0.0, -0.95], z: -2, tilt: 0.1 },
];

interface Live {
  group: THREE.Group;
  spec: ObjectSpec;
  phase: number;
  spin: number;
  angle: number;
  squash: number;
}

export interface VoxelScene {
  start(): void;
  stop(): void;
  /** Указатель: -1…1 по ширине и высоте окна. */
  pointer(x: number, y: number): void;
  /** Насколько герой уехал при прокрутке: 0…1. */
  scroll(progress: number): void;
  /** Нажатие: объект под пальцем крутится. Возвращает, попали ли. */
  poke(clientX: number, clientY: number): boolean;
  resize(): void;
  dispose(): void;
}

export function createVoxelScene(options: {
  canvas: HTMLCanvasElement;
  background: string;
  reducedMotion: boolean;
}): VoxelScene {
  const { canvas, reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  pmrem.dispose();

  const light = new THREE.DirectionalLight("#ffffff", 1.4);
  light.position.set(-6, 10, 12);
  scene.add(light);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(0, 0, 34);

  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  const materials: THREE.Material[] = [];
  const root = new THREE.Group();
  scene.add(root);

  let objects: Live[] = [];
  let narrow = false;

  // Контур — плотное цветное стекло, середина — почти прозрачная, как
  // «желе» в брендбуке. Цвет проходящего света — цвет объекта.
  function glass(color: string, rim: boolean): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: rim ? color : new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35),
      roughness: 0.04,
      metalness: 0,
      transmission: 1,
      thickness: rim ? 1.4 : 0.5,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      specularIntensity: 1,
      attenuationColor: new THREE.Color(color),
      attenuationDistance: rim ? 0.45 : 2.2,
      envMapIntensity: 1.6,
    });
    materials.push(material);
    return material;
  }

  function build(specs: ObjectSpec[]) {
    for (const item of objects) root.remove(item.group);
    for (const material of materials.splice(0)) material.dispose();

    objects = specs.map((spec, index) => {
      const rows = spec.map.length;
      const cols = Math.max(...spec.map.map((row) => row.length));
      const filled = (x: number, y: number) => spec.map[y]?.[x] === "#";
      const rim: [number, number][] = [];
      const face: [number, number][] = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!filled(x, y)) continue;
          const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
          (edge ? rim : face).push([x, y]);
        }
      }

      const group = new THREE.Group();
      const matrix = new THREE.Matrix4();
      const place = (cells: [number, number][], depth: number, material: THREE.Material) => {
        const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
        cells.forEach(([x, y], i) => {
          matrix.compose(
            new THREE.Vector3(x - (cols - 1) / 2, (rows - 1) / 2 - y, 0),
            new THREE.Quaternion(),
            new THREE.Vector3(1, 1, depth),
          );
          mesh.setMatrixAt(i, matrix);
        });
        mesh.userData.object = index;
        group.add(mesh);
      };
      place(rim, 1.6, glass(spec.color, true));
      place(face, 0.8, glass(spec.color, false));
      group.rotation.z = spec.tilt;
      root.add(group);

      return { group, spec, phase: index * 1.7, spin: 0, angle: 0, squash: 0 };
    });
  }

  // Размер видимой области на глубине 0 — от него места и масштаб объектов.
  let view = { width: 1, height: 1 };
  function layout() {
    const height = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view = { width: height * camera.aspect, height };
    for (const item of objects) {
      const rows = item.spec.map.length;
      const size = (narrow ? 0.15 : 0.2) * Math.min(view.height, view.width * (narrow ? 1.6 : 1));
      item.group.userData.base = size / rows;
    }
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 768 ? 1.5 : 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const nextNarrow = width / height < 0.9;
    if (nextNarrow !== narrow || objects.length === 0) {
      narrow = nextNarrow;
      build(narrow ? NARROW : WIDE);
    }
    layout();
    if (!running) render(clock.elapsedTime);
  }

  const pointerTarget = new THREE.Vector2();
  const pointerNow = new THREE.Vector2();
  let scrollProgress = 0;

  function render(time: number) {
    pointerNow.lerp(pointerTarget, reducedMotion ? 1 : 0.06);
    root.rotation.y = pointerNow.x * 0.22;
    root.rotation.x = -pointerNow.y * 0.12;

    for (const item of objects) {
      const [nx, ny] = item.spec.at;
      const spread = 1 + scrollProgress * 0.7;
      const depth = item.spec.z;
      item.group.position.set(
        (nx * view.width * 0.5 * 0.9 - pointerNow.x * depth * 0.35) * spread,
        (ny * view.height * 0.5 * 0.86 + pointerNow.y * depth * 0.25) * spread + scrollProgress * view.height * 0.25,
        depth,
      );
      const sway = reducedMotion ? 0 : Math.sin(time * 0.45 + item.phase) * 0.45;
      item.group.rotation.y = sway + item.angle + scrollProgress * 1.6;
      item.group.rotation.x = reducedMotion ? 0 : Math.cos(time * 0.35 + item.phase) * 0.12;
      if (!reducedMotion) item.group.position.y += Math.sin(time * 0.8 + item.phase) * 0.18;
      const bounce = 1 + Math.sin(item.squash * Math.PI) * 0.12;
      item.group.scale.setScalar((item.group.userData.base as number) * bounce);
    }
    renderer.render(scene, camera);
  }

  // Время сцены идёт, только пока она рисуется: после паузы объекты
  // продолжают с того же места, а не прыгают на пропущенные секунды.
  const clock = { elapsedTime: 0, last: 0 };
  let running = false;
  let frame = 0;

  function tick(now: number) {
    const delta = Math.min((now - clock.last) / 1000, 0.05);
    clock.last = now;
    clock.elapsedTime += delta;
    for (const item of objects) {
      item.angle += item.spin * delta;
      item.spin *= Math.pow(0.18, delta);
      item.squash = Math.max(0, item.squash - delta * 2.5);
    }
    render(clock.elapsedTime);
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    clock.last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frame);
  }

  const raycaster = new THREE.Raycaster();
  function poke(clientX: number, clientY: number): boolean {
    const rect = canvas.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects(root.children, true)[0];
    const index = hit?.object.userData.object as number | undefined;
    if (index === undefined) return false;
    const item = objects[index]!;
    item.spin += 9 * (point.x > 0 ? 1 : -1);
    item.squash = 1;
    if (!running) render(clock.elapsedTime);
    return true;
  }

  resize();

  return {
    start,
    stop,
    pointer(x, y) {
      pointerTarget.set(x, y);
      if (!running) render(clock.elapsedTime);
    },
    scroll(progress) {
      scrollProgress = progress;
      if (!running) render(clock.elapsedTime);
    },
    poke,
    resize,
    dispose() {
      stop();
      geometry.dispose();
      for (const material of materials) material.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
