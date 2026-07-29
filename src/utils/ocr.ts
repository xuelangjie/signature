// src/utils/ocr.ts
// OCR utilities: normalizeText, levenshtein/similarity, and a robust recognizeBlob

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

// Robust recognizeBlob: supports multiple tesseract.js builds and worker shapes
export async function recognizeBlob(blob: Blob, lang: string = 'eng', onProgress?: (p: number) => void): Promise<{ text: string }> {
  // dynamic import to avoid packaging interop issues
  let TesseractMod: any;
  try {
    TesseractMod = await import('tesseract.js');
  } catch (err) {
    console.warn('Failed to dynamic import tesseract.js:', err);
    // Try window fallback
    TesseractMod = (window as any).Tesseract ? (window as any) : null;
  }

  const T = (TesseractMod && (TesseractMod.default || TesseractMod)) || (window as any).Tesseract || null;
  if (!T) {
    throw new Error('tesseract.js not available. Install tesseract.js@^4.2.1 or include the CDN build.');
  }

  // logger for high-level recognize; DO NOT pass logger into worker factory (not cloneable)
  const logger = (m: any) => {
    if (m && typeof m.progress === 'number') {
      onProgress && onProgress(m.progress);
    }
  };

  // Candidates to obtain a worker or worker-like object
  const candidates: Array<any> = [
    (T as any).createWorker,
    (T as any).default && (T as any).default.createWorker,
    typeof T === 'function' ? T : null,
    T,
  ];

  let workerFactory: any = null;
  for (const c of candidates) {
    if (!c) continue;
    // If c itself is a factory function that when called produces a worker, pick it
    if (typeof c === 'function') {
      workerFactory = c;
      break;
    }
    // If c is an object with createWorker, pick that method
    if (typeof c === 'object' && typeof c.createWorker === 'function') {
      workerFactory = () => c.createWorker();
      break;
    }
  }

  // If no factory, try high-level recognize directly
  const highLevelRecognize = (T as any).recognize || (TesseractMod as any)?.recognize || null;

  if (!workerFactory && !highLevelRecognize) {
    throw new Error('No tesseract createWorker factory or recognize function found on module.');
  }

  // Try worker-style flow if we have a factory
  if (workerFactory) {
    let maybeWorker: any;
    try {
      maybeWorker = workerFactory();
    } catch (e) {
      // some factories may still return a Promise, attempt to call and await
      maybeWorker = workerFactory();
    }

    const worker = maybeWorker instanceof Promise ? await maybeWorker : maybeWorker;
    console.debug('DEBUG: createWorker returned', maybeWorker, '=> worker', worker);

    // If worker has classic API
    if (worker && typeof worker.load === 'function' && typeof worker.loadLanguage === 'function' && typeof worker.initialize === 'function') {
      try {
        await worker.load();
        onProgress && onProgress(0.2);

        try {
          await worker.loadLanguage(lang);
          await worker.initialize(lang);
        } catch (err: any) {
          console.warn('language load/init failed:', err?.message || err);
          if (lang !== 'eng') {
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
          } else {
            throw err;
          }
        }

        onProgress && onProgress(0.6);
        const { data } = await worker.recognize(blob);
        onProgress && onProgress(1);
        await worker.terminate();
        return { text: data?.text ?? '' };
      } catch (err: any) {
        try { if (worker.terminate) await worker.terminate(); } catch (_e) {}
        console.error('Worker API error:', err);
        throw new Error(`Tesseract worker recognition failed: ${err?.message || String(err)}`);
      }
    }

    // If worker only exposes recognize (some builds), use it
    if (worker && typeof worker.recognize === 'function') {
      try {
        // IMPORTANT: do NOT pass a function (logger) here — it may be cloned to the worker and cause DataCloneError.
        const res = await worker.recognize(blob); // <-- no { logger } here
        const text = res?.data?.text ?? res?.text ?? res ?? '';
        try { if (worker.terminate) await worker.terminate(); } catch (_e) {}
        return { text: String(text) };
      } catch (err: any) {
        try { if (worker.terminate) await worker.terminate(); } catch (_e) {}
        const msg = String(err?.message || err);
        console.error('worker.recognize error:', err);
        if (msg.includes('DataCloneError') || msg.includes('postMessage')) {
          console.warn('Detected DataCloneError when calling worker.recognize — falling back to high-level Tesseract.recognize()');
          // fall through to high-level fallback
        } else {
          // not a clone error, rethrow
          throw err;
        }
      }
    }
  }

  // Fallback: high-level recognize API
  if (typeof highLevelRecognize === 'function') {
    try {
      const res = await highLevelRecognize(blob, lang, { logger });
      const text = res?.data?.text ?? res?.text ?? '';
      return { text: String(text) };
    } catch (err: any) {
      console.error('high-level recognize error:', err);
      throw new Error(`Tesseract recognition failed (fallback): ${err?.message || String(err)}`);
    }
  }

  throw new Error('No suitable Tesseract API available to perform recognition.');
}
