/** Original q2: synthesize an AX tree for JavaScript dialogs while page capture is unavailable. */
export function javaScriptDialogTree(
  tab: { title?: string | null } | undefined,
  dialog: {
    id: string;
    url: string;
    type: string;
    message: string;
    promptText?: string;
  },
) {
  const property = (value: unknown) => ({ value, relatedNodes: [] });
  const node = (
    parentIndex: number,
    control: string,
    role: string,
    name: string,
    extra: Record<string, unknown> = {},
  ) => ({
    parentIndex,
    nodeID: `javascript-dialog:${dialog.id}:${control}`,
    role,
    chromeRole: null,
    name,
    nameSource: "attribute",
    description: null,
    value: null,
    properties: {},
    dom: {
      bounds: null,
      identifier: null,
      className: null,
      declaredRole: role,
      hasAriaDescription: null,
      tagName: null,
    },
    backendDOMNodeID: null,
    targetID: null,
    ...extra,
  });
  let url: URL | undefined;
  try {
    url = new URL(dialog.url);
  } catch {}
  const title = url?.host ? `${url.host} says` : "This page says";
  const nodes = [
    node(-1, "root", "RootWebArea", tab?.title ?? "Web page"),
    node(0, "dialog", "alertdialog", title, {
      properties: { modal: property(true) },
    }),
    node(1, "message", "StaticText", dialog.message),
  ];
  if (dialog.type === "prompt")
    nodes.push(
      node(1, "prompt", "textbox", "Response", {
        value: dialog.promptText,
        properties: {
          editable: property("plaintext"),
          focusable: property(true),
          focused: property(true),
          settable: property(true),
        },
        dialogTarget: { dialogID: dialog.id, control: "prompt" },
      }),
    );
  if (dialog.type !== "alert")
    nodes.push(
      node(
        1,
        "dismiss",
        "button",
        dialog.type === "beforeunload" ? "Stay" : "Cancel",
        {
          properties: { focusable: property(true) },
          dialogTarget: { dialogID: dialog.id, control: "dismiss" },
        },
      ),
    );
  nodes.push(
    node(
      1,
      "accept",
      "button",
      dialog.type === "beforeunload" ? "Leave" : "OK",
      {
        properties: {
          focusable: property(true),
          focused: property(dialog.type !== "prompt"),
        },
        dialogTarget: { dialogID: dialog.id, control: "accept" },
      },
    ),
  );
  return nodes;
}
