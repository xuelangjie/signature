<template>
  <div class="app">
    <h2>手写签名（Vue3 + TypeScript）</h2>
    <signature-pad ref="pad" :width="canvasW" :height="canvasH" />

    <div class="controls">
      <button class="btn" @click="onClear">清空</button>
      <button class="btn primary" @click="onEnroll">注册样本</button>
      <button class="btn" @click="onVerify">验证一次（旧流程）</button>
      <button class="btn" @click="onExportImage">导出图片</button>
      <button class="btn" @click="onLoadSaved">载入已保存</button>
      <button class="btn" @click="onResetAll">重置所有注册</button>
    </div>

    <hr />

    <div>
      <label>目标姓名：<input v-model="targetName" placeholder="请输入要比对的姓名" /></label>
      <label style="margin-left:12px">识别语言：
        <select v-model="lang">
          <option value="eng">英文 (eng)</option>
          <option value="chi_sim">中文 (chi_sim)</option>
        </select>
      </label>
      <button class="btn primary" @click="onVerifyName" :disabled="recognizing">识别并比对</button>
      <span style="margin-left:12px;color:#666">(方案 A: 浏览器端 Tesseract.js OCR POC)</span>
    </div>

    <div class="info" style="margin-top:8px">
      <div>已登记样本：{{ enrollments.length }}</div>
      <div v-if="thresholdInfo">阈值: {{ thresholdInfo.threshold.toFixed(4) }}（mean {{ thresholdInfo.mean.toFixed(4) }} std {{ thresholdInfo.std.toFixed(4) }})</div>
      <div v-if="lastResult">上次比对: 距离 {{ lastResult.toFixed(4) }} -> {{ lastAccept ? '验签通过' : '验签失败' }}</div>
    </div>

    <div class="info" style="margin-top:12px">
      <div><strong>OCR 识别结果</strong></div>
      <div v-if="recognizing">识别中：{{ (progress*100).toFixed(0) }}%</div>
      <div v-if="recognizedRaw">原始文本：{{ recognizedRaw }}</div>
      <div v-if="recognizedText">规范化：{{ recognizedText }}</div>
      <div v-if="sim !== null">相似度：{{ sim!.toFixed(3) }} -> {{ sim! >= acceptThreshold ? '匹配' : '不匹配' }}</div>
    </div>

    <div class="footer">
      提示：Tesseract.js 为浏览器端 OCR，适合 POC。花体签名/连笔识别效果有限，生产环境请考虑服务端或更强的 HTR 模型。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SignaturePad from './components/SignaturePad.vue';
import type { Signature } from './utils/signature';
import { compareSignatures, computeThreshold } from './utils/signature';
import { recognizeBlob, normalizeText, similarity } from './utils/ocr';

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

// --- OCR 对姓名比对的 POC ---
const targetName = ref<string>('');
const lang = ref<'eng' | 'chi_sim'>('eng');
const recognizing = ref(false);
const progress = ref(0);
const recognizedRaw = ref<string>('');
const recognizedText = ref<string>('');
const sim = ref<number | null>(null);
const acceptThreshold = 0.6; // 可调

async function onVerifyName() {
  const target = targetName.value.trim();
  if (!target) { alert('请输入目标姓名'); return; }
  const dataUrl = pad.value?.getDataURL();
  if (!dataUrl) { alert('画布为空'); return; }

  recognizing.value = true;
  progress.value = 0;
  recognizedRaw.value = '';
  recognizedText.value = '';
  sim.value = null;

  try {
    // convert dataURL to blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const result = await recognizeBlob(blob, lang.value, (p: number) => { progress.value = p; });
    recognizedRaw.value = result.text;
    recognizedText.value = normalizeText(result.text);
    const targetNorm = normalizeText(target);
    sim.value = similarity(recognizedText.value, targetNorm);
  } catch (err) {
    console.error(err);
    alert('识别失败，请检查网络或稍后再试');
  } finally {
    recognizing.value = false;
    pad.value?.clear();
  }
}
</script>

<style scoped>
h2 { margin: 0 0 8px 0; }
.controls { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
</style>
