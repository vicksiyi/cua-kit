#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: npm run demo -- [--auto-approve] [--managed-browser|--cdp-browser|--cdp-endpoint ws://127.0.0.1:PORT/devtools/browser/ID] [--browser|--computer|--unified|--swift-computer|--js|--check-browser|--check-computer] "your prompt"' '--auto-approve accepts browser/app MCP confirmation requests without terminal prompts; data-entry forms and URL authentication still use their normal flow. Service policies and macOS permissions remain enforced.' 'Default: unified browser + native app tools on macOS; browser tools on other systems. Explicit browser deployment flags select browser-only mode. Model provider: deepseek or openai-compatible via CUA_MODEL_PROVIDER. --js selects JavaScript-only tools. Project .env is loaded automatically. --computer and --swift-computer select the Rust + original Sky + Swift route. --unified enables browser and computer together; it discovers existing browser connections without eagerly launching Chrome.'
  exit 0
fi
managed_browser=false
cdp_browser=false
backend=""
mode=""
check_option=""
check_only=false
unset CUA_CDP_ENDPOINT CUA_DEMO_START_CHROME
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdp-browser|--managed-browser|--cdp-endpoint)
      if [[ -n "$backend" ]]; then printf '%s\n' 'Choose only one browser deployment option.' >&2; exit 2; fi
      backend="$1"
      if [[ "$1" == --cdp-endpoint ]]; then
        if [[ -z "${2:-}" || "${2:-}" == --* ]]; then printf '%s\n' '--cdp-endpoint requires an explicit local browser WebSocket URL.' >&2; exit 2; fi
        export CUA_CDP_ENDPOINT="$2"
        shift
      fi
      shift
      ;;
    --auto-approve) export CUA_AUTO_APPROVE=1; shift ;;
    --swift-computer)
      if [[ -n "$mode" && "$mode" != computer ]]; then printf '%s\n' 'Swift computer deployment requires computer mode.' >&2; exit 2; fi
      mode=computer; shift
      ;;
    --browser|--computer|--unified|--js)
      requested_mode="${1#--}"
      if [[ -n "$mode" && "$mode" != "$requested_mode" ]]; then printf '%s\n' 'Choose only one surface mode.' >&2; exit 2; fi
      mode="$requested_mode"; shift
      ;;
    --check-browser|--check-computer)
      if [[ -n "$check_option" ]]; then printf '%s\n' 'Choose only one check mode.' >&2; exit 2; fi
      check_option="$1"; shift
      ;;
    --) shift; break ;;
    --*) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
    *) break ;;
  esac
done
if [[ -n "$check_option" ]]; then
  requested_mode="${check_option#--check-}"
  if [[ $# -ne 0 || ( -n "$mode" && "$mode" != "$requested_mode" ) ]]; then
    printf '%s\n' 'Check mode requires the matching surface and no prompt.' >&2; exit 2
  fi
  mode="$requested_mode"
  check_only=true
  set -- "$check_option"
fi
# Host demo default, not a recovered intent classifier: expose both supported
# surfaces so the model can preserve a native-app request on macOS.
if [[ -z "$mode" ]]; then
  if [[ -n "$backend" ]]; then mode=browser;
  elif [[ "$(uname -s)" == Darwin ]]; then mode=unified;
  else mode=browser; fi
fi
if [[ -n "$backend" && "$mode" != browser ]]; then
  printf '%s\n' 'Browser deployment options require browser mode.' >&2; exit 2
fi
if [[ "$backend" == --managed-browser ]]; then managed_browser=true;
elif [[ -n "$backend" ]]; then cdp_browser=true; fi
export CUA_MODEL_PROVIDER="${CUA_MODEL_PROVIDER:-deepseek}"
case "$CUA_MODEL_PROVIDER" in
  deepseek) credential_name=DEEPSEEK_API_KEY ;;
  openai-compatible) credential_name=CUA_MODEL_API_KEY ;;
  *) printf '%s\n' 'Unsupported CUA_MODEL_PROVIDER; use deepseek or openai-compatible.' >&2; exit 2 ;;
esac
if [[ "$mode" == computer || "$mode" == unified ]]; then
  export CUA_RUNTIME_SUPERVISOR=rust CORE_CUA_NATIVE_BACKEND=swift
  # An explicit CLI deployment wins over stale surface/backend fields in .env.
  CUA_MCP_ENV="$(CUA_DEMO_SELECTED_MODE="$mode" node --input-type=module -e '
    const env=JSON.parse(process.env.CUA_MCP_ENV || "{}");
    if(!env || Array.isArray(env) || typeof env!=="object" || !Object.values(env).every(v=>typeof v==="string")) throw Error("CUA_MCP_ENV must be a JSON string map");
    env.CUA_REPL_ENABLED_SURFACES=process.env.CUA_DEMO_SELECTED_MODE==="unified"?"browser,computer":"computer";
    env.CORE_CUA_NATIVE_BACKEND="swift";
    if(process.env.CUA_DEMO_SELECTED_MODE==="unified") {
      env.CUA_REPL_BROWSER_ENV="codex-app";
      env.BROWSER_USE_AVAILABLE_BACKENDS??="chrome";
      if(env.CORE_CUA_HOST_DIRECTORY===undefined && process.env.CORE_CUA_HOST_DIRECTORY!==undefined) env.CORE_CUA_HOST_DIRECTORY=process.env.CORE_CUA_HOST_DIRECTORY;
      if(env.CORE_CUA_ENDPOINT_FILES===undefined && process.env.CORE_CUA_ENDPOINT_FILES!==undefined) env.CORE_CUA_ENDPOINT_FILES=process.env.CORE_CUA_ENDPOINT_FILES;
      if(env.CORE_CUA_ENDPOINT_FILES===undefined && env.CORE_CUA_HOST_DIRECTORY===undefined) env.CORE_CUA_ENDPOINT_FILES="[]";
    }
    process.stdout.write(JSON.stringify(env));
  ')"
  export CUA_MCP_ENV
