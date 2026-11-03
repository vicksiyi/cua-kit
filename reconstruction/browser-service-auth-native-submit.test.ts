import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { nativeAuthSubmit } from "../packages/browser/src/service/browser_auth/native_submit";
const original = originalServiceBindings(["J_"]).J_;
test("private auth submit matches original Chromium validation, payload and cleanup", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<form method="post" action="/submit#hash"><input id="u" name="username" value="existing-user"><input id="p" type="password" name="password" value="existing-password"><button id="submit" name="go" value="yes">Go</button><input name="csrf" value="synthetic-token"><input type="checkbox" name="selected" value="yes" checked><input type="checkbox" name="unchecked"><textarea name="note">hello</textarea><select name="choice" multiple><option selected value="a">A</option><option selected disabled value="b">B</option></select></form>',
      }),
    );
    async function run(source: boolean, mode: string) {
      await page.goto("https://fixture.test/");
      return page.evaluate(
        ({ script, mode }) => {
          const form = document.querySelector("form")!;
          const user = document.querySelector<HTMLInputElement>("#u")!;
          const pass = document.querySelector<HTMLInputElement>("#p")!;
          const button = document.querySelector<HTMLButtonElement>("#submit")!;
          const request: any = {
            target: {
              origin: location.origin,
              url: location.origin + "/submit",
            },
            username: { selector: "#u", name: "username" },
            password: { selector: "#p", name: "password" },
            submit: { selector: "#submit", action: "click" },
            values: { username: "synthetic-u", password: "synthetic-p" },
          };
          if (mode === "dry-run") delete request.values;
          if (mode === "wrong-origin")
            request.target.origin = "https://other.test";
          if (mode === "wrong-url") request.target.url += "?changed";
          if (mode === "get") form.method = "get";
          if (mode === "http") form.action = "http://fixture.test/submit";
          if (mode === "target") form.target = "_blank";
          if (mode === "enctype") form.enctype = "text/plain";
          if (mode === "multipart") form.enctype = "multipart/form-data";
          if (mode === "username-type") user.type = "number";
          if (mode === "password-type") pass.type = "text";
          if (mode === "username-name") user.name = "other";
          if (mode === "otp") pass.autocomplete = "section-a one-time-code";
          if (mode === "separate-form") {
            const other = document.createElement("form");
            document.body.append(other);
            other.append(pass);
          }
          if (mode === "duplicate-selector") {
            const clone = pass.cloneNode(true);
            form.append(clone);
          }
          if (mode === "duplicate-name") {
            const other = document.createElement("input");
            other.name = "username";
            form.append(other);
          }
          if (mode === "file") {
            const other = document.createElement("input");
            other.name = "attachment";
            other.type = "file";
            form.append(other);
          }
          if (mode === "dirname") user.setAttribute("dirname", "direction");
          if (mode === "disabled-user") user.disabled = true;
          if (mode === "disabled-submit") button.disabled = true;
          if (mode === "readonly") pass.readOnly = true;
          if (mode === "hidden") user.style.display = "none";
          if (mode === "override") {
            button.formAction = location.origin + "/override";
            request.target.url = button.formAction;
          }
          if (mode === "override-get") button.formMethod = "get";
          if (mode === "shadowed-property") {
            Object.defineProperty(form, "action", {
              value: "https://evil.test",
            });
            Object.defineProperty(user, "value", { value: "wrong" });
          }
          if (mode === "image") {
            const image = document.createElement("input");
            image.type = "image";
            image.id = "submit";
            button.replaceWith(image);
          }
          const captured: any[] = [];
          let retained: HTMLInputElement[] = [];
          HTMLFormElement.prototype.submit = function () {
            retained = Array.from(this.querySelectorAll("input"));
            captured.push({
              action: this.action,
              method: this.method,
              enctype: this.enctype,
              target: this.target,
              closed: (this.getRootNode() as ShadowRoot).mode,
              fields: retained.map((input) => ({
                name: input.name,
                value: input.value,
              })),
            });
            if (mode === "submit-throws") throw new Error("submit failure");
          };
          const injected = {
            retarget(element: Element) {
              return element;
            },
            parseSelector(selector: string) {
              return selector;
            },
            querySelectorAll(selector: string, root: Element) {
              return [...root.querySelectorAll(selector)];
            },
            elementState(element: any, state: string) {
              return {
                matches:
                  state === "visible"
                    ? getComputedStyle(element).display !== "none"
                    : state === "enabled"
                      ? !element.disabled
                      : !element.readOnly,
              };
            },
          };
          let result: any;
          try {
            result = (0, eval)(`(${script})`)(user, injected, request);
          } catch (error) {
            result = { error: (error as Error).message };
          }
          return {
            result,
            captured,
            cleared: retained.map((input) => input.value),
            originalValues: [
              Reflect.get(HTMLInputElement.prototype, "value", user),
              Reflect.get(HTMLInputElement.prototype, "value", pass),
            ],
          };
        },
        { script: (source ? original : nativeAuthSubmit).toString(), mode },
      );
    }
    for (const mode of [
      "normal",
      "dry-run",
      "wrong-origin",
      "wrong-url",
      "get",
      "http",
      "target",
      "enctype",
      "multipart",
      "username-type",
      "password-type",
      "username-name",
      "otp",
      "separate-form",
      "duplicate-selector",
      "duplicate-name",
      "file",
      "dirname",
      "disabled-user",
      "disabled-submit",
      "readonly",
      "hidden",
      "override",
      "override-get",
      "shadowed-property",
      "image",
      "submit-throws",
    ])
      assert.deepEqual(await run(false, mode), await run(true, mode), mode);
    const normal = await run(false, "normal");
    assert.equal(normal.result, true);
    assert.equal(normal.captured.length, 1);
    assert.deepEqual(normal.originalValues, [
      "existing-user",
      "existing-password",
    ]);
    assert.ok(
      normal.cleared.length > 0 &&
        normal.cleared.every((value) => value === ""),
    );
    assert.equal(normal.captured[0].closed, "closed");
    assert.deepEqual(normal.captured[0].fields.slice(0, 2), [
      { name: "username", value: "synthetic-u" },
      { name: "password", value: "synthetic-p" },
    ]);
    const failed = await run(false, "submit-throws");
    assert.deepEqual(failed.result, { error: "submit failure" });
    assert.ok(failed.cleared.every((value) => value === ""));
    assert.equal((await run(false, "dry-run")).captured.length, 0);
  } finally {
    await browser.close();
  }
});

