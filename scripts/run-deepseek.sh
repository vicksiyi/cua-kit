#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' 'Usage: npm run demo:deepseek -- [--browser|--js|--check-browser] "your prompt"' 'Default: CUA browser tools (connected backend required). --js selects JavaScript-only tools. Project .env is loaded automatically.'
  exit 0
fi
mode=browser
if [[ "${1:-}" == "--js" ]]; then mode=js; shift;
elif [[ "${1:-}" == "--browser" ]]; then shift; fi
check_browser=false
if [[ "${1:-}" == "--check-browser" ]]; then
  if [[ "$mode" != browser || $# -ne 1 ]]; then
    printf '%s\n' '--check-browser must be used alone in browser mode.' >&2; exit 2
  fi
  check_browser=true
fi
if [[ "$mode" == "browser" ]]; then
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1","CUA_REPL_ENABLED_SURFACES":"browser","CUA_REPL_BROWSER_ENV":"codex-app","BROWSER_USE_AVAILABLE_BACKENDS":"chrome"}'; fi
  printf '%s\n' 'Browser mode: uses a connected host backend; current installation has not yet passed browser-operation acceptance.' >&2
else
  if [[ -z "${CUA_MCP_ENV:-}" ]]; then export CUA_MCP_ENV='{"NODE_REPL_DISABLE_ANALYTICS":"1"}'; fi
fi
if [[ $# -eq 0 ]]; then
  read -r -p 'Prompt: ' prompt
  set -- "$prompt"
fi
if [[ "$check_browser" == false && -z "${DEEPSEEK_API_KEY:-}" ]]; then
  if [[ ! -t 0 ]]; then printf '%s\n' 'Set DEEPSEEK_API_KEY or run interactively to enter it securely.' >&2; exit 1; fi
  read -r -s -p 'DeepSeek API key (hidden): ' DEEPSEEK_API_KEY
  printf '\n' >&2
fi
export DEEPSEEK_API_KEY
export CUA_MODEL_PROVIDER=deepseek
export CUA_NATIVE_SUPERVISOR_PATH="${CUA_NATIVE_SUPERVISOR_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl}"
export NODE_REPL_NODE_PATH="${NODE_REPL_NODE_PATH:-/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node}"
npm run build:reconstruction
exec npm run demo:restored -w @core/agent-loop -- "$@"
