import { WebMcpListTools, WebMcpInvokeTool } from "../../commands/web_mcp";
import { codexTurnMetadata } from "../preferences/request_context";
import { credentialObservationState } from "../security/credential_observation";
import { commandScheduling } from "./command_scheduler";
export interface CommandOutcome {
  backend: string;
  commandSucceeded: boolean;
  commandType?: string;
  context: any;
  params: any;
  result?: any;
  runtime: any;
  currentUrl?: string;
  webMcpTool?: any;
}
export interface ResponseContribution {
  outcome: CommandOutcome;
  surfaceDetails: any;
  cloudBrowserHandoff?: any;
  siteGuidance?: any[];
}
export interface CommandRecorder {
  recordCommand(type: string, outcome: CommandOutcome): void;
  takeResponseMetaContribution():
    | ResponseContribution
    | undefined
    | Promise<ResponseContribution | undefined>;
}
export interface RecorderDependencies {
  captureResponseScreenshot(outcome: CommandOutcome): Promise<any>;
  emitResponseMetadata(runtime: any, backend: string, details: any): void;
  canObserve?(context?: any): boolean;
  ensureResumed?(): Promise<void>;
  shouldEmitResponseMetadata?(context?: any): Promise<boolean>;
}
function httpUrl(value: string | undefined) {
  if (value != null)
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname.length > 0
        ? url
        : undefined;
    } catch {}
}
/** Original wx, including raw metadata session_id precedence over the context session. */
export function cloudHandoffTarget(outcome: CommandOutcome) {
  if (
    outcome.backend !== "cdp" ||
    outcome.context.environment !== "orbit" ||
    typeof outcome.params.tab_id !== "string"
  )
    return;
  const session = outcome.context.getCurrentSessionId();
  return {
    tab_id: outcome.params.tab_id,
    browser_conversation_id: session,
    connection_thread_id:
      codexTurnMetadata(outcome.runtime)?.session_id ?? session,
  };
}
/** Original e6. */
export function emitCloudHandoff(runtime: any, target: any) {
  if (target != null) {
    const url = new URL("https://chatgpt.com/browser/handoff");
    url.searchParams.set("thread_id", target.browser_conversation_id);
    url.searchParams.set("tab_id", target.tab_id);
    if (target.connection_thread_id !== target.browser_conversation_id)
      url.searchParams.set("connection_thread_id", target.connection_thread_id);
    runtime.emitContentItem(
      JSON.stringify({
        browserHandoff: { url: url.href, cloud_browser_handoff: target },
      }),
    );
  }
}
/** Original r6: shared budget counts JavaScript string code units, not UTF-8 bytes. */
export function serializeRecordedValue(
  value: any,
  budget: number,
): { json?: string; truncated?: boolean } {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    return {};
  }
  return json == null
    ? {}
    : json.length <= budget
      ? { json }
      : budget === 0
        ? { truncated: true }
        : { json: `${json.slice(0, budget - 1)}…`, truncated: true };
}
function recordedToolName(type: string, params: any) {
  if (type === WebMcpListTools.commandType) return WebMcpListTools.commandType;
  if (type !== WebMcpInvokeTool.commandType) return;
  const name = params.tool_name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}
