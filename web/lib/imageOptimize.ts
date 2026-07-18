// Client-side image optimizer — downscale + re-compress a user-selected image
// in the browser BEFORE it is uploaded, so we ship far fewer bytes to the API
// and S3. Ported from the standalone newsletter-builder tool. Bridge copy:
// consolidates to @matthewdbaldwin/microport-ui/imageOptimize once v0.34.0 ships.
//
// Contract: optimizeImageForUpload NEVER throws and NEVER makes things worse.
// Non-image, SSR context, decode failure, timeout, or an unhelpful re-encode
// all resolve to the ORIGINAL file unchanged.

export const MAX_IMG_DIM = 1920;
export const JPEG_QUALITY = 0.82;
export const OPTIMIZE_TIMEOUT_MS = 10_000;

export function computeTargetDimensions(
  w: number,
  h: number,
  maxDim = MAX_IMG_DIM,
): { width: number; height: number } {
  if (w <= 0 || h <= 0) return { width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) };
  if (w <= maxDim && h <= maxDim) return { width: w, height: h };
  const ratio = Math.min(maxDim / w, maxDim / h);
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
}

export interface OutputFormat { mime: string; ext: string; }

export function chooseOutputFormat(opts: {
  srcMime: string;
  hasAlpha: boolean;
  downscaled: boolean;
}): OutputFormat {
  const { srcMime, hasAlpha, downscaled } = opts;
  if (hasAlpha) return { mime: 'image/png', ext: 'png' };
  if (srcMime === 'image/gif') return { mime: 'image/gif', ext: 'gif' };
  if (srcMime === 'image/png' && !downscaled) return { mime: 'image/png', ext: 'png' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

export function replaceExtension(filename: string, ext: string): string {
  return `${filename.replace(/\.[^./\\]+$/, '')}.${ext}`;
}

function isBrowserImageContext(): boolean {
  return typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof Image !== 'undefined';
}

export interface OptimizeOptions { maxDim?: number; quality?: number; timeoutMs?: number; }

export function optimizeImageForUpload(file: File, opts: OptimizeOptions = {}): Promise<File> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file);
  if (!isBrowserImageContext()) return Promise.resolve(file);

  const maxDim = opts.maxDim ?? MAX_IMG_DIM;
  const quality = opts.quality ?? JPEG_QUALITY;
  const timeoutMs = opts.timeoutMs ?? OPTIMIZE_TIMEOUT_MS;

  return new Promise<File>((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: File) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish(file), timeoutMs);

    const img = new Image();
    img.onerror = () => finish(file);
    img.onload = () => {
      try {
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        if (!w || !h) return finish(file);

        const { width, height } = computeTargetDimensions(w, h, maxDim);
        const downscaled = width < w || height < h;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(file);
        ctx.drawImage(img, 0, 0, width, height);

        let hasAlpha = false;
        if (file.type === 'image/png') {
          try {
            const data = ctx.getImageData(0, 0, width, height).data;
            for (let i = 3; i < data.length; i += 4) {
              if ((data[i] ?? 255) < 250) { hasAlpha = true; break; }
            }
          } catch { /* tainted canvas — assume opaque */ }
        }

        const fmt = chooseOutputFormat({ srcMime: file.type, hasAlpha, downscaled });
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) return finish(file);
            finish(new File([blob], replaceExtension(file.name, fmt.ext), {
              type: fmt.mime,
              lastModified: file.lastModified,
            }));
          },
          fmt.mime,
          quality,
        );
      } catch {
        finish(file);
      }
    };
    img.src = url;
  });
}
