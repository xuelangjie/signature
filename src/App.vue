<template>
  <div class="app">
    <h2>手写签名（Vue3 + TypeScript）</h2>
    <signature-pad ref="pad" :width="canvasW" :height="canvasH" />
    <div class="controls">
      <button class="btn" @click="onClear">清空</button>
      <button class="btn primary" @click="onEnroll">注册样本</button>
      <button class="btn" @click="onVerify">验证一次</button>
      <button class="btn" @click="onExportImage">导出图片</button>
      <button class="btn" @click="onLoadSaved">载入已保存</button>
      <button class="btn" @click="onResetAll">重置所有注册</button>
    </div>

    <div class="info">
      <div>已登记样本：{{ enrollments.length }}</div>
      <div v-if="thresholdInfo">阈值: {{ thresholdInfo.threshold.toFixed(4) }}（mean {{ thresholdInfo.mean.toFixed(4) }} std {{ thresholdInfo.std.toFixed(4) }})</div>
      <div v-if="lastResult">上次比对: 距离 {{ lastResult.toFixed(4) }} -> {{ lastAccept ? '验签通过' : '验签失败' }}</div>
    </div>

    <div class="footer">
      提示：建议至少采集 3~5 次注册样本以计算阈值。前端存储仅用于 Demo，生产环境建议将向量/模型放在服务端并做防篡改校验。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SignaturePad from './components/SignaturePad.vue';
import type { Signature } from './utils/signature';
import { compareSignatures, computeThreshold } from './utils/signature';

const pad = ref<any>(null);
const canvasW = ref<number>(Math.min(window.innerWidth - 40, 820));
const canvasH = ref<number>(220);

const enrollments = ref<Signature[]>([]);
const thresholdInfo = ref<{ threshold: number; mean: number; std: number } | null>(null);
const lastResult = ref<number | null>(null);
const lastAccept = ref<boolean | null>(null);

const STORAGE_KEY_ENROLL = 'sig_vue_enrollment_v1';
const STORAGE_KEY_THRESH = 'sig_vue_threshold_v1';

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_ENROLL, JSON.stringify(enrollments.value));
    localStorage.setItem(STORAGE_KEY_THRESH, JSON.stringify(thresholdInfo.value));
  } catch (err) {
    console.warn('保存本地失败', err);
  }
}

function onClear() {
  pad.value?.clear();
}

function onEnroll() {
  const sig = pad.value?.getSignature() as Signature | undefined;
  if (!sig || sig.flat().length === 0) {
    alert('请先签名再点 注册');
    return;
  }
  enrollments.value.push(sig);
  pad.value?.clear();
  // 计算阈值（当样本 >= 2 时）
  const info = computeThreshold(enrollments.value, 2.0);
  thresholdInfo.value = info;
  saveToStorage();
  alert('已登记样本数: ' + enrollments.value.length);
}

function onVerify() {
  const sig = pad.value?.getSignature() as Signature | undefined;
  if (!sig || sig.flat().length === 0) {
    alert('请先签名再点 验证');
    return;
  }
  if (enrollments.value.length === 0) {
    alert('尚未登记样本，请先登记 3 次以上样本以便计算阈值');
    return;
  }
  const dists = enrollments.value.map(s => compareSignatures(s, sig));
  const best = Math.min(...dists);
  lastResult.value = best;
  const accept = thresholdInfo.value ? (best <= thresholdInfo.value.threshold) : (best < 0.05);
  lastAccept.value = accept;
  alert(`距离 ${best.toFixed(4)} -> ${accept ? '验签通过' : '验签失败'}`);
  pad.value?.clear();
}

function onExportImage() {
  const data = pad.value?.getDataURL();
  if (!data) { alert('画布为空'); return; }
  const a = document.createElement('a');
  a.href = data;
  a.download = 'signature.png';
  a.click();
}

function onLoadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENROLL);
    const t = localStorage.getItem(STORAGE_KEY_THRESH);
    if (raw) enrollments.value = JSON.parse(raw);
    if (t) thresholdInfo.value = JSON.parse(t);
    alert(`已加载：${enrollments.value.length} 个注册样本`);
  } catch (err) {
    console.warn(err);
    alert('加载失败');
  }
}

function onResetAll() {
  if (!confirm('确认要清除所有注册样本与阈值？')) return;
  enrollments.value = [];
  thresholdInfo.value = null;
  localStorage.removeItem(STORAGE_KEY_ENROLL);
  localStorage.removeItem(STORAGE_KEY_THRESH);
  alert('已清除');
}
</script>

<style scoped>
h2 { margin: 0 0 8px 0; }
</style>
