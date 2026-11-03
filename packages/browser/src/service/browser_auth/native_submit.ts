/** Original J_. Self-contained page callback: validate then submit a private shadow form. */
export function nativeAuthSubmit(
  element: any,
  injected: any,
  request: any,
): boolean {
  const document = element.ownerDocument;
  const view = document.defaultView;
  if (view == null || view.location.origin !== request.target.origin)
    return false;
  const username = injected.retarget(element, "follow-label");
  const access = {
    unique(selector: string) {
      const matches = injected.querySelectorAll(
        injected.parseSelector(selector),
        document.documentElement,
      );
      return matches.length === 1 ? matches[0] : undefined;
    },
    input(element: any, key: string): any {
      return Reflect.get(view.HTMLInputElement.prototype, key, element);
    },
    control(element: any, key: string): any {
      return Reflect.get(
        element instanceof view.HTMLButtonElement
          ? view.HTMLButtonElement.prototype
          : view.HTMLInputElement.prototype,
        key,
        element,
      );
    },
    disabled(element: any): boolean {
      return view.Element.prototype.matches.call(element, ":disabled");
    },
    submitter(element: any): boolean {
      return (
        (element instanceof view.HTMLButtonElement ||
          element instanceof view.HTMLInputElement) &&
        !access.disabled(element) &&
        ["submit", "image"].includes(access.control(element, "type"))
      );
    },
  };
  const password = access.unique(request.password.selector);
  const submit = access.unique(request.submit.selector);
  if (
    !(username instanceof view.HTMLInputElement) ||
    !(password instanceof view.HTMLInputElement) ||
    !(
      submit instanceof view.HTMLButtonElement ||
      submit instanceof view.HTMLInputElement
    )
  )
    return false;
  const form = access.input(username, "form");
  const submitForm = access.control(submit, "form");
  if (
    form == null ||
    form !== access.input(password, "form") ||
    form !== submitForm ||
    access.input(username, "name") !== request.username.name ||
    access.input(password, "name") !== request.password.name ||
    access.input(password, "type") !== "password" ||
    !["text", "email", "tel"].includes(access.input(username, "type")) ||
    [username, password].some((field) =>
      access
        .input(field, "autocomplete")
        .toLowerCase()
        .split(/\s+/)
        .includes("one-time-code"),
    ) ||
    [username, password].some((field) =>
      ["visible", "enabled", "editable"].some(
        (state) => !injected.elementState(field, state).matches,
      ),
    ) ||
    (request.submit.action === "click" &&
      !injected.elementState(submit, "enabled").matches)
  )
    return false;
  const helpers = {
    form(key: string): any {
      return Reflect.get(view.HTMLFormElement.prototype, key, form);
    },
    override(attribute: string, property: string, fallback: any): any {
      return submitter != null &&
        view.Element.prototype.hasAttribute.call(submitter, attribute)
        ? access.control(submitter, property)
        : fallback;
    },
    add(name: string, value: any) {
      entries.push({ name, value });
    },
    create(tag: string): any {
      return view.Document.prototype.createElement.call(document, tag);
    },
    append(parent: any, child: any) {
      view.Node.prototype.appendChild.call(parent, child);
    },
  };
  const controls: any[] = Array.from(helpers.form("elements"));
  const submitter = access.submitter(submit)
    ? submit
    : controls.find(access.submitter);
  if (submitter != null && access.control(submitter, "type") === "image")
    return false;
  const action = helpers.override(
    "formaction",
    "formAction",
    helpers.form("action"),
  );
  let url: any;
  try {
    url = new view.URL(action);
    url.hash = "";
  } catch {
    return false;
  }
  const method = helpers.override(
    "formmethod",
    "formMethod",
    helpers.form("method"),
  );
  const enctype = helpers.override(
    "formenctype",
    "formEnctype",
    helpers.form("enctype"),
  );
  const target = helpers.override(
    "formtarget",
    "formTarget",
    helpers.form("target"),
  );
  if (
    url.href !== request.target.url ||
    url.origin !== request.target.origin ||
    url.protocol !== "https:" ||
    method !== "post" ||
    (target !== "" && target.toLowerCase() !== "_self") ||
    !["application/x-www-form-urlencoded", "multipart/form-data"].includes(
      enctype,
    )
  )
    return false;
  const entries: Array<{ name: string; value: any }> = [];
  let usernames = 0,
    passwords = 0;
  for (const control of controls) {
    if (
      access.disabled(control) ||
      control instanceof view.HTMLFieldSetElement ||
      control instanceof view.HTMLOutputElement
    )
      continue;
    if (
      !(
        control instanceof view.HTMLInputElement ||
        control instanceof view.HTMLButtonElement ||
        control instanceof view.HTMLSelectElement ||
        control instanceof view.HTMLTextAreaElement
      ) ||
      view.Element.prototype.hasAttribute.call(control, "dirname")
    )
      return false;
    const prototype =
      control instanceof view.HTMLInputElement
        ? view.HTMLInputElement.prototype
        : control instanceof view.HTMLButtonElement
          ? view.HTMLButtonElement.prototype
          : control instanceof view.HTMLSelectElement
            ? view.HTMLSelectElement.prototype
            : view.HTMLTextAreaElement.prototype;
    const name = Reflect.get(prototype, "name", control);
    if (!name) continue;
    if (control === username) {
      usernames++;
      helpers.add(name, request.values?.username ?? "");
    } else if (control === password) {
      passwords++;
      helpers.add(name, request.values?.password ?? "");
    } else {
      if (name === request.username.name || name === request.password.name)
        return false;
      if (control instanceof view.HTMLInputElement) {
        const type = access.input(control, "type");
        if (["file", "password", "image"].includes(type)) return false;
        if (
          ["reset", "button"].includes(type) ||
          (type === "submit" && control !== submitter) ||
          (["checkbox", "radio"].includes(type) &&
            !access.input(control, "checked"))
        )
          continue;
        helpers.add(name, access.input(control, "value"));
      } else if (control instanceof view.HTMLButtonElement) {
        if (control === submitter)
          helpers.add(name, Reflect.get(prototype, "value", control));
      } else if (control instanceof view.HTMLTextAreaElement)
        helpers.add(name, Reflect.get(prototype, "value", control));
      else {
        const options: any[] = Array.from(
          Reflect.get(
            view.HTMLSelectElement.prototype,
            "options",
            control,
          ) as any,
        );
        for (const option of options)
          if (
            !access.disabled(option) &&
            Reflect.get(view.HTMLOptionElement.prototype, "selected", option)
          )
            helpers.add(
              name,
              Reflect.get(view.HTMLOptionElement.prototype, "value", option),
            );
      }
    }
  }
  if (usernames !== 1 || passwords !== 1) return false;
  if (request.values == null) return true;
  const host = helpers.create("div");
  const shadow = view.Element.prototype.attachShadow.call(host, {
    mode: "closed",
  });
  const privateForm = helpers.create("form");
  for (const [key, value] of Object.entries({
    action: url.href,
    method,
    enctype,
    target: "_self",
  })) {
    const setter = Object.getOwnPropertyDescriptor(
      view.HTMLFormElement.prototype,
      key,
    )?.set;
    if (setter == null) return false;
    setter.call(privateForm, value);
  }
  const setValue = Object.getOwnPropertyDescriptor(
    view.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setValue == null) return false;
  const privateInputs = [];
  for (const { name, value } of entries) {
    const input = helpers.create("input");
    input.type = "hidden";
    input.name = name;
    setValue.call(input, value);
    privateInputs.push(input);
    helpers.append(privateForm, input);
  }
  helpers.append(shadow, privateForm);
  helpers.append(document.documentElement, host);
  try {
    view.HTMLFormElement.prototype.submit.call(privateForm);
  } finally {
    for (const input of privateInputs) setValue.call(input, "");
  }
  return true;
}
