export const ServerErrorCode = {
  senderProcessNotAuthenticated: -10000,
  couldNotGetRequestData: -10001,
  couldNotGetRequestTypeName: -10002,
  couldNotResolveRequestType: -10003,
  unhandledEvent: -10004,
  unknownError: -10005,
  appNotAllowed: -10006,
  runningApplicationNotFound: -10007,
  accessibilityError: -10008,
  permissionsNotGranted: -10009,
  invalidApp: -10010,
  noActiveSession: -10011,
  userStoppedSession: -10012,
  incompatibleClientVersion: -10013,
  permissionsPending: -10014,
  blockedURL: -10015,
  userIntervened: -10016,
  couldNotGetSenderPID: -10017,
  ambiguousApp: -10018,
  couldNotGetBootstrapPort: -10019,
  screenLocked: -10020,
} as const;
const errorNames = new Map<number, string>(
  Object.entries(ServerErrorCode).map(([name, code]) => [code, name]),
);
export class SkyComputerUseError extends Error {
  code: number;
  errorName: string;
  request: unknown;
  requestType: string;
  constructor(args: {
    code: number;
    message: string;
    request: unknown;
    requestType: string;
  }) {
    super(args.message);
    this.name = "SkyComputerUseError";
    this.code = args.code;
    this.errorName = errorNames.get(args.code) ?? "jsonRPCError";
    this.request = args.request;
    this.requestType = args.requestType;
  }
}
export class SkyComputerUseTransportError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = "SkyComputerUseTransportError";
    this.cause = options.cause;
  }
}
