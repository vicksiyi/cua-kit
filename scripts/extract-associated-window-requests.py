#!/usr/bin/env python3
"""Extract optional window-query symbol requests from the pinned binary; no execution."""
import contextlib, io, json, pathlib, runpy, struct
root = pathlib.Path(__file__).resolve().parents[1]
with contextlib.redirect_stdout(io.StringIO()):
    audit = runpy.run_path(str(root / 'scripts/audit-native-mouse-dispatch.py'))
r = audit['read']
def array(address):
    n = struct.unpack('<Q', r(address + 16, 8))[0]
    assert n <= 16
    return list(struct.unpack('<' + 'Q' * n, r(address + 32, n * 8)))
source = '// Extracted optional window-query requests; original initializers26dbb0..26def8.\nextension WindowServerSPISymbolRequest {\n'
records = []
for name, images, symbols, salt in [
    ('associatedMainConnection', 0x10155a5a8, 0x10155a5f8, 0x10124b5b0),
    ('cornerQuery', 0x10155a630, 0x10155a680, 0x10124b4b0),
    ('cornerIterator', 0x10155a6b8, 0x10155a708, 0x10124b430),
    ('cornerCount', 0x10155a740, 0x10155a790, 0x10124b3b0),
    ('cornerWindowID', 0x10155a7c8, 0x10155a818, 0x10124b330),
    ('cornerRadii', 0x10155a850, 0x10155a8a0, 0x10124b2a0),
    ('associatedWindowQuery', 0x10155a8d8, 0x10155a928, 0x10124b530),
]:
    iv, sv = array(images), array(symbols)
    st = r(salt, 150).split(b'\0')[0].decode()
    assert len(iv) == 5 and len(sv) == 2
    source += f'    static let {name} = Self(images: [{", ".join(hex(x) for x in iv)}],\n        symbols: [[{", ".join(hex(x) for x in sv)}]],\n        salt: "{st}")\n'
    records.append(dict(name=name, imagesVA=hex(images), symbolsVA=hex(symbols), saltVA=hex(salt), images=iv, symbols=sv, salt=st))
source += '}\n'
(root / 'native/macos/Sources/SystemSoftware/AssociatedWindowSymbolRequests.swift').write_text(source)
(root / 'reconstruction/associated-window-symbol-requests.json').write_text(json.dumps(records, indent=2) + '\n')
print('Extracted seven optional window-query requests from pinned binary')
