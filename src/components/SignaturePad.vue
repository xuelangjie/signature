<template>
  <div class="canvas-wrap" :style="{ width: width + 'px', height: height + 'px' }">
    <canvas ref="canvasRef" :style="{ width: width + 'px', height: height + 'px', display: 'block' }"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import type { Signature, Stroke, Point } from '../utils/signature';

const { width, height, strokeColor, strokeWidth } = defineProps({
  width: { type: Number, default: 700 },
  height: { type: Number, default: 240 },
  strokeColor: { type: String, default: '#000' },
  strokeWidth: { type: Number, default: 2 }
} as const) as {
  width: number;
  height: number;
  strokeColor: string;
  strokeWidth: number;
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

let drawing = false;
let currentStroke: Stroke = [];
const strokes = ref<Signature>([]);

function getPos(e: PointerEvent) {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  return { x, y };
}

function resizeCanvas() {
  const canvas = canvasRef.value!;
  // set internal resolution using devicePixelRatio
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clearDrawingSurface();
}

function clearDrawingSurface() {
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'transparent';
}

function drawPoint(p: Point) {
  if (!ctx) return;
  ctx.fillStyle = strokeColor as string;
  ctx.beginPath();
  ctx.arc(p.x, p.y, (strokeWidth as number) / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLine(a: Point, b: Point) {
  if (!ctx) return;
  ctx.strokeStyle = strokeColor as string;
  ctx.lineWidth = strokeWidth as number;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function onPointerDown(e: PointerEvent) {
  if (!canvasRef.value) return;
  (e.target as Element).setPointerCapture(e.pointerId);
  drawing = true;
  currentStroke = [];
  const pos = getPos(e);
  const p: Point = { x: pos.x, y: pos.y, t: Date.now(), p: (e as any).pressure ?? 0.5 };
  currentStroke.push(p);
  drawPoint(p);
}

function onPointerMove(e: PointerEvent) {
  if (!drawing) return;
  const pos = getPos(e);
  const p: Point = { x: pos.x, y: pos.y, t: Date.now(), p: (e as any).pressure ?? 0.5 };
  const prev = currentStroke[currentStroke.length - 1];
  currentStroke.push(p);
  drawLine(prev, p);
}

function onPointerUp(e: PointerEvent) {
  if (!drawing) return;
  drawing = false;
  try { (e.target as Element).releasePointerCapture(e.pointerId); } catch (err) {}
  strokes.value.push(currentStroke.slice());
}

function clear() {
  strokes.value = [];
  currentStroke = [];
  clearDrawingSurface();
}

function getSignature(): Signature {
  return JSON.parse(JSON.stringify(strokes.value)); // deep copy
}

function getDataURL(type = 'image/png', quality?: any): string {
  const canvas = canvasRef.value!;
  return canvas.toDataURL(type, quality);
}

onMounted(() => {
  nextTick(() => {
    if (!canvasRef.value) return;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    const c = canvasRef.value;
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointermove', onPointerMove);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);
    c.addEventListener('pointerout', onPointerUp);
  });
});

onBeforeUnmount(() => {
  const c = canvasRef.value;
  if (c) {
    c.removeEventListener('pointerdown', onPointerDown);
    c.removeEventListener('pointermove', onPointerMove);
    c.removeEventListener('pointerup', onPointerUp);
    c.removeEventListener('pointercancel', onPointerUp);
    c.removeEventListener('pointerout', onPointerUp);
  }
  window.removeEventListener('resize', resizeCanvas);
});

defineExpose({ clear, getSignature, getDataURL });
</script>

<style scoped>
.canvas-wrap { background: white; }
</style>
