export function positive_pixels(pixels: number): number {
  if (!Number.isFinite(pixels) || pixels <= 0)
    throw new Error("pixels must be a positive finite number.");
  return pixels;
}
