#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: npm run demo:deepseek -- [--managed-browser|--cdp-browser|--cdp-endpoint ws://127.0.0.1:PORT/devtools/browser/ID] [--browser|--computer|--js|--check-browser|--check-computer] "your prompt"' 'Default: CUA browser tools (connected backend required). --js selects JavaScript-only tools. Project .env is loaded automatically.'
  exit 0
fi
managed_browser=false
cdp_browser=false
unset CUA_CDP_ENDPOINT
if [[ "${1:-}" == "--cdp-endpoint" ]]; then
  if [[ -z "${2:-}" || "${2:-}" == --* ]]; then printf '%s\n' '--cdp-endpoint requires an explicit local browser WebSocket URL.' >&2; exit 2; fi
  export CUA_CDP_ENDPOINT="$2"
  cdp_browser=true
  shift 2
fi
if [[ "${1:-}" == "--cdp-browser" ]]; then
  if [[ "$cdp_browser" == true ]]; then printf '%s\n' 'Choose only one CDP deployment option.' >&2; exit 2; fi
  cdp_browser=true; shift
fi
if [[ "${1:-}" == "--managed-browser" ]]; then managed_browser=true; shift; fi
if [[ "$managed_browser" == true && "$cdp_browser" == true ]]; then
  printf '%s\n' 'Choose only one managed browser backend.' >&2; exit 2
fi
mode=browser
if [[ "${1:-}" == "--js" ]]; then mode=js; shift;
elif [[ "${1:-}" == "--computer" ]]; then mode=computer; shift;
elif [[ "${1:-}" == "--check-computer" ]]; then mode=computer;
elif [[ "${1:-}" == "--browser" ]]; then shift; fi
if [[ ( "$managed_browser" == true || "$cdp_browser" == true ) && "$mode" != browser ]]; then
  printf '%s\n' 'Managed browser options require browser mode.' >&2; exit 2
fi
check_only=false
if [[ "${1:-}" == "--check-browser" ]]; then
  if [[ "$mode" != browser || $# -ne 1 ]]; then
    printf '%s\n' '--check-browser must be used alone in browser mode.' >&2; exit 2
  fi
  check_only=true
fi
if [[ "${1:-}" == "--check-computer" ]]; then
  if [[ "$mode" != computer || $# -ne 1 ]]; then printf '%s\n' '--check-computer must be used alone in computer mode.' >&2; exit 2; fi
  check_only=true
fi
if [[ "$mode" == "browser" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"browser","CUA_REPL_BROWSER_ENV":"codex-app","BROWSER_USE_AVAILABLE_BACKENDS":"chrome"}'; fi
  printf '%s\n' 'Browser mode: checks the selected backend before model requests. Search results depend on live page access.' >&2
elif [[ "$mode" == "computer" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"computer"}'; fi
  unset CORE_CUA_HOST_DIRECTORY CORE_CUA_ENDPOINT_FILES
  export CORE_CUA_NATIVE_BACKEND="${CORE_CUA_NATIVE_BACKEND:-independent}"
  if [[ "$CORE_CUA_NATIVE_BACKEND" == independent ]]; then
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
