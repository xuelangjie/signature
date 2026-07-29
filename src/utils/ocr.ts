// src/utils/ocr.ts
// Use dynamic import for tesseract.js to avoid bundler/ESM/CJS interop issues.

export const normalizeText = (s: string) => {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    .trim();
};

export const levenshtein = (a: string, b: string): number => {
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
};

export const similarity = (a: string, b: string): number => {
  if (!a && !b) return 1;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - d / maxLen;
};

export async function recognizeBlob(blob: Blob, lang: string = 'eng', onProgress?: (p: number) => void): Promise<{ text: string }> {
  // Dynamically import to avoid packaging issues where createWorker isn't found at module init.
  const TesseractMod = await import('tesseract.js');
  // prefer named export, fallback to default.createWorker or default itself
  const createWorkerCandidate = (TesseractMod as any).createWorker
    || ((TesseractMod as any).default && (TesseractMod as any).default.createWorker)
    || ((TesseractMod as any).default && typeof (TesseractMod as any).default === 'function' ? (TesseractMod as any).default : null);

  if (!createWorkerCandidate) {
    throw new Error('Tesseract.createWorker() not found after dynamic import. Ensure tesseract.js is installed (try npm install tesseract.js@^4.2.1)');
  }

  const createWorker = createWorkerCandidate;
  const worker = createWorker();

  try {
    await worker.load();
    onProgress && onProgress(0.2);

    try {
      await worker.loadLanguage(lang);
      await worker.initialize(lang);
    } catch (err: any) {
      console.warn(`Failed to load language ${lang}:`, err?.message || err);
      if (lang !== 'eng') {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
      } else {
        throw new Error(`Failed to initialize Tesseract language eng: ${err?.message || err}`);
      }
    }

    onProgress && onProgress(0.6);
    const { data } = await worker.recognize(blob);
    onProgress && onProgress(1);

    await worker.terminate();
    return { text: data.text };
  } catch (err: any) {
    try { await worker.terminate(); } catch (_) {}
    const msg = err?.message ? String(err.message) : String(err);
    throw new Error(`Tesseract recognition failed: ${msg}`);
  }
}
