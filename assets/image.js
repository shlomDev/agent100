// Image helpers (browser only). Photos are shrunk on the phone before upload,
// so a page is ~200–400 KB instead of several MB.

export async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const dims = (src) => ({ w: src.width || src.naturalWidth, h: src.height || src.naturalHeight });

function canvasJpeg(canvas, quality) {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

// Whole page, longest side ≤ maxSide.
export function toJpeg(src, maxSide = 1600, quality = 0.82) {
  const { w, h } = dims(src);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return { ...canvasJpeg(c, quality), w: c.width, h: c.height };
}

// A horizontal strip around one handwritten line (y = row center, 0..1).
export function cropStrip(src, y, { band = 0.11, width = 900 } = {}) {
  const { w, h } = dims(src);
  const top = Math.max(0, Math.round((y - band / 2) * h));
  const height = Math.max(8, Math.min(h - top, Math.round(band * h)));
  const scale = width / w;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(8, Math.round(height * scale));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, top, w, height, 0, 0, c.width, c.height);
  return c;
}

// Small JPEG of a strip, for the on-phone handwriting memory.
export function stripJpeg(canvas, width = 560) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((canvas.height * width) / canvas.width);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return canvasJpeg(c, 0.7);
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
