/** Independent Sky-shaped adapter. Not a reconstruction of the native service. */
import { preparePasteContent, plainTextFromHtml } from "./paste-content";
import { screenshotDataUrl } from "./screenshot";
import { CuaError } from "./errors";
import type { NativeAppInfo, HelperHello } from "./helper";
export interface NativeTransport {
  request<T>(method: string, params?: Record<string, unknown>): Promise<T>;
}
export type NativeAuthorization = (request: {
  app: NativeAppInfo; operation: string; effect: "read" | "write";
}) => Promise<void>;
type Observation = { snapshotId: string; elements: Array<{id: number; role: string; name: string; value?: string; parentId?: number; frame?: Record<string, number>; properties?: Record<string, unknown>}>; warnings: string[]; screenshot?: unknown };
type Bound = { targetId: string; app: NativeAppInfo; observation?: Observation };
export function createNativeMacClient(helper: NativeTransport, authorize: NativeAuthorization) {
  if (typeof authorize !== "function") throw new Error("Native adapter requires an authorization callback");
  const bound = new Map<string, Bound>();
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>) {
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  }
  async function apps() { return (await helper.request<{apps:NativeAppInfo[]}>("listApps")).apps; }
  async function target(reference: string, operation: string, effect: "read" | "write") {
    if (typeof reference !== "string" || !reference.trim()) throw new CuaError("INVALID_ARGUMENT", "App reference must be nonempty");
    const matches = (await apps()).filter(app => [app.bundleId,app.name,app.path].includes(reference));
    if (matches.length !== 1) throw new CuaError(matches.length ? "AMBIGUOUS_TARGET" : "TARGET_NOT_FOUND", "App reference must identify exactly one running app");
    const app = matches[0]!;
    await authorize({app,operation,effect});
    const key = `${app.pid}:${app.launchTime}`;
    let value = bound.get(key);
    if (!value) {
      const result = await helper.request<{targetId:string;app:NativeAppInfo}>("bind",{pid:app.pid});
      if (result.app.pid !== app.pid || result.app.launchTime !== app.launchTime || result.app.bundleId !== app.bundleId || result.app.path !== app.path) {
        await helper.request("release", {targetId:result.targetId});
        throw new CuaError("TARGET_NOT_FOUND", "App identity changed during authorization");
      }
      value = result; bound.set(key,value);
    }
    return value;
  }
  async function write(app: string, method: string, payload: Record<string, unknown>) {
    const binding = await target(app,method,"write");
    const state = binding.observation;
    if (!state || state.warnings.length) throw new CuaError("STALE_OBSERVATION", "Observe a complete app tree before input");
    if (["mouseInput","scrollInput","dragInput"].includes(method) && payload.elementId === undefined && state.screenshot === undefined) throw new CuaError("STALE_OBSERVATION","Coordinate input requires the current screenshot");
    if (payload.elementId !== undefined && !state.elements.some(element => element.id === payload.elementId))
      throw new CuaError("STALE_OBSERVATION", "Element is not in the observed app tree");
    binding.observation = undefined;
    return helper.request(method,{targetId:binding.targetId,snapshotId:state.snapshotId,...payload});
  }
  return {
    target: "mac" as const,
    list_apps: () => serial(async () => (await apps()).map(app => ({id:app.bundleId || app.path || app.name,displayName:app.name,isRunning:true}))),
    get_app_state: (input: {app:string;disableDiff?:boolean}) => serial(async () => {
      const binding = await target(input.app,"get_app_state","read");
      // Invalidate before observation so a failed read cannot leave stale inputs enabled.
      binding.observation = undefined;
      const hello = await helper.request<HelperHello>("hello");
      if (typeof hello.permissions?.screenRecording !== "boolean") throw new CuaError("PROVIDER_DISCONNECTED","Missing native screen-recording permission status");
      const capture = hello.permissions.screenRecording;
      const state = await helper.request<Observation>(capture ? "observeWithScreenshot" : "observe",{targetId:binding.targetId});
      const screenshot = capture ? {url:screenshotDataUrl(state.screenshot)} : null;
      binding.observation = state;
      // Preserve native context: models need hierarchy, state and advertised actions
      // to distinguish duplicate labels and choose an operation from observation.
      const text = state.elements.map(element => {
        const fields = [`[${element.id}]`, element.role, JSON.stringify(element.name)];
        if (element.parentId !== undefined) fields.push(`parent=[${element.parentId}]`);
        if (element.value !== undefined && element.properties?.secure !== true) fields.push(`value=${JSON.stringify(element.value)}`);
        if (element.frame !== undefined) fields.push(`frame=${JSON.stringify(element.frame)}`);
        if (element.properties !== undefined) fields.push(`properties=${JSON.stringify(element.properties)}`);
        return fields.join(" ");
      }).join("\n");
      return {app:input.app,screenshot,text:[text,...state.warnings.map(warning => `Warning: ${warning}`),...(!capture ? ["Screenshot unavailable: Screen Recording permission is not granted."] : [])].join("\n")};
    }),
    paste: (input: {app:string;text:string;format:"text"|"md"|"html"}) => serial(async () => {
      const content = preparePasteContent(input.text,input.format);
      const result = await write(input.app,"pasteWithClipboard",{...content,richText:content.html === undefined ? undefined : plainTextFromHtml(content.html)}) as {outcome?:string;clipboardRestored?:boolean};
      if (result.outcome !== "observed" || result.clipboardRestored !== true) throw new CuaError("ACTION_OUTCOME_UNKNOWN","Paste response did not confirm insertion and clipboard restoration; observe before retrying");
    }),
    click: (input: {app:string;element_index?:number;x?:number;y?:number;mouse_button?:string;click_count?:number;key?:string;duration?:number}) => serial(async () => {
      const indexed = input.element_index !== undefined;
      if (indexed ? (!Number.isSafeInteger(input.element_index) || input.element_index! <= 0 || input.x !== undefined || input.y !== undefined) : (!Number.isFinite(input.x) || !Number.isFinite(input.y))) throw new CuaError("INVALID_ARGUMENT","Click requires either an element index or finite screenshot coordinates");
      if (input.duration !== undefined && (!Number.isFinite(input.duration) || input.duration < 0 || input.duration > 30)) throw new CuaError("INVALID_ARGUMENT","Input duration must be 0..30 seconds");
      if (input.click_count !== undefined && (!Number.isSafeInteger(input.click_count) || input.click_count < 1 || input.click_count > 10)) throw new CuaError("INVALID_ARGUMENT","Click count must be 1..10");
      await write(input.app,"mouseInput",{elementId:input.element_index,x:input.x,y:input.y,mouseButton:input.mouse_button,clickCount:input.click_count,key:input.key,duration:input.duration});
    }),
    drag: (input: {app:string;from_x:number;from_y:number;to_x:number;to_y:number}) => serial(async () => {
      if (![input.from_x,input.from_y,input.to_x,input.to_y].every(Number.isFinite)) throw new CuaError("INVALID_ARGUMENT","Drag requires finite screenshot coordinates");
      await write(input.app,"dragInput",{fromX:input.from_x,fromY:input.from_y,toX:input.to_x,toY:input.to_y});
    }),
    scroll: (input: {app:string;element_index?:number;x?:number;y?:number;direction:string;pages?:number}) => serial(async () => {
      const indexed = input.element_index !== undefined;
      if (indexed ? (!Number.isSafeInteger(input.element_index) || input.element_index! <= 0 || input.x !== undefined || input.y !== undefined) : (!Number.isFinite(input.x) || !Number.isFinite(input.y))) throw new CuaError("INVALID_ARGUMENT","Scroll requires either an element index or finite screenshot coordinates");
      if (!["up","down","left","right","u","d","l","r"].includes(input.direction)) throw new CuaError("INVALID_ARGUMENT","Unknown scroll direction");
      if (input.pages !== undefined && (!Number.isFinite(input.pages) || input.pages <= 0)) throw new CuaError("INVALID_ARGUMENT","Scroll pages must be finite and positive");
      await write(input.app,"scrollInput",{elementId:input.element_index,x:input.x,y:input.y,direction:input.direction,pages:input.pages});
    }),
    select_text: (input: {app:string;element_index:number;text:string;prefix?:string;suffix?:string;selection_type?:"text"|"cursor_before"|"cursor_after"}) => serial(async () => {
      if (input.selection_type !== undefined && !["text","cursor_before","cursor_after"].includes(input.selection_type)) throw new CuaError("INVALID_ARGUMENT","Unknown selection type");
      await write(input.app,"action",{operation:"selectText",elementId:input.element_index,value:input.text,options:{prefix:input.prefix,suffix:input.suffix,selectionType:input.selection_type}});
    }),
    perform_secondary_action: (input: {app:string;element_index:number;action:string}) => serial(async () => {
      await write(input.app,"action",{operation:"secondary",elementId:input.element_index,value:input.action});
    }),
    set_value: (input:{app:string;element_index:number;value:string}) => serial(async () => { await write(input.app,"action",{operation:"setValue",elementId:input.element_index,value:input.value}); }),
    type_text: (input:{app:string;text:string}) => serial(async () => { await write(input.app,"keyboardInput",{operation:"typeText",text:input.text}); }),
    press_key: (input:{app:string;key:string;duration?:number}) => serial(async () => {
      if (input.duration !== undefined && (!Number.isFinite(input.duration) || input.duration < 0 || input.duration > 30)) throw new CuaError("INVALID_ARGUMENT","Input duration must be 0..30 seconds");
      await write(input.app,"keyboardInput",{operation:"pressKey",key:input.key,durationMs:(input.duration ?? 0)*1000});
    }),
  };
}
