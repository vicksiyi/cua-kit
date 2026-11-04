import { browserFamilies, identifyBrowserFamily } from "./browser_platform";
export interface MediaPermissionPageHost {
  document: Document;
  window: Pick<Window, "location" | "matchMedia">;
  navigator: Pick<Navigator, "userAgent" | "mediaDevices">;
  initializeTelemetry(entry: "microphone-permission"): unknown;
}
/** Original page d/W/x. The page lifetime owns the media-query subscription. */
export function initializeMediaPermissionTheme(
  host: Pick<MediaPermissionPageHost, "window" | "document">,
) {
  const apply = (theme: "light" | "dark") => {
    host.document.documentElement.setAttribute("data-theme", theme);
    host.document.documentElement.style.colorScheme = theme;
  };
  const query = "(prefers-color-scheme: dark)";
  const current = () => {
    if (typeof host.window.matchMedia !== "function") return "light";
    try {
      return host.window.matchMedia(query).matches ? "dark" : "light";
    } catch {
      return "light";
    }
  };
  apply(current());
  if (typeof host.window.matchMedia !== "function") return;
  let media: MediaQueryList;
  try {
    media = host.window.matchMedia(query);
  } catch {
    return;
  }
  const changed = (event: MediaQueryListEvent) =>
    apply(event.matches ? "dark" : "light");
  apply(media.matches ? "dark" : "light");
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", changed);
    return;
  }
  media.addListener(changed);
}
/** Original permission page startup and D. Starts a real browser permission
 * request on invocation and retries from the button. Successful tracks are
 * stopped immediately; denial restores the help UI. */
export function startMediaPermissionPage(host: MediaPermissionPageHost) {
  host.initializeTelemetry("microphone-permission");
  initializeMediaPermissionTheme(host);
  const doc = host.document;
  const button = doc.querySelector<HTMLButtonElement>("#allow-microphone"),
    help = doc.querySelector<HTMLElement>("#permission-help"),
    status = doc.querySelector<HTMLElement>("#status"),
    browserLabel = doc.querySelector<HTMLElement>("#browser-name"),
    title = doc.querySelector<HTMLElement>("#permission-title"),
    description = doc.querySelector<HTMLElement>("#permission-description");
  if (
    button == null ||
    help == null ||
    status == null ||
    browserLabel == null ||
    title == null ||
    description == null
  )
    throw new Error("Microphone permission page root not found");
  const params = new URLSearchParams(host.window.location.search);
  const camera = params.get("camera") === "1",
    microphone = params.get("microphone") !== "0";
  const devices = camera
    ? microphone
      ? "camera and microphone"
      : "camera"
    : "microphone";
  const browserName =
    browserFamilies[identifyBrowserFamily(host.navigator.userAgent)]
      .shortDisplayName;
  browserLabel.textContent = browserName;
  if (camera) {
    doc.title = `ChatGPT ${devices} access`;
    title.textContent = `Allow ${devices} access`;
    button.textContent = `Allow ${devices} access`;
    description.replaceChildren(
      `ChatGPT needs ${devices} access. Click the button, then choose Allow in `,
      browserLabel,
      ".",
    );
  }
  const request = async () => {
    help.hidden = true;
    button.disabled = true;
    status.textContent = `Waiting for ${browserName} permission`;
    try {
      (
        await host.navigator.mediaDevices.getUserMedia({
          audio: microphone,
          video: camera,
        })
      )
        .getTracks()
        .forEach((track) => track.stop());
    } catch {
      help.hidden = false;
      button.disabled = false;
      status.textContent = camera
        ? `${devices} access was not allowed. Try again.`
        : "Microphone access was not allowed. Try again to use dictation.";
    }
  };
  button.addEventListener("click", () => {
    request();
  });
  request();
}
