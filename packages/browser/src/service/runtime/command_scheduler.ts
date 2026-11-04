import {
  GetBrowserCommand,
  ListBrowsersCommand,
} from "../../commands/browser_inventory";
import { BrowserUseSecurityError } from "../errors/browser_security_error";
import {
  BrowserCredentialRecoveryError,
  type CredentialRecoveryDetails,
} from "../errors/credential_recovery_error";
import {
  CredentialObservationError,
  credentialObservationState,
} from "../security/credential_observation";

const authHandoff = "tab_browser_auth_handoff";
const navigationCommands = new Set([
  "navigate_tab_url",
  "navigate_tab_back",
  "navigate_tab_forward",
  "navigate_tab_reload",
  "close_tab",
]);
const documentationCommands = new Set([
  "get_documentation",
  "get_browser_documentation",
]);
const inventoryCommands = new Set([
  "get_browser",
  "get_default_browser",
  "list_browsers",
]);
const sessionCommands = new Set([
  "name_session",
  "browser_visibility_set",
  "mark_tab",
]);
const observationCommands = new Set([
  "get_tab",
  "tab_screenshot",
  "tab_handle_js_dialog",
  "cua_click",
  "cua_double_click",
  "cua_drag",
  "cua_keypress",
  "cua_move",
  "cua_scroll",
  "cua_type",
  "dom_cua_click",
  "dom_cua_double_click",
  "dom_cua_get_visible_dom",
  "dom_cua_keypress",
  "dom_cua_scroll",
  "dom_cua_type",
  "tab_ax_action",
  "tab_ax_get_state",
  "playwright_dom_snapshot",
  "playwright_evaluate",
  "playwright_locator_all_text_contents",
  "playwright_locator_click",
  "playwright_locator_count",
  "playwright_locator_dblclick",
  "playwright_locator_fill",
  "playwright_locator_get_attribute",
  "playwright_locator_inner_text",
  "playwright_locator_is_enabled",
  "playwright_locator_is_visible",
  "playwright_locator_press",
  "playwright_locator_press_sequentially",
  "playwright_locator_read_all",
  "playwright_locator_select_option",
  "playwright_locator_set_checked",
  "playwright_locator_text_content",
  "playwright_locator_wait_for",
  "playwright_wait_for_load_state",
  "playwright_wait_for_timeout",
  "playwright_wait_for_url",
]);
const reportedCommands = new Set([
  authHandoff,
  ...navigationCommands,
  ...documentationCommands,
  ...inventoryCommands,
  ...sessionCommands,
  ...observationCommands,
  "create_tab",
  "tab_manual_handoff_request",
]);
export interface ObservationGate {
  browserId: string;
  observationEpoch: number;
  usedNativeCredentials: boolean;
  protectionPending: boolean;
  invalidateDocuments(tabId?: number): void;
  assertRetainedObservationAllowed(): void;
  assertObservationAllowed(
    tabId: number,
    expectedEpoch?: number,
    enforce?: boolean,
  ): Promise<void>;
}
export interface ObservationState {
  isUnavailable(): boolean;
  allGates(): ObservationGate[];
  beginObservation(): () => void;
  ensureResumed(): Promise<void>;
}
export type ScheduledCommand = { type: string; [key: string]: any };
export type GuardState =
  "recovery_required" | "pending" | "protected" | "inactive";