/** Original jue, newest first budget allocation, returned in original command order. */
export function recordedWebMcpCalls(outcomes: CommandOutcome[]) {
  let budget = 100_000;
  const calls = [];
  for (let index = outcomes.length - 1; index >= 0; index--) {
    const outcome = outcomes[index];
    if (outcome == null) continue;
    const name = recordedToolName(outcome.commandType!, outcome.params);
    if (name == null) continue;
    const input =
      outcome.commandType === WebMcpInvokeTool.commandType
        ? serializeRecordedValue(outcome.params.input, budget)
        : {};
    budget -= input.json?.length ?? 0;
    const output = serializeRecordedValue(outcome.result, budget);
    budget -= output.json?.length ?? 0;
    calls.push({
      kind:
        outcome.commandType === WebMcpListTools.commandType
          ? "listTools"
          : "invokeTool",
      name,
      title: outcome.webMcpTool?.title,
      description: outcome.webMcpTool?.description,
      readOnlyHint: outcome.webMcpTool?.annotations?.readOnlyHint,
      sourceHostname: httpUrl(
        outcome.commandType === WebMcpListTools.commandType
          ? outcome.currentUrl
          : outcome.webMcpTool?.origin,
      )?.hostname,
      inputJson: input.json,
      inputTruncated: input.truncated,
      outputJson: output.json,
      outputTruncated: output.truncated,
    });
  }
  return calls.reverse();
}
/** Original n6. */
export function createWebMcpRecorder(): CommandRecorder {
  let outcomes: CommandOutcome[] = [];
  return {
    recordCommand(type, outcome) {
      if (
        outcome.commandSucceeded &&
        recordedToolName(type, outcome.params) != null
      )
        outcomes.push({ ...outcome, commandType: type });
    },
    takeResponseMetaContribution() {
      const recorded = outcomes;
      outcomes = [];
      const last = recorded.at(-1),
        calls = recordedWebMcpCalls(recorded);
      if (last == null || calls.length === 0) return;
      return {
        outcome: last,
        surfaceDetails: {
          browserId: last.context.browserId,
          browserFamily: last.context.clientInfo.family,
          webMcpCalls: calls,
        },
      };
    },
  };
}
/** Original Z3/Q3/t6. All privacy checks use the same shared credential state by default. */
export function createCommandRecording(dependencies: RecorderDependencies) {
  const {
    captureResponseScreenshot,
    emitResponseMetadata,
    canObserve = commandScheduling.canObserve,
    ensureResumed = credentialObservationState.ensureResumed,
    shouldEmitResponseMetadata = commandScheduling.shouldEmitResponseMetadata,
  } = dependencies;
  function createNavigationRecorder(): CommandRecorder {
    let last: CommandOutcome | undefined,
      handoff: { outcome: CommandOutcome; target: any } | undefined;
    const origins = new Set<string>(),
      tabs = new Map<string, CommandOutcome>();
    return {
      recordCommand(type, outcome) {
        if (!outcome.commandSucceeded) return;
        const recorded = { ...outcome, commandType: type };
        if (type === "tab_manual_handoff_request") {
          handoff = { outcome: recorded, target: undefined };
          handoff.target = cloudHandoffTarget(recorded);
        }
        if (outcome.currentUrl == null) return;
        const origin = httpUrl(outcome.currentUrl)?.origin;
        if (origin != null) {
          origins.add(origin);
          last = recorded;
          tabs.set(
            `${outcome.context.browserId}:${outcome.params.tab_id}`,
            recorded,
          );
        }
      },
      takeResponseMetaContribution() {
        const siteGuidance = [];
        for (const outcome of tabs.values()) {
          if (
            outcome.backend !== "cdp" ||
            outcome.currentUrl == null ||
            !canObserve(outcome.context)
          )
            continue;
          const instruction = outcome.context.siteInstructions.take(
            Number(outcome.params.tab_id),
            outcome.currentUrl,
          );
          if (instruction)
            siteGuidance.push({ url: outcome.currentUrl, instruction });
        }
        const outcome = handoff?.outcome ?? last;
        tabs.clear();
        const selectedHandoff = handoff,
          multipleOrigins = origins.size > 1;
        last = undefined;
        handoff = undefined;
        origins.clear();
        if (outcome == null || !canObserve(outcome.context)) return;
        const tabId = selectedHandoff?.outcome.params.tab_id;
        const surfaceDetails: any = {
          browserId: outcome.context.browserId,
          browserFamily: outcome.context.clientInfo.family,
        };
        if (typeof tabId === "string")
          surfaceDetails.manualHandoffTabId = tabId;
        return {
          outcome: multipleOrigins
            ? { ...outcome, currentUrl: undefined, params: {} }
            : outcome,
          surfaceDetails,
          cloudBrowserHandoff: selectedHandoff?.target,
          siteGuidance,
        };
      },
    };
  }
  function createInteractionRecorder(): CommandRecorder {
    let last: CommandOutcome | undefined;
    return {
      recordCommand(type, outcome) {
        if (
          outcome.context.environment === "orbit" ||
          !outcome.commandSucceeded
        )
          return;
        const recorded = { ...outcome, commandType: type };
        if (
          interactionCommands.has(type) ||
          (last == null && outcome.backend === "cdp" && readCommands.has(type))
        )
          last = recorded;
      },
      async takeResponseMetaContribution() {
        const outcome = last;
        last = undefined;
        if (outcome != null)
          return {
            outcome,
            surfaceDetails: await outcome.context.performanceSpan.withSpan(
              "browser_use.response.screenshot",
              {},
              () => captureResponseScreenshot(outcome),
            ),
          };
      },
    };
  }
  function createCommandRecorder(recorders: CommandRecorder[], runtime: any) {
    const registered = [...recorders];
    let protectedHandoff: any;
    runtime.addAfterSubmittedCodeHook({
      timeoutMs: 10_000,
      async run() {
        const handoff = protectedHandoff;
        protectedHandoff = undefined;
        try {
          await runtime.assertBrowserAccess?.();
        } catch {
          return;
        }
        if (handoff != null) {
          await ensureResumed();
          emitResponseMetadata(runtime, handoff.backend, {
            ...handoff.surfaceDetails,
            cloudBrowserHandoff: handoff.target,
          });
          emitCloudHandoff(runtime, handoff.target);
          return;
        }
        if (!canObserve()) return;
        const contributions: ResponseContribution[] = [];
        for (const recorder of registered) {
          if (!canObserve()) return;
          const contribution = await recorder.takeResponseMetaContribution();
          if (contribution != null && canObserve(contribution.outcome.context))
            contributions.push(contribution);
        }
        const manual = contributions.find(
            ({ surfaceDetails }) => surfaceDetails.manualHandoffTabId != null,
          ),
          selected =
            manual ??
            contributions.find(
              ({ surfaceDetails }) => surfaceDetails.screenshot != null,
            ) ??
            contributions[0];
        if (selected == null) return;
        let outcome = manual?.outcome;
        let details = {};
        for (const contribution of contributions) {
          if (
            contribution.outcome.backend !== selected.outcome.backend ||
            contribution.outcome.context.browserId !==
              selected.outcome.context.browserId
          )
            continue;
          outcome ??= contribution.outcome;
          details = { ...details, ...contribution.surfaceDetails };
        }
        if (
          outcome == null ||
          !(await shouldEmitResponseMetadata(outcome.context))
        )
          return;
        const guidance = contributions.flatMap(
          (contribution) => contribution.siteGuidance ?? [],
        );
        if (guidance.length > 0)
          outcome.runtime.setResponseMeta({
            "codex/browserSiteGuidance": guidance,
          });
        emitResponseMetadata(outcome.runtime, outcome.backend, {
          ...details,
          cloudBrowserHandoff: manual?.cloudBrowserHandoff,
          currentUrl: outcome.currentUrl,
          params: outcome.params,
        });
        emitCloudHandoff(outcome.runtime, manual?.cloudBrowserHandoff);
      },
    });
    return {
      register(recorder: CommandRecorder) {
        registered.push(recorder);
      },
      recordCommand(type: string, outcome: CommandOutcome) {
        if (!canObserve(outcome.context)) {
          if (
            type === "tab_manual_handoff_request" &&
            outcome.commandSucceeded &&
            typeof outcome.params.tab_id === "string"
          )
            protectedHandoff = {
              backend: outcome.backend,
              surfaceDetails: {
                browserId: outcome.context.browserId,
                browserFamily: outcome.context.clientInfo.family,
                manualHandoffTabId: outcome.params.tab_id,
              },
              target: cloudHandoffTarget({ ...outcome, commandType: type }),
            };
          return;
        }
        for (const recorder of registered)
          recorder.recordCommand(type, outcome);
      },
    };
  }
  return {
    createNavigationRecorder,
    createInteractionRecorder,
    createCommandRecorder,
    createResponseRecorder: createWebMcpRecorder,
  };
}

