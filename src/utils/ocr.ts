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
  let maybeWorker = createWorker();
  const worker = maybeWorker instanceof Promise ? await maybeWorker : maybeWorker;

  // debug
  console.debug('DEBUG: maybeWorker', maybeWorker, 'worker', worker);

  if (!worker || typeof worker.load !== 'function') {
    console.error('DEBUG: unexpected worker object:', worker);
    throw new Error('Unexpected Tesseract worker object — worker.load not a function. Check tesseract.js version/import.');
  }

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
