# External Baidu verification — 2026-11-05

This evidence does not establish completion of either user acceptance command.

## Actual execution

The packaged native extension was loaded into an isolated Chromium profile. Chrome itself launched the registered independent Native Messaging host. The reconstructed CUA service ran through the installed native node_repl supervisor, MCP client and DeepSeek AgentLoop. No browser operation was replaced by a mock. The user's daily Chrome profile was not used.

1. Deterministic navigation reached `https://www.baidu.com/`.
2. An instrumented rerun captured the real DOM snapshot. The site-status request returned a transport error in approximately 90 ms; the reconstructed upstream `SiteStatus.checkUrl` handled that error with its existing behavior. No security gate or backend configuration was disabled or replaced.
3. Earlier identical probes timed out before the authority assertion completed. A successful rerun does not establish that this intermittent problem is fixed. The temporary build-output instrumentation has been removed.
4. With instrumentation removed, a real DeepSeek run opened Baidu, filled `deepseek` using Playwright, clicked the search button and observed the resulting page.
5. Baidu redirected to its `wappass.baidu.com` captcha origin. The test authorizes only `https://www.baidu.com`, so observing the new origin was declined. No captcha interaction or bypass was performed. DeepSeek reported the missing results instead of inventing a first result.
6. The live test failed its search-result assertion as intended. A successful search submission is not successful retrieval of the first result.

The model initially tried the unavailable `iab` backend and native accessibility input on a DOM-only tab before recovering. Demo instructions now explicitly require selecting an observed browser backend, using Playwright input on DOM-only tabs, and stopping a denied action rather than retrying another observation format. These instructions are demo policy, not changes to reconstructed upstream CUA behavior; they are not a guarantee that every model will comply.

## Repeatable entry points

Build the reconstruction and native extension first, as described in the root README. These tests use disposable profiles and require the installed ChatGPT native runtime.

```sh
# Real external page navigation and DOM observation; no model token needed.
CUA_BROWSER_BAIDU_PROBE=1 npx tsx --test reconstruction/extension-native-controller.test.ts

# Real DeepSeek search acceptance; reads the gitignored project .env.
# Remains a failing acceptance check if timeout, captcha or missing results occurs.
CUA_LIVE_BAIDU_TEST=1 npx tsx --test reconstruction/extension-native-controller.test.ts
```

The default test remains the deterministic local-page integration test. Do not count its success as external-search acceptance. Loading the Core CUA extension in daily Chrome remains a separate prerequisite for testing the user's normal browser session.
