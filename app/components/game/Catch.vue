<script setup lang="ts">
import { createCatch, ITEM_SIZE, PLAYER_WIDTH, PLAYER_Y, POINTS, stepCatch, type ItemKind } from "~/games/catch";
import { seeded } from "~/games/rng";
import { CATCH_SECONDS } from "~~/lib/games/rules";

/**
 * «Лови»: маскот внизу ловит стеклянные объекты, тёмные молнии отнимают
 * очки. Ведётся пальцем или мышью по полю, стрелками — с клавиатуры.
 * Вкладку спрятали — пауза: время партии игровое и на паузе не идёт.
 */
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

const SPRITES: Record<ItemKind | "player", string> = {
  heart: "/brand/objects/heart-pixel.webp",
  asterisk: "/brand/objects/asterisk-glass.webp",
  moon: "/brand/objects/moon-glass.webp",
  // Звёздочка — из JPG с белым фоном: рисуем умножением, белое пропадает.
  star: "/brand/objects/star-glass.webp",
  bolt: "/brand/objects/lightning-pixel.webp",
  player: "/brand/mascots/green.webp",
};

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const phase = ref<"loading" | "ready" | "playing" | "paused" | "over">("loading");
const score = ref(0);
const left = ref(CATCH_SECONDS);
const shaking = ref(false);

let state = createCatch();
const rng = seeded(Date.now());
let target = 0.5;
const held = { left: false, right: false };
const images: Partial<Record<keyof typeof SPRITES, HTMLImageElement>> = {};
let popups: { x: number; y: number; text: string; good: boolean; life: number }[] = [];
let frame = 0;
let last = 0;
let size = { width: 0, height: 0, ratio: 1 };

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function resize() {
  const width = box.value?.clientWidth ?? 0;
  if (!width || !canvas.value) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  size = { width, height: Math.round((width * 4) / 3), ratio };
  canvas.value.width = Math.round(width * ratio);
  canvas.value.height = Math.round(size.height * ratio);
  draw();
}

