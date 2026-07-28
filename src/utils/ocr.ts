import { createWorker } from 'tesseract.js';

export function normalizeText(s: string) {
  return s
    .normalize('NFD')
    .replace(/[00-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const A = a.split(''), B = b.split('');
  const n = A.length, m = B.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[n][m];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - d / maxLen;
}

// recognizeBlob: wraps Tesseract.js recognition and reports progress 0..1
export async function recognizeBlob(blob: Blob, lang: string = 'eng', onProgress?: (p: number) => void): Promise<{ text: string }> {
  const worker = createWorker({
    logger: (m: any) => {
      if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress && onProgress(m.progress);
      }
    }
  });
  await worker.load();
  // load language; Tesseract will fetch language file from CDN, may take time
  try {
    await worker.loadLanguage(lang);
    await worker.initialize(lang);
  } catch (err) {
    // if language load fails, fallback to eng
    if (lang !== 'eng') {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
    }
  }
  const { data } = await worker.recognize(blob);
  await worker.terminate();
  return { text: data.text };
}
