/** Есть ли WebGL 2. Без него 3D-сцены заменяются картинками. */
export function webglAvailable(): boolean {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}
