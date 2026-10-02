import * as THREE from "three";

import type { PixelMap } from "./pixel-maps";

/**
 * Стеклянный пиксельный объект брендбука: картинка, выдавленная кубиками.
 * Контур — плотное цветное стекло потолще, середина — почти прозрачная и
 * тоньше, как «желе» в брендбуке. Цвет проходящего света — цвет объекта.
 *
 * Кубики рисуются InstancedMesh: два меша на объект вместо сотен.
 */
function glass(color: string, rim: boolean): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
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
}

/**
 * Объект в кубиках размером 1: центр — в середине карты, y вверх. Размер на
 * сцене задаёт масштаб группы (высота объекта — `map.length` кубиков).
 */
export function glassObject(
  map: PixelMap,
  color: string,
  geometry: THREE.BufferGeometry,
): { group: THREE.Group; materials: THREE.Material[] } {
  const rows = map.length;
  const cols = Math.max(...map.map((row) => row.length));
  const filled = (x: number, y: number) => map[y]?.[x] === "#";
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
  const materials: THREE.Material[] = [];
  const matrix = new THREE.Matrix4();
  const place = (cells: [number, number][], depth: number, material: THREE.Material) => {
    materials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    cells.forEach(([x, y], i) => {
      matrix.compose(
        new THREE.Vector3(x - (cols - 1) / 2, (rows - 1) / 2 - y, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, depth),
      );
      mesh.setMatrixAt(i, matrix);
    });
    group.add(mesh);
  };
  place(rim, 1.6, glass(color, true));
  place(face, 0.8, glass(color, false));
  return { group, materials };
}
