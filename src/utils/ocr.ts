import * as TesseractNS from 'tesseract.js';

// Try to locate createWorker in various export layouts
const createWorkerFn: (() => any) | null =
  (TesseractNS as any).createWorker
  || ((TesseractNS as any).default && (TesseractNS as any).default.createWorker)
  || ((TesseractNS as any).default && typeof (TesseractNS as any).default === 'function' ? (TesseractNS as any).default : null);

// normalizeText, levenshtein, similarity are always available
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

// recognizeBlob implementation — choose at runtime based on createWorker availability
export let recognizeBlob: (blob: Blob, lang?: string, onProgress?: (p: number) => void) => Promise<{ text: string }>;

if (!createWorkerFn) {
  recognizeBlob = async () => {
    throw new Error(
      'Tesseract.createWorker() not found. Possible causes: tesseract.js import failed or incompatible package version. ' +
      "请确保已安装 tesseract.js@^4.2.1，并重启开发服务器。"
    );
  };
} else {
  const createWorker = createWorkerFn;

  recognizeBlob = async (blob: Blob, lang: string = 'eng', onProgress?: (p: number) => void) => {
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
  };
}
