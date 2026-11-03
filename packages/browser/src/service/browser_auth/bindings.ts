import { positiveTabId } from "../tab_id";
import { httpOrigin } from "../security/authority_builder";
import { downloadSourceOrigin } from "../context/downloads";
import type { CdpTarget } from "../cdp/dispatch_helpers";
import { isAuthFrameSelector } from "./field_plan";
export interface AuthBinding {
  domainAndRegistry: string;
  frameId: string;
  loaderId: string;
  url: string;
}
export interface AuthPageBinding extends AuthBinding {
  securityOrigin: string;
}
export interface AuthFormBinding extends AuthBinding {
  origin: string;
  targetKey: string;
}
export interface AuthBindingRequest {
  tab_id: string;
  timeout_ms?: number;
  fields: Array<{ selector: string }>;
  submit?: { selector: string } | null;
  options?: Array<{ id: string; selector?: string | null }> | null;
}
export interface AuthBindingContext {
  cdp: { call(tabId: number, method: string): Promise<any> };
  playwright: {
    evaluateOnPlaywrightSelectorWithTarget(
      tabId: string,
      selector: string,
      callback: (element: any) => any,
      options: any,
    ): Promise<{
      frameIdentity?: AuthBinding | null;
      result: any;
      target: CdpTarget;
    }>;
    selectorsResolveToDistinctElements(
      tabId: string,
      selectors: string[],
      options: { timeoutMs?: number },
    ): Promise<boolean>;
  };
}
/** Original _f/RD. */
export function authSelectors(request: AuthBindingRequest) {
  return [
    ...request.fields.map(({ selector }) => selector),
    ...(request.submit == null ? [] : [request.submit.selector]),
    ...(request.options ?? []).flatMap(({ selector }) =>
      selector == null ? [] : [selector],
    ),
  ];
}
export function hasNestedAuthFrames(request: AuthBindingRequest) {
  return authSelectors(request).some(
    (selector) =>
      (selector.match(/internal:control\s*=\s*enter-frame/g)?.length ?? 0) > 1,
  );
}
/** Original Ka/Ch. Page binding is limited to HTTP(S) origins. */
export async function readAuthPageBinding(
  tabId: unknown,
  expectedOrigin: string | null | undefined,
  context: AuthBindingContext,
): Promise<AuthPageBinding | "origin_changed" | "page_changed"> {
  const { frameTree } = await context.cdp.call(
    positiveTabId(tabId),
    "Page.getFrameTree",
  );
  const { domainAndRegistry, id, loaderId, securityOrigin, url } =
    frameTree.frame;
  const origin = expectedOrigin ?? httpOrigin(url);
  return origin == null ||
    httpOrigin(securityOrigin) !== origin ||
    httpOrigin(url) !== origin
    ? "origin_changed"
    : !id || !loaderId || !securityOrigin || !url
      ? "page_changed"
      : {
          domainAndRegistry: domainAndRegistry ?? "",
          frameId: id,
          loaderId,
          securityOrigin,
          url,
        };
}
export async function revalidateAuthPage(
  tabId: unknown,
  origin: string | null | undefined,
  previous: AuthPageBinding,
  context: AuthBindingContext,
) {
  const current = await readAuthPageBinding(tabId, origin, context);
  return typeof current === "string"
    ? current
    : sameAuthDocument(previous, current)
      ? null
      : "page_changed";
}
/** Original Va/wv/sN. */
export function sameAuthDocument(a: AuthBinding, b: AuthBinding) {
  return (
    a.frameId === b.frameId && a.loaderId === b.loaderId && a.url === b.url
  );
}
export function sameAuthSite(a: AuthBinding, b: AuthBinding) {
  return a.domainAndRegistry && b.domainAndRegistry
    ? a.domainAndRegistry === b.domainAndRegistry
    : new URL(a.url).hostname === new URL(b.url).hostname;
}
export function authTargetKey(target: CdpTarget) {
  return `${target.tabId}:${target.sessionId ?? ""}:${target.targetId ?? ""}`;
}
/** Original Ih. Selector and CDP document identity must agree, ignoring only selector URL fragment. */
export async function readAuthFrameBinding(
  tabId: string,
  selector: string,
  timeoutMs: number | undefined,
  context: AuthBindingContext,
): Promise<AuthFormBinding> {
  const { frameIdentity, result, target } =
    await context.playwright.evaluateOnPlaywrightSelectorWithTarget(
      tabId,
      selector,
      (element) =>
        element.ownerDocument.defaultView?.location.href ??
        window.location.href,
      { includeFrameIdentity: true, timeoutMs },
    );
  if (frameIdentity == null)
    throw new Error("Browser auth frame has no document identity");
  const origin = downloadSourceOrigin(frameIdentity.url);
  if (origin == null) throw new Error("Browser auth frame has no origin");
  if (frameIdentity.url !== result.split("#", 1)[0])
    throw new Error("Browser auth frame URL mismatch");
  return {
    domainAndRegistry: frameIdentity.domainAndRegistry ?? "",
    frameId: frameIdentity.frameId,
    loaderId: frameIdentity.loaderId,
    origin,
    targetKey: authTargetKey(target),
    url: frameIdentity.url,
  };
}
/** Original Rh/iN/eN. */
export async function readAuthFormBinding(
  request: AuthBindingRequest,
  context: AuthBindingContext,
  fallbackSelector?: string,
) {
  try {
    const selectors = [
      ...request.fields.map(({ selector }) => selector),
      ...(request.submit == null ? [] : [request.submit.selector]),
    ];
    if (selectors.length === 0) selectors.push(fallbackSelector ?? "html");
    const bindings = await Promise.all(
      selectors.map((selector) =>
        readAuthFrameBinding(
          request.tab_id,
          selector,
          request.timeout_ms,
          context,
        ),
      ),
    );
    const first = bindings[0];
    return first == null
      ? null
      : bindings.every(
            (binding) =>
              binding.targetKey === first.targetKey &&
              binding.origin === first.origin &&
              sameAuthDocument(binding, first),
          )
        ? first
        : null;
  } catch {
    return null;
  }
}
export async function readAuthOptionBindings(
  request: AuthBindingRequest,
  context: AuthBindingContext,
) {
  try {
    const bindings = new Map<string, AuthFormBinding>();
    await Promise.all(
      (request.options ?? []).map(async (option) => {
        if (option.selector != null)
          bindings.set(
            option.id,
            await readAuthFrameBinding(
              request.tab_id,
              option.selector,
              request.timeout_ms,
              context,
            ),
          );
      }),
    );
    return bindings;
  } catch {
    return null;
  }
}
export async function revalidateAuthForm(
  request: AuthBindingRequest,
  previous: AuthFormBinding,
  context: AuthBindingContext,
  fallbackSelector?: string,
) {
  const current = await readAuthFormBinding(request, context, fallbackSelector);
  return current == null
    ? "locator_invalid"
    : current.targetKey !== previous.targetKey
      ? "page_changed"
      : current.origin !== previous.origin
        ? "origin_changed"
        : sameAuthDocument(previous, current)
          ? null
          : "page_changed";
}
/** Original Qee. Nested intermediate frames must belong to either endpoint site. */
export async function validAuthIntermediateFrames(
  page: AuthBinding,
  form: AuthBinding,
  request: AuthBindingRequest,
  context: AuthBindingContext,
) {
  const selectors = new Set<string>();
  for (const selector of authSelectors(request)) {
    let count = 0;
    for (const match of selector.matchAll(
      />>\s*internal:control\s*=\s*enter-frame\s*>>/g,
    ))
      if (count++ > 0) selectors.add(selector.slice(0, match.index).trimEnd());
  }
  try {
    return (
      await Promise.all(
        Array.from(selectors, (selector) =>
          readAuthFrameBinding(
            request.tab_id,
            selector,
            request.timeout_ms,
            context,
          ),
        ),
      )
    ).every(
      (binding) => sameAuthSite(page, binding) || sameAuthSite(form, binding),
    );
  } catch {
    return false;
  }
}
/** Original _v. Keep stable per-window element identities across repeated probes. */
export async function distinctAuthElements(
  tabId: string,
  selectors: string[],
  request: Pick<AuthBindingRequest, "timeout_ms">,
  context: AuthBindingContext,
) {
  if (selectors.length < 2) return true;
  if (!selectors.some(isAuthFrameSelector))
    return await context.playwright.selectorsResolveToDistinctElements(
      tabId,
      selectors,
      { timeoutMs: request.timeout_ms },
    );
  const identities = await Promise.all(
    selectors.map(async (selector) => {
      const { result, target } =
        await context.playwright.evaluateOnPlaywrightSelectorWithTarget(
          tabId,
          selector,
          (element) => {
            const state = window as Window & {
              __codexBrowserAuthElementIds?: WeakMap<object, string>;
              __codexBrowserAuthElementIdCounter?: number;
            };
            state.__codexBrowserAuthElementIds ??= new WeakMap();
            const previous = state.__codexBrowserAuthElementIds.get(element);
            if (previous != null) return previous;
            const id = String(
              (state.__codexBrowserAuthElementIdCounter ?? 0) + 1,
            );
            state.__codexBrowserAuthElementIdCounter = Number(id);
            state.__codexBrowserAuthElementIds.set(element, id);
            return id;
          },
          { timeoutMs: request.timeout_ms },
        );
      return `${authTargetKey(target)}:${result}`;
    }),
  );
  return new Set(identities).size === identities.length;
}
