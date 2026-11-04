export const TOOLBAR_STATE_SNAPSHOT_KEY = "codexToolbarStateLastSnapshot";
export const TOOLBAR_STATE_ALARM = "codex-toolbar-state-alarm";
/** Original jk/Xi/qk: reporting is queued and suppresses repeated daily snapshots. */
export function createToolbarStateReporter(host: {
  chrome: Pick<typeof chrome, "action" | "alarms" | "storage">;
  now(): number;
  reportMetric(
    name: string,
    value: number,
    tags: Record<string, string>,
  ): Promise<unknown>;
  warn(message: string): void;
}) {
  let pending = Promise.resolve();
  async function snapshot(trigger: string, isOnToolbar?: boolean) {
    const now = host.now();
    const previous = (
      await host.chrome.storage.local.get([TOOLBAR_STATE_SNAPSHOT_KEY])
    )[TOOLBAR_STATE_SNAPSHOT_KEY];
    if (
      typeof previous === "number" &&
      (trigger === "update" ||
        ((trigger === "startup" || trigger === "alarm") &&
          Math.floor(previous / 86400000) === Math.floor(now / 86400000)))
    )
      return;
    await host.reportMetric(
      "codex_chrome_extension_toolbar_state",
      (isOnToolbar ?? (await host.chrome.action.getUserSettings()).isOnToolbar)
        ? 1
        : 0,
      { trigger },
    );
    if (trigger !== "changed")
      await host.chrome.storage.local.set({
        [TOOLBAR_STATE_SNAPSHOT_KEY]: now,
      });
  }
  function report(trigger: string, isOnToolbar?: boolean): void {
    pending = pending
      .then(() => snapshot(trigger, isOnToolbar))
      .catch(() => {
        host.warn("Failed to report Chrome extension toolbar state.");
      });
  }
  function register() {
    host.chrome.action.onUserSettingsChanged?.addListener(({ isOnToolbar }) => {
      if (isOnToolbar != null) report("changed", isOnToolbar);
    });
    host.chrome.alarms.onAlarm.addListener(({ name }) => {
      if (name === TOOLBAR_STATE_ALARM) report("alarm");
    });
    host.chrome.alarms
      .get(TOOLBAR_STATE_ALARM)
      .then((alarm) => {
        if (!alarm)
          return host.chrome.alarms.create(TOOLBAR_STATE_ALARM, {
            periodInMinutes: 360,
          });
      })
      .catch(() =>
        host.warn("Failed to schedule Chrome extension toolbar state."),
      );
  }
  return { register, report };
}
