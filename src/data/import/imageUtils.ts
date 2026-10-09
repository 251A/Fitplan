// Browser-only helpers: screenshots and PDF pages → JPEG base64 ready for Claude vision.

import type { PageImage } from './screenshotImporter';

/** Long edge cap: keeps text legible while staying well under the API image limits. */
const MAX_EDGE = 2000;

export interface PreparedImage extends PageImage {
  /** Object URL for thumbnails on the review screen. */
  previewUrl: string;
  label: string;
}

function canvasToImage(canvas: HTMLCanvasElement, label: string): PreparedImage {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl, label };
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function imageFileToPage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    return canvasToImage(drawScaled(bitmap, bitmap.width, bitmap.height), file.name);
  } finally {
    bitmap.close();
  }
}

async function pdfToPages(file: File): Promise<PreparedImage[]> {
  // Loaded on demand: pdf.js is only needed when a PDF is chosen.
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PreparedImage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_EDGE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    out.push(canvasToImage(canvas, `${file.name} · pág. ${n}`));
  }
  await doc.destroy();
  return out;
}

/** Expands the chosen files (images and/or PDFs) into page images, keeping the chosen order. */
export async function filesToPages(files: ReadonlyArray<File>): Promise<PreparedImage[]> {
  const out: PreparedImage[] = [];
  for (const f of files) {
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) out.push(...(await pdfToPages(f)));
    else out.push(await imageFileToPage(f));
  }
  return out;
}
