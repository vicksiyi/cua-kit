import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { chromium } from "playwright";
import { SiwcAuthenticateCommand } from "../packages/browser/src/service/commands/siwc";
import { createBrowserContextClass } from "../packages/browser/src/service/context/browser_context";
import {
  createSiwcServiceClass,
  SIWC_COOKIE,
} from "../packages/browser-extension/src/siwc";
import { playwrightInstallation } from "../packages/browser/src/service/playwright/injection";
import { upstreamPlaywrightSource } from "../packages/browser/src/service/playwright/upstream_source";

test("authentication context and extension provider integrate with real DOM/CDP and rollback on account change", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["success", "changed-after-cookie"]) {
      const profile = await browser.newContext();
      await profile.route("**/*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<button data-oai-siwc-button onclick=\"document.title='clicked'\">Continue with ChatGPT</button>",
        }),
      );
      const page = await profile.newPage();
      await page.goto("https://siwc-fixture.test/");
      const cdp = await profile.newCDPSession(page);
      await page.evaluate(
        playwrightInstallation(upstreamPlaywrightSource()).expression,
      );
      let user = "fixture-user";
      const trace: string[] = [];
      let network = 0;
      const provider = createSiwcServiceClass({
        chrome: { tabs: { get: async () => ({ incognito: false }) } } as any,
        crypto: webcrypto as any,
        fetch: async (url: any) => {
          network++;
          if (url === "https://chatgpt.com/api/auth/session")
            return new Response(
              JSON.stringify({
                accessToken: "fixture-token",
                account: { id: "fixture-account", structure: "personal" },
                user: { id: user },
              }),
            );
          assert.equal(
            url,
            "https://auth.openai.com/oauth/siwc/browser-grants",
          );
          return new Response(
            JSON.stringify({
              credential_type:
                "urn:openai:params:authapi:grant-type:siwc_browser_bootstrap",
              browser_bootstrap_grant: "fixture-grant-not-a-credential",
              expires_at: Math.floor(Date.now() / 1000) + 60,
              expires_in: 60,
            }),
          );
        },
      });
      const session = {
        getCommittedTabUrl: async () => page.url(),
        executeCdp: async (request: any) => {
          trace.push(request.method);
          const result = await cdp.send(request.method, request.commandParams);
          if (
            request.method === "Network.setCookie" &&
            mode === "changed-after-cookie"
          )
            user = "changed-user";
          return result;
        },
      };
      const service = new provider.SiwcService(async () => session);
      const prototype = createBrowserContextClass({} as any).prototype;
      const bridge: any = {
        clientInfo: { type: "extension" },
        api: {
          sendSessionRequest: async (method: string, payload: any) => {
            trace.push(method);
            return (service as any)[method]({
              ...payload,
              session_id: "fixture-session",
              turn_id: "fixture-turn",
            });
          },
        },
      };
      const context: any = {
        supportsTabCapability: async () => true,
        getCurrentSessionId: () => "fixture-session",
        security: { currentTabUrl: async () => page.url() },
        acquireAuthority: () => {
          const gate = {
            observeContent: () => gate,
            actInFrame: () => gate,
            assert: async () => {},
          };
          return gate;
        },
        cdp: { call: async (_id: any, method: any) => cdp.send(method) },
        playwright: {
          evaluateOnPlaywrightPage: async (_id: any, fn: any) =>
            page.evaluate(
              `(${fn.toString()})(window.__codexPlaywrightInjected)`,
            ),
          withBoundPlaywrightSelector: async (
            _id: any,
            selector: string,
            validate: any,
            run: any,
          ) => {
            if (!(await validate())) return;
            const ref = selector.slice("aria-ref=".length);
            return run({
              evaluateOnPlaywrightSelector: async (
                _id: any,
                _selector: any,
                fn: any,
                options: any,
              ) =>
                page.evaluate(
                  `(()=>{const __name=x=>x;const injected=window.__codexPlaywrightInjected;return (${fn.toString()})(injected._lastAriaSnapshotForQuery.elements.get(${JSON.stringify(ref)}),injected,${JSON.stringify(options.arg)});})()`,
                ),
              clickLocator: async () => {
                trace.push("click");
                await page.locator("button").click();
              },
            });
          },
        },
        preferences: {
          getSiwcPermission: async () => null,
          isPersistentApprovalAllowed: async () => false,
          handleSiwcPromptResult: async () => {},
        },
        commandTiming: { trackElicitation: (fn: any) => fn },
        runtime: { createElicitation: async () => ({ action: "accept" }) },
        followSessionTab: async () => {
          trace.push("follow");
        },
      };
      for (const name of [
        "getSiwcAccountContext",
        "issueSiwcBrowserGrant",
        "installSiwcBrowserGrantCookie",
      ])
        context[name] = (...args: any[]) =>
          (prototype as any)[name].apply(bridge, args);
      const result = await SiwcAuthenticateCommand({ tab_id: "7" }, context);
      const cookies = await profile.cookies("https://auth.openai.com");
      if (mode === "success") {
        assert.deepEqual(result, { status: "initiated" });
        assert.equal(await page.title(), "clicked");
        const cookie = cookies.find((c) => c.name === SIWC_COOKIE)!;
        assert(cookie);
        assert(cookie.httpOnly && cookie.secure);
        assert.equal(cookie.sameSite, "Lax");
        assert(trace.indexOf("Network.setCookie") < trace.indexOf("click"));
      } else {
        assert.deepEqual(result, { status: "cookie_failed" });
        assert(!trace.includes("click"));
        assert(trace.includes("Network.deleteCookies"));
        assert(!cookies.some((c) => c.name === SIWC_COOKIE));
      }
      assert(network > 0);
      await profile.close();
    }
  } finally {
    await browser.close();
  }
});
