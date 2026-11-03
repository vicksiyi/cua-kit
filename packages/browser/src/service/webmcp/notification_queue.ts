import type { WebMcpCommandContext } from "../commands/web_mcp";
export interface NotificationEventSource {
  takePageEvents(): Array<{
    session_id?: string;
    version: number;
    [key: string]: any;
  }>;
  matchesCurrentSessionId(sessionId: string | undefined): boolean;
}
export interface NotificationContext extends WebMcpCommandContext {
  tabLifecycle: { takeEvents(): any[] };
}
type NotificationCollector = (
  pageEvents: any[],
  lifecycleEvents: any[],
  context: NotificationContext,
  deadlineMs: number,
) => Promise<string[]>;
/** Original vx/a6/u6/Gue. Host capability/credential visibility checks are mandatory dependencies. */
export function createBrowserNotificationQueue(dependencies: {
  collectors: NotificationCollector[];
  canObserve(context: NotificationContext): boolean;
  canPublish(): Promise<boolean>;
}) {
  const pending = new Map<NotificationEventSource, NotificationContext>();
  function enqueue(
    source: NotificationEventSource,
    context: NotificationContext,
  ) {
    pending.set(source, context);
  }
  async function flush() {
    const deadlineMs = Date.now() + 10000,
      batch = [...pending];
    pending.clear();
    const messages: string[] = [];
    for (const [source, context] of batch) {
      const pageEvents = source
        .takePageEvents()
        .filter(
          ({ session_id, version }) =>
            version === 1 && source.matchesCurrentSessionId(session_id),
        );
      const lifecycleEvents = context.tabLifecycle.takeEvents();
      if (dependencies.canObserve(context))
        for (const collect of dependencies.collectors) {
          const result = await collect(
            pageEvents,
            lifecycleEvents,
            context,
            deadlineMs,
          );
          if (dependencies.canObserve(context)) messages.push(...result);
        }
    }
    return (await dependencies.canPublish())
      ? messages.length === 0
        ? ""
        : `Browser notifications:\n\n${messages.join("\n\n")}\n`
      : "";
  }
  return { enqueue, flush };
}