export interface RecoveryTelemetry extends CredentialRecoveryDetails {
  guard_state_before: GuardState;
  guard_state_after: GuardState;
  observation_changed: boolean;
}
/** Original q3/D3/$o and command sets. One factory owns the original shared B3 queue. */
export function createCommandScheduling(
  state: ObservationState = credentialObservationState,
) {
  let handoffQueue: Promise<void> = Promise.resolve();
  function guardState(): GuardState {
    if (state.isUnavailable()) return "recovery_required";
    const gates = state.allGates();
    return gates.some((gate) => gate.protectionPending)
      ? "pending"
      : gates.some((gate) => gate.usedNativeCredentials)
        ? "protected"
        : "inactive";
  }
  function canObserve(context?: any) {
    return (
      !state.isUnavailable() &&
      !context?.credentialObservationGate?.usedNativeCredentials &&
      state.allGates().every((gate) => !gate.usedNativeCredentials)
    );
  }
  async function shouldEmitResponseMetadata(context?: any) {
    if (!canObserve(context)) return false;
    try {
      await state.ensureResumed();
      return canObserve(context);
    } catch {
      return false;
    }
  }
  function createCommandScheduler(
    execute: (
      command: ScheduledCommand,
      finishNativeCredentialModelCommand?: () => void,
    ) => Promise<any>,
    resolveBrowserId: (id: any) => Promise<any> = (id) => Promise.resolve(id),
    reportRecovery?: (details: RecoveryTelemetry) => void,
  ) {
    return async (input: ScheduledCommand) => {
      const { type } = input;
      const isAuth = type === authHandoff,
        isManual = type === "tab_manual_handoff_request",
        isNavigation = navigationCommands.has(type),
        isCreate = type === "create_tab",
        isDocumentation = documentationCommands.has(type),
        isInventory = inventoryCommands.has(type),
        isSession = sessionCommands.has(type);
      let releaseQueue: (() => void) | undefined;
      if (isAuth) {
        const previous = handoffQueue;
        handoffQueue = new Promise((resolve) => {
          releaseQueue = resolve;
        });
        await previous;
      }
      let finishObservation: (() => void) | undefined;
      let command = input,
        resolvingBrowser = false;
      let phase: CredentialRecoveryDetails["phase"] = "before_command";
      const before = guardState();
      const epochs = new Map(
        state.allGates().map((gate) => [gate, gate.observationEpoch]),
      );
      const checkObservation = async (after: boolean) => {
        if (
          isDocumentation ||
          isInventory ||
          isSession ||
          isNavigation ||
          isCreate ||
          isManual ||
          (isAuth && after)
        )
          return;
        const gates = state.allGates(),
          protectedGate = gates.find((gate) => gate.usedNativeCredentials),
          browserId = "browser_id" in command ? command.browser_id : undefined,
          tabId = "tab_id" in command ? Number(command.tab_id) : NaN,
          currentGate = gates.find((gate) => gate.browserId === browserId);
        if (
          protectedGate != null &&
          ((!isAuth && !observationCommands.has(type)) ||
            currentGate == null ||
            !Number.isSafeInteger(tabId) ||
            tabId <= 0)
        )
          protectedGate.assertRetainedObservationAllowed();
        for (const gate of gates)
          await gate.assertObservationAllowed(
            tabId,
            after ? (epochs.get(gate) ?? 0) : undefined,
            protectedGate != null && gate === currentGate,
          );
      };
      try {
        if (state.isUnavailable())
          throw new CredentialObservationError("credential_state_unavailable");
        finishObservation = state.beginObservation();
        if (
          "browser_id" in input &&
          state.allGates().some((gate) => gate.usedNativeCredentials)
        ) {
          resolvingBrowser = true;
          command = {
            ...input,
            browser_id: await resolveBrowserId(input.browser_id),
          };
          resolvingBrowser = false;
        }
        if (isNavigation && "browser_id" in command && "tab_id" in command) {
          const { browser_id, tab_id } = command;
          state
            .allGates()
            .find((gate) => gate.browserId === browser_id)
            ?.invalidateDocuments(Number(tab_id));
        }
        await checkObservation(false);
        await state.ensureResumed();
        phase = "command";
        const result = await execute(
          command,
          isAuth ? finishObservation : undefined,
        );
        phase = "after_command";
        await checkObservation(true);
        await state.ensureResumed();
        if (isCreate) {
          if (
            result == null ||
            typeof result !== "object" ||
            !("id" in result) ||
            typeof result.id !== "string" ||
            !/^[1-9]\d*$/.test(result.id) ||
            !Number.isSafeInteger(Number(result.id))
          )
            throw new Error("Browser returned an invalid new tab identifier");
          return { id: result.id };
        }
        return isInventory && !canObserve()
          ? type === "list_browsers"
            ? ListBrowsersCommand.ResultSchema.parse(result)
            : GetBrowserCommand.ResultSchema.parse(result)
          : (isNavigation || isManual || isSession) && !canObserve()
            ? {}
            : result;
      } catch (error) {
        let recheckError: unknown,
          recheckFailed = false;
        try {
          await checkObservation(true);
          await state.ensureResumed();
          if (
            isNavigation ||
            isCreate ||
            isInventory ||
            isSession ||
            isAuth ||
            isManual ||
            resolvingBrowser
          )
            for (const gate of state.allGates())
              gate.assertRetainedObservationAllowed();
        } catch (caught) {
          recheckFailed = true;
          recheckError = caught;
        }
        let reason: CredentialRecoveryDetails["reason"] | undefined,
          nextAction: CredentialRecoveryDetails["next_action"] | undefined,
          securityReason: CredentialRecoveryDetails["security_reason"];
        if (
          recheckError instanceof CredentialObservationError &&
          recheckError.reason === "credential_state_unavailable" &&
          !(
            error instanceof CredentialObservationError &&
            error.reason === "credential_state_unavailable"
          )
        ) {
          phase = "error_recheck";
          reason = recheckError.reason;
          nextAction = "restart_browser_runtime";
        } else if (error instanceof CredentialObservationError) {
          reason = error.reason;
          switch (error.reason) {
            case "credential_state_unavailable":
              nextAction = "restart_browser_runtime";
              break;
            case "credential_delivery_in_progress":
              nextAction = "retry_after_credential_delivery";
              break;
            case "protected_command_failed":
              nextAction =
                isManual || isCreate || isInventory || isSession
                  ? "stop"
                  : "request_manual_handoff";
              break;
            case "retained_data_restricted":
              nextAction = "create_new_tab";
              break;
            case "credential_observation_restricted":
              nextAction = "navigate_to_new_document";
              break;
          }
        } else if (recheckFailed) {
          if (error instanceof BrowserUseSecurityError) {
            reason = error.retryable
              ? "browser_security_unavailable"
              : "browser_security_restricted";
            nextAction = error.retryable ? "retry_after_resolution" : "stop";
            securityReason = error.reason;
          } else {
            reason = "protected_command_failed";
            nextAction =
              isManual || isCreate || isInventory || isSession
                ? "stop"
                : "request_manual_handoff";
          }
        } else throw error;
        // The original reason/action fields remain undefined for an unrecognized runtime error reason.
        const details = {
          schema_version: 1 as const,
          command: reportedCommands.has(type) ? type : "other",
          phase,
          reason: reason!,
          next_action: nextAction!,
          security_reason: securityReason,
        };
        const recovery = new BrowserCredentialRecoveryError(details);
        try {
          reportRecovery?.({
            ...details,
            guard_state_before: before,
            guard_state_after: guardState(),
            observation_changed: state
              .allGates()
              .some(
                (gate) => (epochs.get(gate) ?? 0) !== gate.observationEpoch,
              ),
          });
        } catch {}
        throw recovery;
      } finally {
        finishObservation?.();
        releaseQueue?.();
      }
    };
  }
  return {
    createCommandScheduler,
    guardState,
    canObserve,
    shouldEmitResponseMetadata,
  };
}
export const commandScheduling = createCommandScheduling();
