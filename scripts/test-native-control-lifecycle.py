#!/usr/bin/env python3
"""Exercise Core host control through real Native Messaging stdio, isolated config."""
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parent.parent
binary = repo / 'native/browser-extension-host/target/debug/core-browser-extension-host'
with tempfile.TemporaryDirectory(prefix='cc-', dir='/tmp') as directory:
    root = Path(directory)
    root.chmod(0o700)
    config = root / 'host.json'
    extension_id = 'a' * 32
    config.write_text(json.dumps({'version': 1, 'extensionIds': [extension_id],
                                 'endpointParentDirectory': str(root / 'endpoints')}))
    config.chmod(0o600)
    entry = {'schemaVersion': 2, 'entryId': 'stdio-fixture', 'paths': {
        'extensionHostPath': str(binary), 'codexCliPath': str(root),
        'codexHome': str(root), 'nodePath': str(root), 'resourcesPath': str(root)}}
    registry = root / 'chrome-native-hosts-v2.json'
    registry.write_text(json.dumps({'schemaVersion': 2, 'entries': [entry]}))
    child = subprocess.Popen([str(binary), '--config', str(config),
                              f'chrome-extension://{extension_id}/'],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             cwd=root, env={'PATH': '/usr/bin:/bin', 'HOME': str(root), 'CODEX_HOME': str(root)})
    pending = bytearray()

    def request(method, request_id):
        data = json.dumps({'jsonrpc': '2.0', 'id': request_id, 'method': method}).encode()
        child.stdin.write(struct.pack('<I', len(data)) + data)
        child.stdin.flush()
        deadline = time.monotonic() + 10
        while True:
            if len(pending) >= 4:
                size = struct.unpack('<I', pending[:4])[0]
                assert size < 1024 * 1024, 'unexpected response size'
                if len(pending) >= size + 4:
                    response = json.loads(pending[4:4+size])
                    del pending[:4+size]
                    assert response['id'] == request_id
                    return response
            remaining = deadline - time.monotonic()
            assert remaining > 0 and select.select([child.stdout], [], [], remaining)[0], 'response timeout'
            data = os.read(child.stdout.fileno(), 8192)
            assert data, 'host closed before response'
            pending.extend(data)
    try:
        assert request('codexRuntime/status', 1)['result'] == {'phase': 'idle'}
        first = request('codexRuntime/ensure', {'key': 2})['result']
        assert first['entryId'] == 'stdio-fixture'
        status = request('codexRuntime/status', 3)['result']
        assert status == {'phase': 'connected', 'runtimeSessionId': first['runtimeSessionId']}
        restarted = request('codexRuntime/restart', 4)['result']
        assert restarted['localAppServerUrl'] == first['localAppServerUrl']
        assert restarted['runtimeSessionId'] != first['runtimeSessionId']
        registry.unlink()
        assert request('codexRuntime/restart', 5)['error']['data']['type'] == 'manifest_missing'
        assert request('codexRuntime/status', 6)['result']['runtimeSessionId'] == restarted['runtimeSessionId']
        child.stdin.close()
        assert child.wait(timeout=10) == 0
        print('Native Messaging control lifecycle: 6 framed requests passed')
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=10)
