import { MacNativePipeTransport } from "./native-pipe";
import type { CodexMetadata } from "./native-pipe";
export { SkyComputerUseError, SkyComputerUseTransportError } from "./errors";
type SkyDiscoveredApp = {
  appPath?: string | null;
  bundleIdentifier?: string;
  displayName?: string;
  isFrontmost?: boolean;
  isRunning?: boolean;
  lastUsedDate?: string | null;
  useCount?: number | null;
};
type RequestOptions = {
  apiVersion?: string;
  codexMetadata?: CodexMetadata;
  timeoutSeconds?: number;
};
type AppArgs =
  | string
  | {
      app?: string;
    };
type GetAppStateArgs =
  | string
  | {
      app?: string;
      disableDiff?: boolean;
    };
type StartAudioRecordingArgs = {
  maxDurationMilliseconds?: number;
};
type ClickArgs = {
  app: string;
  clickCount?: number;
  elementIndex?: number;
  key?: string;
  duration?: number;
  mouseButton?: ("left" | "right" | "middle" | "l" | "r" | "m") | number;
  x?: number;
  y?: number;
};
type DragArgs = {
  app: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};
type PasteArgs = {
  app: string;
  text: string;
  format: "text" | "md" | "html";
};
type PerformSecondaryActionArgs = {
  action: string;
  app: string;
  elementIndex: number;
};
type PressKeyArgs = {
  app: string;
  key: string;
  duration?: number;
};
type ScrollArgs = {
  app: string;
  direction: "up" | "down" | "left" | "right" | "u" | "d" | "l" | "r";
  elementIndex?: number;
  pages?: number;
  x?: number;
  y?: number;
};
type SelectTextArgs = {
  app: string;
  elementIndex: number;
  text: string;
  prefix?: string;
  suffix?: string;
  selection?: "text" | "cursor_before" | "cursor_after";
};
type SetValueArgs = {
  app: string;
  elementIndex: number;
  value: string;
};
type TypeTextArgs = {
  app: string;
  text: string;
};
type MacApp = {
  bundleIdentifier?: string;
  pid?: number;
};
type MacAppPolicyTarget = {
  appPath: string;
  bundleIdentifier: string;
  displayName: string;
  risk: "high" | "low";
  warningSubtitle?: string | null;
};
export type MacAppPolicyResult = {
  allowPersistentApproval: boolean;
  decision: "allowed" | "denied" | "forbidden";
  target: MacAppPolicyTarget;
};
export type MacWindowSkyshot = {
  text: string;
  screenshot?: {
    url?: string | null;
    mimeType?: string | null;
  } | null;
};
export type MacWindowAppState = {
  app: string | MacApp;
  appSpecificInstructions?: string | null;
  skyshot?: MacWindowSkyshot;
};
export type MacAudio = {
  url?: string | null;
};
export class MacComputerUseClient {
  private readonly apiVersion: string;
  private readonly codexMetadata: CodexMetadata;
  private readonly timeoutSeconds: number;
  private readonly transports = new Map<
    string,
    Promise<MacNativePipeTransport>
  >();
  constructor(options: RequestOptions = {}) {
    this.apiVersion = options.apiVersion ?? "CodexComputerUseIPC-5";
    this.codexMetadata = options.codexMetadata;
    this.timeoutSeconds = options.timeoutSeconds ?? 120;
  }
  listApps(options: RequestOptions = {}): Promise<SkyDiscoveredApp[]> {
    return this.request("ComputerUseIPCListAppsRequest", {}, options);
  }
  startAudioRecording(
    args: StartAudioRecordingArgs,
    options: RequestOptions = {},
  ): Promise<void> {
    return this.request(
      "ComputerUseIPCStartAudioRecordingRequest",
      args,
      options,
    );
  }
  stopAudioRecording(options: RequestOptions = {}): Promise<MacAudio> {
    return this.request("ComputerUseIPCStopAudioRecordingRequest", {}, options);
  }
  getAppPolicy(
    args: AppArgs,
    options: RequestOptions = {},
  ): Promise<MacAppPolicyResult> {
    return this.request(
      "ComputerUseIPCAppPolicyRequest",
      appTarget(typeof args === "string" ? args : args.app),
      options,
    );
  }
  startApp(
    args: AppArgs,
    options: RequestOptions = {},
  ): Promise<MacWindowAppState> {
    return this.request(
      "ComputerUseIPCAppStartRequest",
      appTarget(typeof args === "string" ? args : args.app),
      options,
    );
  }
  getAppState(
    args: GetAppStateArgs,
    options: RequestOptions = {},
  ): Promise<MacWindowAppState> {
    return this.request(
      "ComputerUseIPCAppGetSkyshotRequest",
      typeof args === "string"
        ? appTarget(args)
        : { ...appTarget(args.app), disableDiff: args.disableDiff },
      options,
    );
  }
  click(args: ClickArgs, options: RequestOptions = {}): Promise<void> {
    if (args.duration !== undefined && !Number.isFinite(args.duration))
      throw new TypeError("duration must be a finite number");
    const count = args.clickCount === undefined ? 1 : args.clickCount,
      button = args.mouseButton === undefined ? "left" : args.mouseButton;
    return this.performAction(
      args.app,
      {
        click: {
          at: actionTarget(args),
          clickCount: count,
          key: args.key,
          duration: args.duration,
          mouseButton: mouseButton(button),
        },
      },
      options,
    );
  }
  drag(args: DragArgs, options: RequestOptions = {}): Promise<void> {
    return this.performAction(
      args.app,
      {
        drag: {
          from: coordinates({ x: args.fromX, y: args.fromY }, "from"),
          to: coordinates({ x: args.toX, y: args.toY }, "to"),
        },
      },
      options,
    );
  }
  paste(args: PasteArgs, options: RequestOptions = {}): Promise<void> {
    return this.performAction(
      args.app,
      { paste: { text: args.text, format: args.format } },
      options,
    );
  }
  performSecondaryAction(
    args: PerformSecondaryActionArgs,
    options: RequestOptions = {},
  ): Promise<void> {
    return this.performAction(
      args.app,
      {
        performSecondaryAction: {
          action: args.action,
          elementID: elementId(args.elementIndex),
        },
      },
      options,
    );
  }
  pressKey(args: PressKeyArgs, options: RequestOptions = {}): Promise<void> {
    if (args.key.trim() === "") throw new TypeError("key is required");
    if (args.duration !== undefined && !Number.isFinite(args.duration))
      throw new TypeError("duration must be a finite number");
    return this.performAction(
      args.app,
      { pressKey: { _0: args.key, duration: args.duration } },
      options,
    );
  }
  scroll(args: ScrollArgs, options: RequestOptions = {}): Promise<void> {
    const pages = args.pages === undefined ? 1 : args.pages;
    if (!Number.isFinite(pages) || pages <= 0)
      throw new TypeError("pages must be a finite number > 0");
    return this.performAction(
      args.app,
      {
        scroll: {
          at: actionTarget(args),
          direction: scrollDirection(args.direction),
          pages,
        },
      },
      options,
    );
  }
  setValue(args: SetValueArgs, options: RequestOptions = {}): Promise<void> {
    return this.performAction(
      args.app,
      {
        setValue: {
          elementID: elementId(args.elementIndex),
          value: args.value,
        },
      },
      options,
    );
  }
  selectText(
    args: SelectTextArgs,
    options: RequestOptions = {},
  ): Promise<void> {
    return this.performAction(
      args.app,
      {
        selectText: {
          elementID: elementId(args.elementIndex),
          text: args.text,
          prefix: args.prefix,
          suffix: args.suffix,
          selection: args.selection === undefined ? "text" : args.selection,
        },
      },
      options,
    );
  }
  typeText(args: TypeTextArgs, options: RequestOptions = {}): Promise<void> {
    return this.performAction(args.app, { type: { _0: args.text } }, options);
  }
  private performAction(
    app: string,
    action: unknown,
    options: RequestOptions,
  ): Promise<void> {
    return this.request(
      "ComputerUseIPCAppPerformActionRequest",
      { ...appTarget(app), action },
      options,
    );
  }
  private async request<T>(
    requestType: string,
    request: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const version = options.apiVersion ?? this.apiVersion;
    return (await this.getTransport(version)).request({
      requestType,
      request: stripUndefined(request),
      timeoutSeconds: options.timeoutSeconds ?? this.timeoutSeconds,
      codexMetadata:
        options.codexMetadata !== undefined
          ? options.codexMetadata
          : this.codexMetadata !== undefined
            ? this.codexMetadata
            : currentMetadata(),
    });
  }
  private async getTransport(version: string): Promise<MacNativePipeTransport> {
    for (;;) {
      const pending = this.transport(version);
      try {
        const transport = await pending;
        if (!transport.isClosed) return transport;
        if (this.transports.get(version) === pending)
          this.transports.delete(version);
      } catch (error) {
        if (this.transports.get(version) === pending)
          this.transports.delete(version);
        throw error;
      }
    }
  }
  private transport(version: string) {
    let pending = this.transports.get(version);
    if (pending == null) {
      pending = MacNativePipeTransport.create(version);
      this.transports.set(version, pending);
    }
    return pending;
  }
}
export const client = new MacComputerUseClient();
function currentMetadata(): CodexMetadata {
  return (globalThis as any).nodeRepl?.requestMeta?.["x-codex-turn-metadata"];
}
function appTarget(app: string | undefined) {
  if (app == null || app.trim() === "") throw new TypeError("app is required");
  return { app };
}
function actionTarget(args: { elementIndex?: number; x?: number; y?: number }) {
  return args.elementIndex == null
    ? { coordinate: { _0: coordinates(args, "coordinate") } }
    : { elementID: { _0: elementId(args.elementIndex) } };
}
function coordinates(point: { x?: number; y?: number }, label: string) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new TypeError(`${label} must include finite x and y coordinates`);
  return [Number(point.x), Number(point.y)];
}
function elementId(index: number) {
  if (!Number.isInteger(index))
    throw new TypeError("elementIndex must be an integer");
  return String(index);
}
function mouseButton(button: string | number) {
  if (typeof button === "number") {
    if ([0, 1, 2].includes(button)) return button;
    throw new TypeError("mouseButton number must be 0, 1, or 2");
  }
  switch (button.trim().toLowerCase()) {
    case "l":
    case "left":
      return 0;
    case "r":
    case "right":
      return 1;
    case "m":
    case "middle":
      return 2;
    default:
      throw new TypeError(
        "mouseButton must be left, right, middle, l, r, m, 0, 1, or 2",
      );
  }
}
function scrollDirection(direction: string) {
  switch (direction.trim().toLowerCase()) {
    case "u":
    case "up":
      return "up";
    case "d":
    case "down":
      return "down";
    case "l":
    case "left":
      return "left";
    case "r":
    case "right":
      return "right";
    default:
      throw new TypeError("direction must be up, down, left, or right");
  }
}
function stripUndefined(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(stripUndefined)
    : value == null || typeof value !== "object"
      ? value
      : Object.fromEntries(
          Object.entries(value)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, stripUndefined(value)]),
        );
}