fi
if [[ "$mode" == "browser" ]]; then
  unset CORE_CUA_NATIVE_BACKEND CORE_CUA_NATIVE_HELPER_PATH CORE_CUA_APP_POLICY CORE_CUA_POLICY_SOURCE
  export CUA_RUNTIME_SUPERVISOR="${CUA_RUNTIME_SUPERVISOR:-rust}"
  CUA_MCP_ENV="$(node --input-type=module -e '
    const env=JSON.parse(process.env.CUA_MCP_ENV || "{}");
    if(!env || Array.isArray(env) || typeof env!=="object" || !Object.values(env).every(v=>typeof v==="string")) throw Error("CUA_MCP_ENV must be a JSON string map");
    delete env.CORE_CUA_NATIVE_BACKEND;
    delete env.CORE_CUA_NATIVE_HELPER_PATH;
    delete env.CORE_CUA_APP_POLICY;
    delete env.CORE_CUA_POLICY_SOURCE;
    env.CUA_REPL_ENABLED_SURFACES="browser";
    env.CUA_REPL_BROWSER_ENV="codex-app";
    env.NODE_REPL_DISABLE_ANALYTICS??="1";
    env.BROWSER_USE_AVAILABLE_BACKENDS??="chrome";
    process.stdout.write(JSON.stringify(env));
  ')"
  export CUA_MCP_ENV
  printf '%s\n' 'Browser mode: checks the selected backend before model requests. Search results depend on live page access.' >&2
elif [[ "$mode" == "computer" || "$mode" == "unified" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"computer"}'; fi
  if [[ "$mode" == computer ]]; then unset CORE_CUA_HOST_DIRECTORY CORE_CUA_ENDPOINT_FILES; fi
  export CORE_CUA_NATIVE_HELPER_PATH="${CORE_CUA_NATIVE_HELPER_PATH:-$PWD/native/macos/.build/debug/cua-helper}"
  if [[ "$CORE_CUA_NATIVE_HELPER_PATH" == "$PWD/native/macos/.build/debug/cua-helper" ]]; then npm run build:native; fi
  printf '%s\n' "$mode mode: $CORE_CUA_NATIVE_BACKEND backend; app inventory does not verify UI permissions or actions." >&2
else
  # Explicit JS-only mode must not inherit stale CUA service/bootstrap settings.
  unset CORE_CUA_NATIVE_BACKEND CORE_CUA_NATIVE_HELPER_PATH CORE_CUA_APP_POLICY CORE_CUA_POLICY_SOURCE CORE_CUA_HOST_DIRECTORY CORE_CUA_ENDPOINT_FILES
  if [[ "$(uname -s)" == Darwin ]]; then export CUA_RUNTIME_SUPERVISOR=rust; fi
  CUA_MCP_ENV="$(node --input-type=module -e '
    const env=JSON.parse(process.env.CUA_MCP_ENV || "{}");
    if(!env || Array.isArray(env) || typeof env!=="object" || !Object.values(env).every(v=>typeof v==="string")) throw Error("CUA_MCP_ENV must be a JSON string map");
    for(const key of Object.keys(env)) if(key.startsWith("CORE_CUA_") || key.startsWith("CUA_REPL_") || key.startsWith("BROWSER_USE_") || key==="NODE_REPL_JS_BANNER" || key==="NODE_REPL_TRUSTED_SERVICES") delete env[key];
    env.NODE_REPL_DISABLE_ANALYTICS??="1";
    process.stdout.write(JSON.stringify(env));
  ')"
  export CUA_MCP_ENV
fi
if [[ $# -eq 0 ]]; then
  read -r -p 'Prompt: ' prompt
  set -- "$prompt"
fi
if [[ "$check_only" == false && -z "${!credential_name:-}" ]]; then
  if [[ ! -t 0 ]]; then printf 'Set %s or run interactively to enter it securely.\n' "$credential_name" >&2; exit 1; fi
  read -r -s -p "$credential_name (hidden): " "$credential_name"
  printf '\n' >&2
fi
export "$credential_name"
# The shell has consumed flags/delimiter; remaining arguments are prompt text.
export CUA_DEMO_CLI_PARSED=1
export CUA_NATIVE_SUPERVISOR_PATH="${CUA_NATIVE_SUPERVISOR_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl}"
export NODE_REPL_NODE_PATH="${NODE_REPL_NODE_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
printf 'Runtime supervisor: %s\n' "${CUA_RUNTIME_SUPERVISOR:-installed}" >&2
npm run build:reconstruction
if [[ "${CUA_RUNTIME_SUPERVISOR:-}" == rust || "${CUA_RUNTIME_SUPERVISOR:-}" == independent ]]; then npm run build:rust-runtime; fi
if [[ "$cdp_browser" == true ]]; then
  npm run build:rust-browser-host
  exec node --import tsx packages/agent-loop/src/cdp-demo.ts "$@"
fi
if [[ "$managed_browser" == true ]]; then
  exec node --import tsx packages/agent-loop/src/managed-demo.ts "$@"
fi
if [[ "$mode" == browser && "$check_only" == false ]]; then
  export CUA_DEMO_START_CHROME=1
else
  unset CUA_DEMO_START_CHROME
fi
exec node --import tsx packages/agent-loop/src/restored-demo.ts "$@"
