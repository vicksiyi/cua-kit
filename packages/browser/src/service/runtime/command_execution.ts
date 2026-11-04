const frameCommands = {
  prepare: "mcp_app_frame_prepare",
  activate: "mcp_app_frame_activate",
  release: "mcp_app_frame_release",
};
/** Original f5, serialized into the injected Playwright page. */
export function splitMcpFrameSelector(injected: any, selector: string) {
  const parsed = injected.parseSelector(selector);
  if (parsed.capture != null)
    throw new Error("Capturing frame selectors are unsupported.");
  let current: string[] = [];
  const groups = [current];
  for (const part of parsed.parts)
    if (part.name === "internal:control" && part.body === "enter-frame") {
      current = [];
      groups.push(current);
    } else current.push(`${part.name}=${part.source}`);
  if (groups.some((group) => group.length === 0))
    throw new Error("Empty frame selector.");
  return groups.map((group) => group.join(" >> "));
}
/** Original h5, executed in each ancestor frame to translate a nested pointer coordinate. */
export function translateMcpFramePoint(
  element: any,
  injected: any,
  point: { x: number; y: number },
) {
  if (!(
    element instanceof HTMLIFrameElement || element instanceof HTMLFrameElement
  ))
    throw new Error("Frame locator must select an iframe.");
  for (let ancestor: any = element; ancestor != null;) {
    const style = getComputedStyle(ancestor);
    if (
      style.transform !== "none" ||
      style.rotate !== "none" ||
      style.scale !== "none" ||
      style.translate !== "none" ||
      (style.zoom !== "normal" && Number(style.zoom) !== 1)
    )
      throw new Error("Clicks in transformed MCP App frames are unsupported.");
    const root = ancestor.getRootNode();
    ancestor =
      ancestor.assignedSlot ??
      ancestor.parentElement ??
      (root instanceof ShadowRoot ? root.host : null);
  }
  if (!injected.elementState(element, "visible").matches)
    throw new Error("MCP App frame is not visible.");
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= element.clientWidth ||
    point.y >= element.clientHeight
  )
    throw new Error("Click is outside the MCP App frame.");
  const rect = element.getBoundingClientRect(),
    translated = {
      x: rect.left + element.clientLeft + point.x,
      y: rect.top + element.clientTop + point.y,
    };
  if (injected.expectHitTarget(translated, element) !== "done")
    throw new Error("MCP App frame is obscured.");
  return translated;
}
/** Original m5. Preparation tokens are retained before authority/activation and released in reverse order. */
export async function executeMcpFrameCommand(
  context: any,
  params: any,
  execute: (context: any, params: any) => Promise<any>,
) {
  if (
    typeof params.selector !== "string" ||
    !params.selector.includes("internal:control=enter-frame")
  )
    return await execute(context, params);
  const tabId = Number(params.tab_id);
  if (!Number.isSafeInteger(tabId)) throw new Error("Invalid MCP App tab ID.");
  const selectors = await context.playwright.evaluateOnPlaywrightPage(
    tabId,
    splitMcpFrameSelector,
    { arg: params.selector },
  );
  if (selectors.length === 1) return await execute(context, params);
  const tab = await context.tabs.get(tabId);
  if (tab.url == null) throw new Error("MCP App URL is unavailable.");
  const rootUrl = new URL(tab.url),
    frames: any[] = [];
  let current = context;
  const translate = async (point: any) => {
    for (const frame of frames.slice().reverse())
      point = (
        await frame.playwright.evaluateOnPlaywrightNode(
          frame.node,
          translateMcpFramePoint,
          { arg: point },
        )
      ).result;
  };
  try {
    for (const selector of selectors.slice(0, -1)) {
      const node = await current.playwright.resolvePlaywrightSelectorNode(
        tabId,
        selector,
        { retry: true },
      );
      await current.playwright.evaluateOnPlaywrightNode(
        node,
        (element: any) => {
          if (!element.matches("iframe, frame"))
            throw new Error("Frame locator must select an iframe.");
          element.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          });
        },
      );
      const response = await context.executeUnhandledCommand({
        type: frameCommands.prepare,
        tab_id: String(tabId),
        backend_node_id: node.backendNodeId,
        parent_token: frames.at(-1)?.token,
      });
      if (
        response == null ||
        typeof response !== "object" ||
        !("token" in response) ||
        typeof response.token !== "string" ||
        !("url" in response) ||
        typeof response.url !== "string"
      )
        throw new Error("Invalid MCP App frame preparation response.");
      const prepared = { token: response.token, url: response.url };
      frames.push({
        playwright: current.playwright,
        node,
        token: prepared.token,
      });
      const url = new URL(prepared.url);
      if (
        prepared.url !== "about:srcdoc" &&
        !(url.protocol === rootUrl.protocol && url.host === rootUrl.host)
      )
        await context
          .acquireAuthority({ embeddedWebsite: true })
          .observeContent(prepared.url)
          .assert();
      await context.executeUnhandledCommand({
        type: frameCommands.activate,
        tab_id: String(tabId),
        token: prepared.token,
        expected_url: prepared.url,
      });
      const cdp = context.cdp.forDocument({ tabId, sessionId: prepared.token });
      current = Object.create(context, {
        cdp: { value: cdp },
        playwright: { value: context.playwright.forDocument(cdp, translate) },
      });
    }
    return await execute(current, { ...params, selector: selectors.at(-1) });
  } finally {
    try {
      if (current !== context)
        await context.clipboard.disposePageClipboard(current.cdp);
    } finally {
      for (const { token } of frames.reverse())
        await context
          .executeUnhandledCommand({
            type: frameCommands.release,
            tab_id: String(tabId),
            token,
          })
          .catch(() => {});
    }
  }
}
/** Original TA/EA: serialization is scoped to the CDP instance and numeric tab ID; rejected predecessors do not poison the queue. */
export function createCommandExecution() {
  const queues = new WeakMap<object, Map<number, Promise<any>>>();
  return async function executeWithCommandContext(
    context: any,
    params: any,
    execute: (context: any, params: any) => Promise<any>,
  ) {
    if (context.clientInfo.type !== "mcpapps")
      return await execute(context, params);
    const tabId = Number(params.tab_id);
    let tabs = queues.get(context.cdp);
    if (tabs == null) {
      tabs = new Map();
      queues.set(context.cdp, tabs);
    }
    const pending = (tabs.get(tabId) ?? Promise.resolve())
      .catch(() => {})
      .then(() => executeMcpFrameCommand(context, params, execute));
    tabs.set(tabId, pending);
    try {
      return await pending;
    } finally {
      if (tabs.get(tabId) === pending) tabs.delete(tabId);
    }
  };
}
export const executeWithCommandContext = createCommandExecution();
