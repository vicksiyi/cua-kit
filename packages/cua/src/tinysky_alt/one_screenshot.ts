export function one_screenshot<T>(
  screenshots: T[],
  windowId: number,
): T | undefined {
  if (screenshots.length > 1)
    throw new Error(
      `Window ${windowId} has multiple screenshot regions; a single screenshot is unavailable.`,
    );
  return screenshots[0];
}