function sprite(context: CanvasRenderingContext2D, image: HTMLImageElement | undefined, box: number) {
  if (!image) return;
  const scale = box / Math.max(image.width, image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  context.drawImage(image, -w / 2, -h / 2, w, h);
}

function draw() {
  const context = canvas.value?.getContext("2d");
  if (!context) return;
  const { width: W, height: H, ratio } = size;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#fdfdfb";
  context.fillRect(0, 0, W, H);

  // Пиксельная сетка — как стеклянная плитка брендбука, едва заметно.
  context.strokeStyle = "#ecece7";
  context.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    context.beginPath();
    context.moveTo((W / 6) * i, 0);
    context.lineTo((W / 6) * i, H);
    context.stroke();
  }

  for (const item of state.items) {
    context.save();
    context.translate(item.x * W, item.y * H);
    context.rotate(item.spin * state.time);
    if (item.kind === "star") context.globalCompositeOperation = "multiply";
    sprite(context, images[item.kind], ITEM_SIZE * W * (item.kind === "bolt" ? 1.1 : 1));
    context.restore();
  }

  context.save();
  context.translate(state.player * W, PLAYER_Y * H);
  sprite(context, images.player, PLAYER_WIDTH * W * 1.25);
  context.restore();

  context.font = `700 ${Math.round(W * 0.06)}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  for (const popup of popups) {
    context.globalAlpha = Math.max(0, popup.life);
    context.fillStyle = popup.good ? "#0f7a08" : "#d40000";
    context.fillText(popup.text, popup.x * W, (popup.y - (1 - popup.life) * 0.08) * H);
  }
  context.globalAlpha = 1;
}

function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (held.left !== held.right) target = state.player + (held.left ? -0.5 : 0.5);

  const step = stepCatch(state, dt, target, rng);
  state = step.state;
  for (const kind of step.events) {
    const points = POINTS[kind];
    popups.push({ x: state.player, y: PLAYER_Y - 0.06, text: points > 0 ? `+${points}` : `−${-points}`, good: points > 0, life: 1 });
    if (points < 0) {
      haptic("error");
      shaking.value = true;
      setTimeout(() => (shaking.value = false), 300);
    } else {
      haptic("tap");
    }
  }
  popups = popups.map((popup) => ({ ...popup, life: popup.life - dt * 1.6 })).filter((popup) => popup.life > 0);

  score.value = state.score;
  left.value = Math.ceil(CATCH_SECONDS - state.time);
  draw();

  if (state.over) {
    phase.value = "over";
    haptic("success");
    emit("finished", { score: state.score, durationMs: Math.round(state.time * 1000) });
    return;
  }
  frame = requestAnimationFrame(loop);
}

function play() {
  if (phase.value !== "ready" && phase.value !== "paused") return;
  phase.value = "playing";
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

function pause() {
  if (phase.value !== "playing") return;
  cancelAnimationFrame(frame);
  phase.value = "paused";
}

function aim(event: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  target = (event.clientX - rect.left) / rect.width;
}

function onPointerDown(event: PointerEvent) {
  aim(event);
  play();
}

function onKey(event: KeyboardEvent, down: boolean) {
  if (event.key === "ArrowLeft") held.left = down;
  else if (event.key === "ArrowRight") held.right = down;
  else if (down && (event.key === " " || event.key === "Enter") && phase.value !== "playing") play();
  else return;
  event.preventDefault();
}
const keyDown = (event: KeyboardEvent) => onKey(event, true);
const keyUp = (event: KeyboardEvent) => onKey(event, false);
const onVisibility = () => document.hidden && pause();

let observer: ResizeObserver | null = null;
onMounted(async () => {
  await Promise.all(
    Object.entries(SPRITES).map(async ([key, src]) => {
      images[key as keyof typeof SPRITES] = await load(src).catch(() => undefined as unknown as HTMLImageElement);
    }),
  );
  observer = new ResizeObserver(resize);
  observer.observe(box.value!);
  resize();
  phase.value = "ready";
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", onVisibility);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("keyup", keyUp);
  window.removeEventListener("blur", pause);
  document.removeEventListener("visibilitychange", onVisibility);
});

const LEGEND = [
  { src: SPRITES.heart, text: "+1" },
  { src: SPRITES.star, text: "+3", multiply: true },
  { src: SPRITES.bolt, text: "−3" },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Очки: <strong class="tabular-nums">{{ score }}</strong></span>
      <span>Осталось: <strong class="tabular-nums">{{ left }} с</strong></span>
    </div>

    <!-- Поле целиком на экране: ширина ограничена и высотой окна (поле 3:4). -->
    <div
      ref="box"
      class="relative mx-auto w-full max-w-[min(24rem,calc((100svh_-_16.5rem)*0.75))] min-w-60"
      :class="{ shake: shaking }"
    >
      <canvas
        ref="canvas"
        class="border-ink/10 block w-full touch-none rounded-3xl border select-none"
        :style="{ aspectRatio: '3 / 4' }"
        aria-label="Поле игры «Лови»: ведите маскота пальцем, мышью или стрелками"
        role="img"
        @pointerdown="onPointerDown"
        @pointermove="aim"
      />

      <div
        v-if="phase === 'ready' || phase === 'paused' || phase === 'loading'"
        class="bg-paper/85 absolute inset-0 grid place-items-center rounded-3xl p-6 text-center backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-4">
          <p class="font-display text-2xl">{{ phase === "paused" ? "Пауза" : "Лови!" }}</p>
          <p class="text-ink-soft max-w-[26ch]">
            Ведите маскота пальцем, мышью или стрелками. {{ CATCH_SECONDS }}&nbsp;секунд.
          </p>
          <ul class="flex gap-4">
            <li v-for="item in LEGEND" :key="item.text" class="flex flex-col items-center gap-1 text-sm font-semibold">
              <img :src="item.src" alt="" class="size-10 object-contain" :class="{ 'mix-blend-multiply': item.multiply }">
              {{ item.text }}
            </li>
          </ul>
          <div class="w-48">
            <UiButton :disabled="phase === 'loading'" @click="play">
              {{ phase === "paused" ? "Продолжить" : "Начать" }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .shake {
    animation: shake 0.3s ease-in-out;
  }
}

@keyframes shake {
  25% {
    transform: translateX(-6px);
  }
  75% {
    transform: translateX(6px);
  }
}
</style>
