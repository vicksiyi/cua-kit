import type { CursorAnimator } from "./overlay_controller";
import {
  advanceCursorMotion,
  createCursorMotionState,
  cursorMotionNeedsFrame,
  cursorThinkingRotation,
  moveCursorTo,
  resetCursorMotion,
  type CursorMotionState,
} from "./cursor_motion";
import {
  clampCursorValue,
  cursorDistance,
  wrapCursorAngle,
} from "./cursor_path";
import { resetCursorSpring, shortestAngleDelta } from "./cursor_spring";
export interface CursorAnimatorOptions {
  assetUrl: string;
  dataTestId?: string;
  glowColor: string;
  onArrived?(sequence: number): void;
}
function createCursorElements(
  document: Document,
  container: HTMLElement,
  options: CursorAnimatorOptions,
) {
  const { dataTestId: testId = "browser-agent-cursor" } = options;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.inset = "0";
  layer.style.overflow = "hidden";
  layer.style.pointerEvents = "none";
  layer.style.position = "absolute";
  layer.style.zIndex = "20";
  const cursor = document.createElement("div");
  cursor.dataset.testid = testId;
  cursor.style.height = "24px";
  cursor.style.left = "0";
  cursor.style.position = "absolute";
  cursor.style.top = "0";
  cursor.style.transformOrigin = "12px 12px";
  cursor.style.willChange = "transform";
  cursor.style.width = "24px";
  const offset = document.createElement("div");
  offset.style.transform = "translate3d(12px, -2.5px, 0)";
  const asset = document.createElement("img");
  asset.alt = "";
  asset.dataset.browserAgentCursorAsset = "";
  asset.dataset.testid = `${testId}-asset`;
  asset.draggable = false;
  asset.height = 24;
  asset.src = options.assetUrl;
  asset.style.display = "block";
  asset.style.setProperty(
    "--browser-agent-cursor-glow-color",
    options.glowColor,
  );
  asset.style.filter =
    "drop-shadow(0 0 6px color-mix(in srgb, var(--browser-agent-cursor-glow-color) 90%, transparent)) drop-shadow(0 0 15px color-mix(in srgb, var(--browser-agent-cursor-glow-color) 48%, transparent))";
  asset.style.transform = "rotate(44deg) scale(1)";
  asset.style.transformOrigin = "0 0";
  asset.width = 23;
  offset.appendChild(asset);
  cursor.appendChild(offset);
  layer.appendChild(cursor);
  container.appendChild(layer);
  return { cursor, layer };
}
function round(value: number): number {
  return Math.round(value * 1e3) / 1e3;
}
function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}
function paint(
  cursor: HTMLElement,
  state: CursorMotionState,
  timestamp: number,
): void {
  const rotation = cursorThinkingRotation(state, timestamp),
    visibility = clampCursorValue(state.visibilitySpring.value, 0, 1),
    scale = interpolate(0.4, 1, visibility),
    blur = interpolate(5, 0, visibility),
    scootStretch = clampCursorValue(state.scootStretchSpring.value, 0, 1),
    transforms = [
      `translate3d(${round(state.point.x - 12)}px, ${round(state.point.y - 12)}px, 0)`,
    ];
  if (
    Math.abs(shortestAngleDelta(0, state.scootAxisRotation)) > 0.001 ||
    Math.abs(scootStretch - 1) > 0.001
  )
    transforms.push(
      `rotate(${round(state.scootAxisRotation)}deg)`,
      `scale(1, ${round(scootStretch)})`,
      `rotate(${round(-state.scootAxisRotation)}deg)`,
    );
  transforms.push(
    `rotate(${round(wrapCursorAngle(rotation + state.scootRotationSpring.value))}deg)`,
    `scale(${round(state.stretchSpring.value * scale)}, ${round(scale)})`,
  );
  cursor.style.transform = transforms.join(" ");
  cursor.style.opacity = `${round(visibility)}`;
  cursor.style.filter = `blur(${round(blur)}px)`;
}
/** Original rn/sn/Z/Sn/yn/Cn/U/Mn/Tn. Host injection preserves browser scheduling. */
export function createCursorAnimator(
  host: {
    document: Document;
    window?: Window;
    performance?: Pick<Performance, "now">;
  },
  container: HTMLElement,
  options: CursorAnimatorOptions,
): CursorAnimator {
  const { document, window, performance } = host,
    now = () => (performance == null ? Date.now() : performance.now()),
    requestFrame = (callback: FrameRequestCallback): number => {
      if (window?.requestAnimationFrame != null)
        return window.requestAnimationFrame(callback);
      if (window != null)
        return window.setTimeout(() => callback(now()), (1 / 60) * 1e3);
      callback(now());
      return 0;
    },
    cancelFrame = (handle: number) => {
      if (window?.cancelAnimationFrame != null) {
        window.cancelAnimationFrame(handle);
        return;
      }
      window?.clearTimeout(handle);
    },
    elements = createCursorElements(document, container, options);
  let frame: number | null = null,
    lastTimestamp = now(),
    state: CursorMotionState | null = null,
    moveKey: string | null = null,
    sequence: number | null = null,
    thinkingTurn: string | null = null,
    arrivedKey: string | null = null,
    revealedTurn: string | null = null,
    firstFrame = false,
    destroyed = false;
  const arrived = () => {
    if (sequence == null || moveKey == null || arrivedKey === moveKey) return;
    arrivedKey = moveKey;
    options.onArrived?.(sequence);
  };
  const schedule = () => {
    if (frame != null || state == null || destroyed) return;
    frame = requestFrame((timestamp) => {
      frame = null;
      const current = state;
      if (current == null) return;
      const elapsed = firstFrame
        ? 1 / 60
        : Math.max(1 / 60, (timestamp - lastTimestamp) / 1e3);
      firstFrame = false;
      lastTimestamp = timestamp;
      const didArrive = advanceCursorMotion(current, elapsed, timestamp);
      paint(elements.cursor, current, now());
      if (didArrive) arrived();
      if (cursorMotionNeedsFrame(current)) schedule();
    });
  };
  return {
    destroy() {
      destroyed = true;
      if (frame != null) {
        cancelFrame(frame);
        frame = null;
      }
      elements.layer.remove();
    },
    setState(next) {
      const turn = next.turnKey ?? "",
        hasCursor = next.cursor != null,
        point = {
          x: clampCursorValue(
            next.cursor?.x ?? Math.round(next.viewportSize.width * 0.58),
            0,
            next.viewportSize.width,
          ),
          y: clampCursorValue(
            next.cursor?.y ?? Math.round(next.viewportSize.height * 0.55),
            0,
            next.viewportSize.height,
          ),
        },
        visible = next.isVisible !== false && next.cursor?.visible !== false,
        animate = next.cursor?.animateMovement !== false,
        thinking = visible && !hasCursor;
      sequence = next.cursor?.moveSequence ?? null;
      moveKey = sequence == null ? null : `${turn}:${sequence}`;
      if (state == null) state = createCursorMotionState(point, visible);
      state.visibilitySpring.target = visible ? 1 : 0;
      if (thinking && thinkingTurn !== turn) {
        thinkingTurn = turn;
        resetCursorSpring(state.visibilitySpring, 1);
        state.thinkStartedAt = now();
      }
      if (!hasCursor) {
        resetCursorMotion(state, point);
        paint(elements.cursor, state, now());
        schedule();
        return;
      }
      const reveal =
        next.cursor?.moveSequence != null &&
        visible &&
        state.visibilitySpring.value <= 0.001 &&
        revealedTurn !== turn;
      state.thinkStartedAt = null;
      const distance = cursorDistance(state.point, point);
      if (!animate || reveal || distance < 0.5) {
        if (reveal) {
          revealedTurn = turn;
          resetCursorSpring(state.visibilitySpring, 1);
        }
        resetCursorMotion(state, point);
        if (!animate) {
          state.stretchSpring.force = 0;
          state.stretchSpring.value = 1;
          state.stretchSpring.velocity = 0;
        }
        paint(elements.cursor, state, now());
        arrived();
        schedule();
        return;
      }
      moveCursorTo(state, point, next.viewportSize);
      firstFrame = true;
      paint(elements.cursor, state, now());
      schedule();
    },
  };
}
