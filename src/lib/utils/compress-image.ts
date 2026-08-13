/**
 * Client-side downscale/compress for Custom Action proof photos, run before
 * upload so we never add a server-side image library (sharp, etc.) just for
 * this. Proof photos are informational only, so aggressive downscaling is
 * fine — this is not evidence that needs full resolution. Browser-only
 * (uses HTMLImageElement + canvas); never import this from a server file.
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
  if (!blob) return file;

  const extension = outputType === "image/png" ? "png" : "jpg";
  const name = file.name.replace(/\.\w+$/, "") || "proof";
  return new File([blob], `${name}.${extension}`, { type: outputType });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
