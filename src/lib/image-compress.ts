/**
 * Client-side image compression for uploads.
 *
 * Vercel's serverless platform rejects request bodies larger than ~4.5 MB
 * with a plain-text "Request entity too large" 413 — long before the route
 * handler can read the file. Phone photos regularly exceed that, so we
 * downscale + re-encode images in the browser first. Schedule photos only
 * need to stay legible for the AI reader, so 2000 px at ~82% JPEG quality is
 * more than enough and typically lands well under 1 MB.
 */

const SOFT_LIMIT_BYTES = 3.5 * 1024 * 1024;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Animated GIFs can't be re-encoded without losing their animation, and
  // very small files gain nothing from re-encoding.
  if (file.type === "image/gif") return file;
  if (file.size <= SOFT_LIMIT_BYTES) return file;

  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;

  const fromBitmap = typeof createImageBitmap === "function";
  if (fromBitmap) {
    try {
      source = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return file;
    }
    width = source.width;
    height = source.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image decode failed"));
      });
      source = img;
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
    } catch {
      URL.revokeObjectURL(url);
      return file;
    }
    URL.revokeObjectURL(url);
  }

  try {
    if (width <= 0 || height <= 0) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outWidth, outHeight);
    ctx.drawImage(source, 0, 0, outWidth, outHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) return file;
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    if (fromBitmap && "close" in source) {
      (source as ImageBitmap).close();
    }
  }
}
