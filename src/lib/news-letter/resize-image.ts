'use client';

/**
 * Shrinks and re-encodes an image in the browser before it is uploaded (owner 2026-11-06): smaller uploads and
 * database rows, and re-drawing on a canvas drops the file's metadata and anything hidden in it. The server still checks
 * the real type and size of what arrives (image-sniff.ts) — this step is never trusted on its own.
 */

/** Header of an article: center-cropped to 16:7, 1600 px wide. */
export const HEADER_IMAGE = { width: 1600, aspect: 16 / 7 } as const;
/** Image in the article body: at most 1200 px wide, aspect kept. */
export const INLINE_IMAGE_MAX_WIDTH = 1200;

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const ACCEPTED_IMAGE_TYPES = [...ACCEPTED].join(',');

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function resizeImageFile(file: File, options: { kind: 'HEADER' | 'INLINE' }): Promise<Blob> {
  if (!ACCEPTED.has(file.type)) throw new Error('Chỉ nhận ảnh PNG, JPEG, WebP hoặc GIF.');
  const bitmap = await createImageBitmap(file);
  try {
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    let width: number;
    let height: number;
    if (options.kind === 'HEADER') {
      // Center crop to the header aspect, then scale (never up).
      if (sw / sh > HEADER_IMAGE.aspect) {
        const cropped = Math.round(sh * HEADER_IMAGE.aspect);
        sx = Math.round((sw - cropped) / 2);
        sw = cropped;
      } else {
        const cropped = Math.round(sw / HEADER_IMAGE.aspect);
        sy = Math.round((sh - cropped) / 2);
        sh = cropped;
      }
      width = Math.min(HEADER_IMAGE.width, sw);
      height = Math.round(width / HEADER_IMAGE.aspect);
    } else {
      width = Math.min(INLINE_IMAGE_MAX_WIDTH, sw);
      height = Math.round((sh * width) / sw);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt không xử lý được ảnh.');
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    // WebP where the browser can encode it, JPEG otherwise.
    const webp = await toBlob(canvas, 'image/webp', 0.85);
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
    if (!jpeg) throw new Error('Trình duyệt không xử lý được ảnh.');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

/** Resizes, then uploads → the image URL to put in the article. */
export async function uploadNewsLetterImageFile(file: File, kind: 'HEADER' | 'INLINE'): Promise<{ id: string; url: string }> {
  const blob = await resizeImageFile(file, { kind });
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', blob, blob.type === 'image/webp' ? 'image.webp' : 'image.jpg');
  const response = await fetch('/api/news-letter/images', { method: 'POST', body: form });
  const data = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
  if (!response.ok || !data.id || !data.url) throw new Error(data.error || 'Không thể tải ảnh lên.');
  return { id: data.id, url: data.url };
}
