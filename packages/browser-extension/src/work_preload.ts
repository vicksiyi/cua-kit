/** Original codex-work-preload v.main. MAIN-world code, without an extension runtime dependency. */
export function installWorkPreload(host: {
  window: Window;
  navigator: Navigator;
}) {
  const parentOrigin = host.window.location.ancestorOrigins?.[0];
  if (
    parentOrigin == null ||
    !/^chrome-extension:\/\/[a-p]{32}$/u.test(parentOrigin)
  )
    return;
  Object.defineProperty(host.window, "__CODEX_BROWSER_SIDE_CHAT__", {
    value: true,
  });
  if (
    new URLSearchParams(host.window.location.search).get("surface") !==
      "browser_side_chat" ||
    typeof host.navigator.mediaDevices?.getUserMedia !== "function"
  )
    return;
  const original = host.navigator.mediaDevices.getUserMedia.bind(
    host.navigator.mediaDevices,
  );
  host.navigator.mediaDevices.getUserMedia = async (constraints) => {
    const audio = !!constraints?.audio;
    const video = !!constraints?.video;
    if (!audio && !video) return original(constraints);
    const statuses = await Promise.all(
      [...(audio ? ["microphone"] : []), ...(video ? ["camera"] : [])].map(
        (name) =>
          host.navigator.permissions.query({ name: name as PermissionName }),
      ),
    );
    if (statuses.some((status) => status.state === "prompt")) {
      const permissionChanges = Promise.all(
        statuses
          .filter((status) => status.state === "prompt")
          .map(
            (status) =>
              new Promise<void>((resolve, reject) => {
                status.addEventListener(
                  "change",
                  () => {
                    if (status.state === "granted") resolve();
                    else
                      reject(
                        new DOMException(
                          "Media permission was not granted",
                          "NotAllowedError",
                        ),
                      );
                  },
                  { once: true },
                );
              }),
          ),
      );
      host.window.parent.postMessage(
        { audio, type: "browser_side_chat_media_permission_request", video },
        parentOrigin,
      );
      await permissionChanges;
    }
    return original(constraints);
  };
}
