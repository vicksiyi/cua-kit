# Codex host loop: pinned source audit

Source: openai/codex commit `33ffb6f905b9ddd9254ebe9b48ac16ce95e91050`,
[`codex-rs/core/src/session/turn.rs`](https://github.com/openai/codex/blob/33ffb6f905b9ddd9254ebe9b48ac16ce95e91050/codex-rs/core/src/session/turn.rs).
Git blob: `9d1d5caa601691cd9938f0a42e3d8f9bcf52962a`.
Retrieved through GitHub's blob API on 2026-11-07 and checked against the Git SHA-1
object hash, including the blob header. This is public Codex host source at one
revision, not proof of the exact scheduler shipped inside the installed ChatGPT
application or a description of every Codex release.

## What the source establishes

| Location | Observed behavior | Implication |
| --- | --- | --- |
| run_turn, lines 178–939; loop starts 491 | Uncounted loop, not a for-loop with 12 iterations | This ordinary-turn implementation does not impose our former fixed 12-decision cap |
| 611–637 | Follow-up combines model follow-up and pending input | Tools and new user input can keep the turn running |
| 751–801 | With no follow-up, run stop hooks; a blocking hook with continuation content can continue; a stop can break | A final-looking model response alone is not the entire host stopping contract |
| 854–858 | Normal completion breaks the loop | The uncounted loop still has an ordinary completion path |
| 687–749 | Context pressure can trigger compaction and another iteration | Context compaction is not a fixed action-count limit |
| 865–889 | One special guardian budget recovery compaction is guarded per model step | This is a narrow ineffective-recovery guard, not generic repeated-action detection |
| 1822, 1919–1947 | Sampling stream retries use provider max_retries and propagate exhausted retries | Transport retries and total tool rounds are different budgets |
| 3380–3399 | Record usage; an error from accounting terminates sampling; end_turn=false requests follow-up | No round cap does not mean no usage/accounting boundary |
| 891–936 | Abort propagates; terminal errors report and end the turn | Error/cancellation are stopping conditions |

The reviewed run_turn body does not contain a generic repeated-tool/unchanged-page
stall counter. This does NOT establish its absence throughout the entire product.
Likewise, this audit has not followed every token-accounting, extension, stop-hook
or Goal dispatcher implementation. Do not label an invented "three identical
calls => stop" policy as an exact Codex reconstruction.

## Relationship to our implementation

Our default round-cap removal agrees with the uncounted ordinary-turn structure.
It was also explicitly requested by the user. The SDK's optional maxSteps is an
integration feature; it is not a claimed original CUA API.

Our loop remains simpler: it lacks the full pending-input queue, stop-hook
contract, context compaction, stream-retry accounting, and persisted Goal
continuation described by the host source. Native/browser CUA operations are a
separate layer. Restoring those operations does not reproduce this scheduler.
The cancellation response-boundary checks prevent accepting a late success;
they do not guarantee interruption of a custom adapter that ignores AbortSignal.

Next host-alignment work must inspect the relevant budget/cancellation modules
before implementing their semantics. A configurable wall-clock or cost budget
may be offered as an explicitly named caller policy, but must not be presented as
an observed Codex default without supporting source evidence.
