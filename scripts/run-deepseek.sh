#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: npm run demo:deepseek -- [--managed-browser|--cdp-browser|--cdp-endpoint ws://127.0.0.1:PORT/devtools/browser/ID] [--browser|--computer|--swift-computer|--js|--check-browser|--check-computer] "your prompt"' 'Default: CUA browser tools (connected backend required). --js selects JavaScript-only tools. Project .env is loaded automatically. --swift-computer selects the opt-in Rust + original Sky + Swift route.'
  exit 0
fi
swift_computer=false
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
    --swift-computer)
      if [[ -n "$mode" && "$mode" != computer ]]; then printf '%s\n' 'Swift computer deployment requires computer mode.' >&2; exit 2; fi
      mode=computer; swift_computer=true; shift
      ;;
    --browser|--computer|--js)
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
mode="${mode:-browser}"
if [[ -n "$backend" && "$mode" != browser ]]; then
  printf '%s\n' 'Browser deployment options require browser mode.' >&2; exit 2
fi
if [[ "$backend" == --managed-browser ]]; then managed_browser=true;
elif [[ -n "$backend" ]]; then cdp_browser=true; fi
if [[ "$swift_computer" == true ]]; then
  export CUA_RUNTIME_SUPERVISOR=rust CORE_CUA_NATIVE_BACKEND=swift
  # An explicit CLI deployment wins over stale surface/backend fields in .env.
  CUA_MCP_ENV="$(node --input-type=module -e '
    const env=JSON.parse(process.env.CUA_MCP_ENV || "{}");
    if(!env || Array.isArray(env) || typeof env!=="object" || !Object.values(env).every(v=>typeof v==="string")) throw Error("CUA_MCP_ENV must be a JSON string map");
    env.CUA_REPL_ENABLED_SURFACES="computer";env.CORE_CUA_NATIVE_BACKEND="swift";
    process.stdout.write(JSON.stringify(env));
  ')"
  export CUA_MCP_ENV
fi
if [[ "$mode" == "browser" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"browser","CUA_REPL_BROWSER_ENV":"codex-app","BROWSER_USE_AVAILABLE_BACKENDS":"chrome"}'; fi
  printf '%s\n' 'Browser mode: checks the selected backend before model requests. Search results depend on live page access.' >&2
elif [[ "$mode" == "computer" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"computer"}'; fi
  unset CORE_CUA_HOST_DIRECTORY CORE_CUA_ENDPOINT_FILES
  export CORE_CUA_NATIVE_BACKEND="${CORE_CUA_NATIVE_BACKEND:-independent}"
  if [[ "$CORE_CUA_NATIVE_BACKEND" == independent || "$CORE_CUA_NATIVE_BACKEND" == swift ]]; then
    export CORE_CUA_NATIVE_HELPER_PATH="${CORE_CUA_NATIVE_HELPER_PATH:-$PWD/native/macos/.build/debug/cua-helper}"
    if [[ "$CORE_CUA_NATIVE_HELPER_PATH" == "$PWD/native/macos/.build/debug/cua-helper" ]]; then npm run build:native; fi
  fi
  printf '%s\n' "Computer mode: $CORE_CUA_NATIVE_BACKEND backend; app inventory does not verify UI permissions or actions." >&2
else
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1"}'; fi
fi
if [[ $# -eq 0 ]]; then
  read -r -p 'Prompt: ' prompt
  set -- "$prompt"
fi
if [[ "$check_only" == false && -z "${DEEPSEEK_API_KEY:-}" ]]; then
  if [[ ! -t 0 ]]; then printf '%s\n' 'Set DEEPSEEK_API_KEY or run interactively to enter it securely.' >&2; exit 1; fi
  read -r -s -p 'DeepSeek API key (hidden): ' DEEPSEEK_API_KEY
  printf '\n' >&2
fi
export DEEPSEEK_API_KEY
export CUA_MODEL_PROVIDER=deepseek
export CUA_NATIVE_SUPERVISOR_PATH="${CUA_NATIVE_SUPERVISOR_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl}"
export NODE_REPL_NODE_PATH="${NODE_REPL_NODE_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
npm run build:reconstruction
if [[ "${CORE_CUA_NATIVE_BACKEND:-}" == swift && "$mode" == computer ]]; then npm run build:rust-runtime; fi
if [[ "$cdp_browser" == true ]]; then
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
