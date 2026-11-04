import {
  createFaviconBadgeDom,
  createContentMessageInitializer,
} from "./favicon_badge_dom";
import { createOverlayController } from "./overlay_controller";
import { createOverlayRoot } from "./overlay_root";

/** Original Un/Q/Dn composition, one set of module state per content-script instance. */
export function createCodexContent(host: {
  document: Document;
  window: Window;
  chrome: typeof chrome;
  HTMLDivElement: typeof HTMLDivElement;
  MutationObserver: typeof MutationObserver;
  setTimeout: typeof globalThis.setTimeout;
}) {
  const overlay = createOverlayRoot({
    document: host.document,
    HTMLDivElement: host.HTMLDivElement,
    MutationObserver: host.MutationObserver,
    render: createOverlayController(host),
  });
  const badges = createFaviconBadgeDom(host);
  const initialize = createContentMessageInitializer({
    chrome: host.chrome,
    ensureOverlay: overlay.ensure,
    badges,
  });
  return { initialize, overlay };
}
