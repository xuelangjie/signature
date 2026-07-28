<template>
  <div class="app">
    <h2>手写签名姓名识别（Vue3 + TypeScript）</h2>
    <signature-pad ref="pad" :width="canvasW" :height="canvasH" />

    <div class="controls">
      <button class="btn" @click="onClear">清空</button>
      <button class="btn" @click="onExportImage">导出图片</button>
      <label style="margin-left:12px">目标姓名：<input v-model="targetName" placeholder="请输入要比对的姓名" /></label>
      <label style="margin-left:12px">识别语言：
        <select v-model="lang">
          <option value="eng">英文 (eng)</option>
          <option value="chi_sim">中文 (chi_sim)</option>
        </select>
      </label>
      <button class="btn primary" @click="onVerifyName" :disabled="recognizing">识别并比对</button>
    </div>

    <div class="info" style="margin-top:12px">
      <div v-if="recognizing">识别中：{{ (progress*100).toFixed(0) }}%</div>
      <div v-if="recognizedRaw">原始识别文本：{{ recognizedRaw }}</div>
      <div v-if="recognizedText">规范化：{{ recognizedText }}</div>
      <div v-if="sim !== null">相似度：{{ sim!.toFixed(3) }} -> {{ sim! >= acceptThreshold ? '匹配' : '不匹配' }}</div>
    </div>

    <div class="footer" style="margin-top:16px">
      说明：已移除旧的样本登记与相似度批量比对逻辑。当前为“指定姓名 -> 识别签名文本 -> 模糊匹配”的 POC（基于 Tesseract.js）。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SignaturePad from './components/SignaturePad.vue';
import { recognizeBlob, normalizeText, similarity } from './utils/ocr';

const pad = ref<any>(null);
const canvasW = ref<number>(Math.min(window.innerWidth - 40, 820));
const canvasH = ref<number>(220);

// OCR 状��
const targetName = ref<string>('');
const lang = ref<'eng' | 'chi_sim'>('eng');
const recognizing = ref(false);
const progress = ref(0);
const recognizedRaw = ref<string>('');
const recognizedText = ref<string>('');
const sim = ref<number | null>(null);
const acceptThreshold = 0.6; // 可调

function onClear() {
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
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const result = await recognizeBlob(blob, lang.value, (p: number) => { progress.value = p; });
    recognizedRaw.value = result.text;
    recognizedText.value = normalizeText(result.text);
    const targetNorm = normalizeText(target);
    sim.value = similarity(recognizedText.value, targetNorm);
    if (sim.value >= acceptThreshold) {
      alert(`识别: "${result.text.trim()}"\n匹配成功 (相似度 ${sim.value.toFixed(3)})`);
    } else {
      alert(`识别: "${result.text.trim()}"\n匹配失败 (相似度 ${sim.value.toFixed(3)})`);
    }
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
.controls { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; align-items:center }
.btn { padding:6px 10px; border-radius:6px; border:1px solid #888; background:white; cursor:pointer }
.btn.primary { background:#2b8bf2; color:white; border-color:#1670d4; }
.info { margin-top:8px; color:#333; }
</style>
