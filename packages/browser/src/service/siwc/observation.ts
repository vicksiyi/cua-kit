import { inputTimeout } from "../input/input";
/** Current Dc: bind the snapshot to session, tab spelling and injected generation. */
export async function isSiwcSnapshotCurrent(
  payload: any,
  context: any,
  snapshotId: string,
) {
  const generation = await context.playwright.evaluateOnPlaywrightPage(
    payload.tab_id,
    (injected: any) => injected.siwcDocumentId(),
    { timeoutMs: inputTimeout(payload) },
  );
  return (
    snapshotId ===
    JSON.stringify([context.getCurrentSessionId(), payload.tab_id, generation])
  );
}
/** Current Co: detection is read-only; a changed generation never yields stale targets. */
export async function observeSiwc(payload: any, context: any) {
  const session = context.getCurrentSessionId();
  try {
    const { generation, candidates } =
      await context.playwright.evaluateOnPlaywrightPage(
        payload.tab_id,
        (injected: any) => ({
          candidates: injected.siwcDetect(),
          generation: injected.siwcDocumentId(),
        }),
        { timeoutMs: inputTimeout(payload) },
      );
    const snapshotId = JSON.stringify([session, payload.tab_id, generation]);
    if (!(await isSiwcSnapshotCurrent(payload, context, snapshotId)))
      return { siwc: { status: "unavailable", reason: "page_changed" } };
    const [first, ...rest] = candidates.map(({ ref, ...candidate }: any) => ({
      ...candidate,
      target: { kind: "dom", snapshotId, ref },
    }));
    return {
      snapshotId,
      siwc:
        first == null
          ? { status: "no_deterministic_matches", candidates: [] }
          : { status: "possible_matches", candidates: [first, ...rest] },
    };
  } catch {
    return {
      siwc: { status: "unavailable", reason: "observation_unavailable" },
    };
  }
}
/** Current bN/Pv: frame id, loader, origin and full URL establish a committed page. */
export async function committedSiwcPage(tabId: number, context: any) {
  const { frameTree } = await context.cdp.call(tabId, "Page.getFrameTree");
  const { id, loaderId, securityOrigin, url, urlFragment } = frameTree.frame;
  const origin = new URL(url).origin;
  if (
    !id ||
    !loaderId ||
    origin === "null" ||
    new URL(securityOrigin).origin !== origin
  )
    throw new Error("SIWC requires a committed web page");
  return { id, loaderId, url: url + (urlFragment ?? "") };
}
export async function isSiwcPageCurrent(
  tabId: number,
  page: any,
  context: any,
) {
  const current = await committedSiwcPage(tabId, context);
  return (
    current.id === page.id &&
    current.loaderId === page.loaderId &&
    current.url === page.url
  );
}
