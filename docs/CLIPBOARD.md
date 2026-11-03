# Real browser paste and host clipboard adapters

`paste(target, text, { format: 'text' | 'md' | 'html' })` is a clipboard operation, not an alias for `typeText`. It dispatches the platform paste shortcut and waits for a trusted browser paste event containing the expected plain text and, for rich input, an HTML format. The editor may cancel the event or transform the data; callers must observe the resulting document to confirm acceptance.

```mermaid
sequenceDiagram
  participant A as Any agent / MCP client
  participant R as Persistent JS / CuaTab
  participant Q as Process-wide clipboard queue
  participant H as Host ClipboardBackend
  participant B as Browser CDP + editor
  A->>R: paste(id, text, format)
  R->>R: Authorize, validate observed target, focus
  R->>R: Markdown → sanitized HTML + plain text
  R->>Q: Wait for lease slot
  Q->>R: Revalidate session, frame stamps, focus, cancellation
  Q->>H: acquire({text, html?})
  H->>H: Preserve existing formats; write payload
  Q->>R: Revalidate before dispatch
  R->>B: Meta+V / Control+V
  B-->>R: Trusted paste event + payload check
  R->>H: restore lease
  H->>H: Restore only if clipboard change count unchanged
  R-->>A: eventObserved + clipboardRestored
  A->>R: Observe editor result
```

## Integration boundary

The SDK exports `ClipboardBackend` and `ClipboardContent`. A host may inject `createCua({clipboard, authorize, ...})`; agents do not receive a general clipboard-read API. `acquire(content)` returns a one-use lease with `restore(): Promise<boolean>`. Implementations own capture, preservation, writing and conditional restoration. The module serializes operations across Cua sessions in one Node process; it is not a lock against other processes.

The built-in macOS backend is Swift/AppKit `NSPasteboard`, accessed over the same private helper protocol. Previous clipboard data stays in helper memory and is never returned to the model. It preserves all readable item formats up to 16 MiB, rejecting unreadable/oversized prior contents before mutation. New text/HTML is limited to 1 MiB each; browser source text is limited to 200,000 characters. HTML is sanitized; Markdown is rendered then sanitized. Original Markdown is the plain-text fallback. This is not exact formatting fidelity with another vendor's implementation.

## Supported configurations

- Managed Chromium: `headless:false` plus `nativeHelperPath` on macOS, or explicit host `clipboard` backend.
- Granted extension tabs: optional native helper supplies the macOS clipboard through the shared CuaTab kernel. Real paste on extension tabs is not yet a dedicated integration test.
- MCP/demo: set `CUA_HEADLESS=false` and `CUA_NATIVE_HELPER_PATH` for managed-browser paste. Model credentials remain only in the caller adapter.
- Default headless Chromium: **no native system-clipboard capability advertised**. Testing found a trusted paste event with empty data because this browser did not share NSPasteboard. A host-supplied backend must address that browser's actual clipboard; the built-in backend is not sufficient.
- Native App: `app.paste(text,{format?,timeoutMs?})` is implemented for focused editors exposing AXValue and AXSelectedTextRange. Actual native behavior awaits Accessibility-gated fixture validation; see the native flow below.

## Restoration and failure semantics

After success or failure the lease attempts restoration. If another application copied new contents, restoration returns false and preserves that new content. Clipboard change checks and writes are not an atomic OS transaction: a narrow interprocess race remains. A trusted paste event confirms delivery, not acceptance or persistence. Missing/mismatched event data produces ACTION_OUTCOME_UNKNOWN and must not be automatically replayed.

Normal helper EOF attempts cleanup. Forced termination, crash, IPC failure, or timeout kill can prevent restoration; no crash-safe promise is made. Reading lazy clipboard formats can itself involve other apps. Output never includes original clipboard bytes. Cancellation is checked before acquiring and before dispatch; once dispatch starts, restoration/keyup proceed, and cancellation cannot mean no effect occurred.

## Evidence

`tests/clipboard.test.ts` verifies:

1. A unique named pasteboard restores text plus custom binary bytes, and preserves a simulated newer external copy. It does not inspect the general clipboard.
2. A disposable headed Chromium page receives trusted text/HTML/Markdown paste, including Chinese and emoji, removes script content, and reflects bold formatting. This test temporarily leases the system clipboard and restores it; no user browser profile is used.
3. Default headless SDK rejects native paste before changing the clipboard.

Swift build and the full suite pass: 18 passed, 1 native AX fixture skipped. AX/Screen Recording permissions are not required for these pasteboard/browser checks; native App inputs remain unverified without them.

## Native App verification flow

```mermaid
sequenceDiagram
  participant A as Agent / MacApp
  participant Q as Shared clipboard queue
  participant H as Swift helper
  participant E as Native editor
  A->>A: Authorize paste; require current snapshot
  A->>Q: Acquire serial slot
  Q->>H: validatePaste(snapshot, text)
  H->>H: AX identity, value, selection and UTF-16 boundaries
  Q->>H: clipboardBegin(text, sanitized HTML?)
  Q->>H: pasteInput(snapshot, text, richText, timeout)
  H->>H: Revalidate snapshot and focus
  H->>E: Command+V directed to bound PID
  loop up to 50..5000ms (default 2000ms)
    H->>E: Read focused editor AXValue
  end
  H-->>Q: observed/AXValue or ACTION_OUTCOME_UNKNOWN
  Q->>H: clipboardRestore(token)
  Q-->>A: Result + clipboardRestored
```

Text conversion is now shared by browser and native backends in `src/core/paste.ts`. Native verification computes the expected UTF-16 selection replacement. For rich input it accepts either the plain fallback or text extracted from sanitized HTML; it does **not** verify rich formatting, application persistence, or embedded resources. Apps that transform whitespace/text may produce ACTION_OUTCOME_UNKNOWN even after a successful paste. Replacing text with identical content also cannot establish an observable change and returns uncertain. Secure fields and editors without readable text/selection are explicitly unsupported by this verifier; broad custom-editor paste remains outstanding.

The helper retains its clipboard until verification finishes, then the host restores the lease. Errors and cancellation do not imply the shortcut had no effect. Helper write timeouts—including keyboard and clipboard mutations—now report ACTION_OUTCOME_UNKNOWN and retire the helper. Graceful close allows up to 15 seconds for pending native work and EOF restoration before forced termination; forced termination can still lose restoration. This is a bounded cleanup attempt, not a crash-safe guarantee.

`tests/native.test.ts` adds Unicode selection math checks without UI effects and extends the opt-in owned native fixture with Chinese/emoji paste and AX result verification. The live fixture is still unverified because Accessibility is absent. `tests/native-transport.test.ts` runs a real stalled helper protocol process to verify timeout classification/retirement for every writing RPC. Existing real browser paste tests continue to pass after shared-format extraction.
