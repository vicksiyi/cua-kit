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
- Native App paste: not yet implemented, even though the helper supports clipboard leases.

## Restoration and failure semantics

After success or failure the lease attempts restoration. If another application copied new contents, restoration returns false and preserves that new content. Clipboard change checks and writes are not an atomic OS transaction: a narrow interprocess race remains. A trusted paste event confirms delivery, not acceptance or persistence. Missing/mismatched event data produces ACTION_OUTCOME_UNKNOWN and must not be automatically replayed.

Normal helper EOF attempts cleanup. Forced termination, crash, IPC failure, or timeout kill can prevent restoration; no crash-safe promise is made. Reading lazy clipboard formats can itself involve other apps. Output never includes original clipboard bytes. Cancellation is checked before acquiring and before dispatch; once dispatch starts, restoration/keyup proceed, and cancellation cannot mean no effect occurred.

## Evidence

`tests/clipboard.test.ts` verifies:

1. A unique named pasteboard restores text plus custom binary bytes, and preserves a simulated newer external copy. It does not inspect the general clipboard.
2. A disposable headed Chromium page receives trusted text/HTML/Markdown paste, including Chinese and emoji, removes script content, and reflects bold formatting. This test temporarily leases the system clipboard and restores it; no user browser profile is used.
3. Default headless SDK rejects native paste before changing the clipboard.

Swift build and the full suite pass: 16 passed, 1 native AX fixture skipped. AX/Screen Recording permissions are not required for these pasteboard/browser checks; native App inputs remain unverified without them.
