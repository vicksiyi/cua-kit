export interface CursorState {
  animateMovement?: boolean;
  moveSequence?: number;
  visible: boolean;
  x: number;
  y: number;
}
export interface OverlayState {
  cursor: CursorState | null;
  isVisible: boolean;
  sessionId: string | null;
  turnId: string | null;
}
const emptyState: OverlayState = {
  cursor: null,
  isVisible: false,
  sessionId: null,
  turnId: null,
};
/** Original wn/qe; numeric coordinates must be finite, sequence only integer. */
export function parseCursorState(value: unknown): CursorState | null {
  if (!value || typeof value !== "object") return null;
  const cursor = value as any;
  if (
    typeof cursor.visible !== "boolean" ||
    typeof cursor.x !== "number" ||
    typeof cursor.y !== "number" ||
    !Number.isFinite(cursor.x) ||
    !Number.isFinite(cursor.y)
  )
    return null;
  return {
    ...(typeof cursor.animateMovement === "boolean"
      ? { animateMovement: cursor.animateMovement }
      : {}),
    ...(Number.isInteger(cursor.moveSequence)
      ? { moveSequence: cursor.moveSequence }
      : {}),
    visible: cursor.visible,
    x: cursor.x,
    y: cursor.y,
  };
}
export function parseOverlayState(value: unknown): OverlayState {
  if (!value || typeof value !== "object") return emptyState;
  const state = value as any,
    sessionId = typeof state.sessionId === "string" ? state.sessionId : null,
    turnId = typeof state.turnId === "string" ? state.turnId : null;
  return {
    cursor: parseCursorState(state.cursor),
    isVisible: state.isVisible === true && sessionId != null,
    sessionId,
    turnId,
  };
}
export interface CursorAnimator {
  setState(state: {
    cursor: CursorState | null;
    isVisible: boolean;
    turnKey: string | null;
    viewportSize: { height: number; width: number };
  }): void;
  destroy(): void;
}
/** Original Dn/Pn orchestration. rn animation engine remains a required dependency. */
export function createOverlayController(host: {
  document: Document;
  window: Window;
  chrome: typeof chrome;
  createAnimator(
    container: HTMLDivElement,
    options: {
      assetUrl: string;
      glowColor: string;
      onArrived(sequence: number): void;
    },
  ): CursorAnimator;
}) {
  const { document, window, chrome } = host;
  const topFrame = window.top === window.self;
  return function render(container: HTMLElement): () => void {
    let state = emptyState,
      animator: CursorAnimator | null = null,
      generation = 0;
    const element = document.createElement("div");
    element.className = "codex-agent-overlay";
    element.setAttribute("aria-hidden", "true");
    if (topFrame)
      animator = host.createAnimator(element, {
        assetUrl: chrome.runtime.getURL("images/cursor-chat.png"),
        glowColor: "#339cff",
        onArrived(sequence) {
          if (state.sessionId == null || state.turnId == null) return;
          chrome.runtime
            .sendMessage({
              type: "AGENT_CURSOR_ARRIVED",
              moveSequence: sequence,
              sessionId: state.sessionId,
              turnId: state.turnId,
            })
            .catch(() => {});
        },
      });
    const update = () => {
      element.style.display = state.isVisible ? "" : "none";
      animator?.setState({
        cursor: state.cursor,
        isVisible: state.isVisible && state.sessionId != null,
        turnKey:
          state.sessionId == null
            ? null
            : `${state.sessionId}:${state.turnId ?? ""}`,
        viewportSize: {
          height: window.visualViewport?.height ?? window.innerHeight,
          width: window.visualViewport?.width ?? window.innerWidth,
        },
      });
    };
    const setState = (next: OverlayState) => {
      state = next;
      update();
    };
    const message = (
      value: any,
      _sender: chrome.runtime.MessageSender,
      reply: (value: any) => void,
    ) => {
      if (value?.type !== "AGENT_CURSOR_STATE") return false;
      if (animator == null) {
        reply({ ok: false });
        return true;
      }
      generation++;
      setState(parseOverlayState(value.state));
      reply({ ok: true });
      return true;
    };
    const refresh = () => {
      const requested = generation + 1;
      generation = requested;
      chrome.runtime
        .sendMessage({ type: "GET_AGENT_CURSOR_STATE" })
        .then((value) => {
          if (requested !== generation || !value?.ok) return;
          setState(parseOverlayState(value.state));
        })
        .catch(() => {});
    };
    chrome.runtime.onMessage.addListener(message);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("pageshow", refresh);
    container.replaceChildren(element);
    update();
    refresh();
    return () => {
      generation++;
      animator?.destroy();
      chrome.runtime.onMessage.removeListener(message);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("pageshow", refresh);
      container.replaceChildren();
    };
  };
}
