import test from "node:test";
import assert from "node:assert/strict";
import { StatsigClient } from "@statsig/js-client";
import { defaultWebMcpDependencies } from "../packages/browser/src/service/webmcp/defaults";
import { browserTelemetry } from "../packages/browser/src/service/runtime/browser_telemetry";
import {
  webMcpLimits,
  webMcpLimitsConfigName,
} from "../packages/browser/src/service/webmcp/session_catalog";
import { createPackagedAuthSafetyReview } from "../packages/browser/src/service/browser_auth/safety_review";
import { BrowserUseSecurityError } from "../packages/browser/src/service/errors/browser_security_error";
import { originalServiceBindings } from "./service-source";

test("WebMCP default ambient switch matches Ar and gate reader does not require caller identity", async (t) => {
  let client: StatsigClient | undefined;
  const initialize = StatsigClient.prototype.initializeAsync;
  t.mock.method(
    StatsigClient.prototype,
    "initializeAsync",
    function (this: StatsigClient, ...args: Parameters<typeof initialize>) {
      client = this;
      return initialize.apply(this, args);
    },
  );
  const { Ar } = originalServiceBindings(["dl", "zr", "Ar"], {
    mC: "BROWSER_USE_DISABLE_AMBIENT_NETWORK",
  });
  for (const value of [undefined, null, 1, true, "1", " 1 ", "0", "true", ""]) {
    const runtime: any = {
      env: { BROWSER_USE_DISABLE_AMBIENT_NETWORK: value },
    };
    assert.equal(
      defaultWebMcpDependencies.ambientNetworkDisabled(runtime),
      Ar(runtime),
    );
  }
  await assert.rejects(
    defaultWebMcpDependencies.featureFlag("fixture"),
    /require Statsig initialization/,
  );
  await assert.rejects(
    browserTelemetry.readBrowserFeatureGate("fixture"),
    /require caller identity/,
  );
  const requests: string[] = [];
  const runtime: any = {
    env: {},
    platform: "darwin",
    async fetch(url: string) {
      requests.push(url);
      return new Response(
        JSON.stringify({
          feature_gates: {
            fixture: {
              name: "fixture",
              value: true,
              rule_id: "fixture",
              secondary_exposures: [],
            },
          },
          dynamic_configs: {
            [webMcpLimitsConfigName]: {
              name: webMcpLimitsConfigName,
              value: {
                max_tools: 7,
                max_total_descriptor_bytes: 12345,
                max_registration_changes: 3,
              },
              rule_id: "fixture",
              secondary_exposures: [],
            },
          },
          layer_configs: {},
          has_updates: true,
          time: Date.now(),
          hash_used: "none",
        }),
      );
    },
  };
  try {
    await browserTelemetry.initializeClient(runtime);
    assert.equal(await defaultWebMcpDependencies.featureFlag("fixture"), true);
    // Bh calls gh, not the identity-enforcing Gee wrapper.
    await assert.rejects(
      browserTelemetry.readBrowserFeatureGate("fixture"),
      /require caller identity/,
    );
    assert.deepEqual(
      webMcpLimits(defaultWebMcpDependencies.config(webMcpLimitsConfigName)),
      {
        maxTools: 7,
        maxTotalDescriptorBytes: 12345,
        maxRegistrationChanges: 3,
      },
    );
    assert.ok(requests.length > 0);
    assert.ok(requests.every((url) => !url.endsWith("/aura/identity")));
    defaultWebMcpDependencies.emit(runtime, "webmcp_disabled", "tool_count", {
      tool_count: 8,
    });
  } finally {
    await client?.shutdown();
  }
});
test("packaged auth safety fails closed before capture or approval when instructions are absent", async () => {
  for (const content of [undefined, "  "]) {
    const review = createPackagedAuthSafetyReview(
      "file:///synthetic/scripts/service.mjs",
      {
        default: {
          apiManifest: {},
          documentManifest: [],
          documentation:
            content === undefined ? {} : { browserAuthSafetyPrecheck: content },
        },
      },
    );
    const unused = () => {
      throw Error(
        "must not capture or ask approval before safety instructions are available",
      );
    };
    await assert.rejects(
      review.reviewAuthSafety({
        actionTargets: {},
        captureScreenshotAndValidateLocators: unused,
        checkpoint: {},
        credentialFieldMetadata: [],
        credentialFrameId: "frame",
        credentialFrameOrigin: "https://fixture.invalid",
        createAutomatedSafetyPrecheck: unused,
        ctx: {
          clientInfo: { type: "cdp" },
          filesystem: { readFile: unused },
          environment: "cloud",
        },
        params: {},
        proposedUserPrompt: {},
      }),
      (error: any) => {
        assert.ok(error instanceof BrowserUseSecurityError);
        assert.equal(error.reason, "approval_unavailable");
        assert.match(
          error.cause.message,
          content === undefined
            ? /Documentation is not available/
            : /instructions are empty/,
        );
        return true;
      },
    );
  }
});
