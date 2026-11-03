/** Original Y_. Self-contained page callback used for visibility probes and credential field filling. */
export function authFieldPage(element: any, injected: any, request: any) {
  const helpers = {
    specialOtp(input: any) {
      const rect = input.getBoundingClientRect(),
        boxes = input.nextElementSibling?.querySelectorAll(
          ':scope > [aria-hidden="true"]',
        );
      return (
        input.tagName === "INPUT" &&
        input.getAttribute("autocomplete")?.toLowerCase() === "one-time-code" &&
        input.matches(":focus") &&
        rect.width === 0 &&
        rect.height === 0 &&
        Element.prototype.checkVisibility.call(input, {
          opacityProperty: true,
          visibilityProperty: true,
        }) &&
        boxes != null &&
        boxes.length > 1 &&
        boxes.length === input.maxLength &&
        Array.from(boxes).every(
          (box: any) =>
            injected.elementState(box, "visible").matches === true &&
            Element.prototype.checkVisibility.call(box, {
              opacityProperty: true,
            }),
        )
      );
    },
  };
  if (request.operation === "browser-auth-user-visibility")
    return element.tagName !== "INPUT" ||
      element.type !== request.expectedType ||
      (!injected.elementState(element, "visible").matches &&
        !helpers.specialOtp(element)) ||
      !injected.elementState(element, "enabled").matches ||
      !injected.elementState(element, "editable").matches
      ? null
      : Element.prototype.checkVisibility.call(element, {
          opacityProperty: true,
        }) ||
          Array.from(element.labels ?? []).some(
            (label: any) =>
              injected.elementState(label, "visible").matches &&
              Element.prototype.checkVisibility.call(label, {
                opacityProperty: true,
              }),
          );
  const input = injected.retarget(element, "follow-label"),
    realm = input?.ownerDocument.defaultView;
  if (realm == null || !(input instanceof realm.HTMLInputElement))
    throw new Error("Browser auth field is no longer an input");
  for (const state of ["visible", "enabled", "editable"])
    if (
      !injected.elementState(input, state).matches &&
      !(state === "visible" && helpers.specialOtp(input))
    )
      throw new Error(`Browser auth field is not ${state}`);
  input.scrollIntoView({ block: "center", inline: "nearest" });
  const nativeForm = {
    validate() {
      if (request.nativeSubmitSelector == null) return;
      const matches = injected.querySelectorAll(
          injected.parseSelector(request.nativeSubmitSelector),
          input.ownerDocument.documentElement,
        ),
        submit = matches[0];
      if (
        matches.length !== 1 ||
        !(
          submit instanceof realm.HTMLButtonElement ||
          submit instanceof realm.HTMLInputElement
        ) ||
        submit.form == null ||
        submit.form !== input.form
      )
        throw new Error("Browser auth native form changed");
      const form = submit.form;
      const access = {
        get(key: string): any {
          return Reflect.get(realm.HTMLFormElement.prototype, key, form);
        },
        submitter(candidate: any) {
          return (
            (candidate instanceof realm.HTMLButtonElement ||
              candidate instanceof realm.HTMLInputElement) &&
            !candidate.disabled &&
            (candidate.type === "submit" || candidate.type === "image")
          );
        },
      };
      const chosen: any = access.submitter(submit)
        ? submit
        : Array.from(access.get("elements")).find(access.submitter);
      const method =
          chosen?.hasAttribute("formmethod") === true
            ? chosen.formMethod
            : access.get("method"),
        action =
          chosen?.hasAttribute("formaction") === true
            ? chosen.formAction
            : access.get("action"),
        url = new URL(action);
      if (
        method !== "post" ||
        url.protocol !== "https:" ||
        url.origin !== realm.location.origin
      )
        throw new Error("Browser auth native submission changed");
    },
  };
  const hiddenOtp = !injected.elementState(input, "visible").matches;
  nativeForm.validate();
  const result = hiddenOtp ? "needsinput" : injected.fill(input, request.value);
  if (result === "done") return;
  if (result !== "needsinput") throw new Error(result);
  if (!input.isConnected)
    throw new Error("Browser auth field is no longer connected");
  for (const state of ["visible", "enabled", "editable"])
    if (
      !injected.elementState(input, state).matches &&
      !(state === "visible" && helpers.specialOtp(input))
    )
      throw new Error(`Browser auth field is not ${state}`);
  if (hiddenOtp) {
    nativeForm.validate();
    const data = new realm.DataTransfer();
    data.setData("text/plain", request.value);
    if (
      !input.dispatchEvent(
        new realm.ClipboardEvent("paste", {
          bubbles: true,
          composed: true,
          cancelable: true,
          clipboardData: data,
        }),
      )
    )
      return;
  }
  const setter = Object.getOwnPropertyDescriptor(
    realm.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter == null)
    throw new Error("Browser auth field value cannot be updated");
  nativeForm.validate();
  setter.call(input, request.value);
  input.dispatchEvent(
    new realm.InputEvent("input", {
      bubbles: true,
      composed: true,
      data: request.value,
      inputType: hiddenOtp ? "insertFromPaste" : "insertReplacementText",
    }),
  );
}