const interactionCommands = new Set([
  "close_tab",
  "cua_click",
  "cua_double_click",
  "cua_drag",
  "cua_keypress",
  "cua_move",
  "cua_scroll",
  "cua_type",
  "dom_cua_click",
  "dom_cua_double_click",
  "dom_cua_download_media",
  "dom_cua_keypress",
  "dom_cua_scroll",
  "dom_cua_type",
  "navigate_tab_back",
  "navigate_tab_forward",
  "navigate_tab_reload",
  "navigate_tab_url",
  "playwright_locator_click",
  "playwright_locator_dblclick",
  "playwright_locator_download_media",
  "playwright_locator_fill",
  "playwright_locator_press",
  "playwright_locator_press_sequentially",
  "playwright_locator_select_option",
  "playwright_locator_set_checked",
  "tab_ax_action",
  "tab_handle_js_dialog",
]);
const readCommands = new Set([
  "dom_cua_get_visible_dom",
  "playwright_dom_snapshot",
  "playwright_evaluate",
  "playwright_locator_all_text_contents",
  "playwright_locator_count",
  "playwright_locator_get_attribute",
  "playwright_locator_inner_text",
  "playwright_locator_is_enabled",
  "playwright_locator_is_visible",
  "playwright_locator_read_all",
  "playwright_locator_text_content",
  "tab_ax_get_state",
  "tab_page_assets_list",
  "tab_screenshot",
  "webmcp_list_tools",
]);
