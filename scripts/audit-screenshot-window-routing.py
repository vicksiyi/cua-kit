#!/usr/bin/env python3
"""Static pinned screenshot selection/dictionary audit; no vendor execution."""
import contextlib, hashlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
def call(site, target):
    assert struct.unpack('<I', r(site, 4))[0] == 0x94000000 | (((target - site) // 4) & 0x3ffffff), hex(site)
def selector(slot):
    word = struct.unpack('<Q', r(slot, 8))[0]
    address = 0x100000000 + (word & 0xffffffff)
    return r(address, 100).split(b'\0')[0].decode()
assert selector(0x101542eb8) == 'windows'
assert selector(0x101542e98) == 'windowID'
# Singleton selection reads windowIDs in order and exits on first equality.
call(0x100fb8378, 0x101154ba8)
call(0x100fb8408, 0x101154ba8)
# Independent second windows read precedes tuple construction/dictionary merge.
call(0x100fb84cc, 0x101154ba8)
call(0x100fb8678, 0x100fb5d78)
# Merge's existing-key branch allocates/throws an error; caller terminates on error.
call(0x100fb5e58, 0x101154f8c)
call(0x100fb5e64, 0x101155700)
assert struct.unpack('<I', r(0x100fb86c4, 4))[0] == 0x14000000 | (((0x101155580 - 0x100fb86c4) // 4) & 0x3ffffff)
report = {
    'binarySha256': hashlib.sha256(audit['args'].binary.read_bytes()).hexdigest(),
    'selectionRange': '0x100fb8340..0x100fb84bc',
    'dictionaryRange': '0x100fb84c4..0x100fb86d4',
    'mergeRange': '0x100fb5d78..0x100fb60f8',
    'selectors': {'0x101542eb8': 'windows', '0x101542e98': 'windowID'},
    'finding': 'Keep dictionary construction in current ScreenshotBuffer; original also maps windowID/window pairs, merges uniquely and terminates on duplicate-key error',
    'selectionFixture': 'reconstruction/screenshot-window-selection-check.swift',
    'productionChange': 'none; suspected extra dictionary behavior is supported by original instructions',
    'limits': ['Static branch/callsite evidence and injected generic test only', 'Actual SDK windows/duplicate objects not exercised', 'No full buffer or original Swift internal error representation parity claim']
}
(root / 'reconstruction/screenshot-window-routing-evidence.json').write_text(json.dumps(report, indent=2) + '\n')
print('Pinned screenshot selection/dictionary callsites and selectors verified')
