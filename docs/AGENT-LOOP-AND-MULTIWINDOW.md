# Agent loop limits and multi-window evidence

## Decision rounds

The DeepSeek demo and generic AgentLoop no longer impose a default 12-round
limit. A final model answer ends the turn; cancellation, authorization stops and
errors remain effective. Explicit SDK `maxSteps` remains an optional caller
budget. The demo does not set one. This is a user-requested integration policy,
not a claim of an exact reconstruction of the Codex host scheduler.

`agent-loop-budget.test.ts` verifies a default run with 15 tool rounds and a
16th final decision, cancellation after round 12, and explicit budget behavior.
Policy-stop and turn-lifecycle tests verify denial and cleanup independently.

Official Goals documentation describes a separate, event-driven continuation
mechanism, including user controls, budgets and stopping conditions:
https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
This is not proof of the ordinary turn loop's exact implementation. The local
sparse openai/codex checkout at 33ffb6f905b9ddd9254ebe9b48ac16ce95e91050 has
`codex-rs/core/src/session/turn.rs` in its tree, but fetching its missing blob
failed on 2026-11-07. No source-level claim about that function is established.

## Multiple tabs and windows

Installed original `create_browser_api.js` binds each requested tab independently.
Original `capabilities/browser/management.md` documents windows.getAll,
windows.create, windows.create({tabId}), windows.update, and cross-window tab
queries/moves. The restored implementation is in
`packages/browser-extension/src/browser_management.ts` and
`packages/cua/src/tinysky_alt/create_browser_api.ts`.

Verified locally:
- Original/restored management command validation, dispatch and audit traces.
- Original/restored observed-tab tracking across multiple windows.
- Two retained tab bindings with alternating edits and independent observations,
  compared with the installed original facade on the same fixture.

These are fixture/parity tests, not acceptance of a live collaborative editor.
Remaining acceptance: two real browser windows, tab-specific edits in both
directions, synchronization and persistence checks in the target application,
and focus/cursor checks. Two windows of one profile share account state; testing
two different users requires separate authenticated sessions. The sequential
AgentLoop does not itself provide concurrent multi-user editing or application
conflict resolution.