test("restored native callback sends a real Chromium POST using synthetic private form fields", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body:
          route.request().method() === "POST"
            ? "Submitted"
            : '<form method="post" action="/submit"><input id="u" name="username"><input id="p" name="password" type="password"><button id="submit">Go</button><input name="csrf" value="synthetic-token"></form>',
      }),
    );
    await page.goto("https://fixture.test/");
    const posted = page.waitForRequest(
      (request) => request.method() === "POST",
    );
    const result = await page.evaluate((script) => {
      const injected = {
        retarget(element: Element) {
          return element;
        },
        parseSelector(selector: string) {
          return selector;
        },
        querySelectorAll(selector: string, root: Element) {
          return [...root.querySelectorAll(selector)];
        },
        elementState() {
          return { matches: true };
        },
      };
      return (0, eval)(`(${script})`)(document.querySelector("#u"), injected, {
        target: { origin: location.origin, url: location.origin + "/submit" },
        username: { selector: "#u", name: "username" },
        password: { selector: "#p", name: "password" },
        submit: { selector: "#submit", action: "click" },
        values: { username: "synthetic-user", password: "synthetic-password" },
      });
    }, nativeAuthSubmit.toString());
    assert.equal(result, true);
    const request = await posted;
    assert.equal(request.url(), "https://fixture.test/submit");
    assert.deepEqual(
      Object.fromEntries(new URLSearchParams(request.postData()!)),
      {
        username: "synthetic-user",
        password: "synthetic-password",
        csrf: "synthetic-token",
      },
    );
  } finally {
    await browser.close();
  }
});
