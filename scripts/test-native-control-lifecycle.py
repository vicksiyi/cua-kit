#!/usr/bin/env python3
"""Exercise Core host control through real Native Messaging stdio, isolated config."""
import hashlib
import base64
import socket
import sys
from urllib.parse import urlsplit
import json
import os
from pathlib import Path
import select
import struct
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parent.parent
binary = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else repo / 'native/browser-extension-host/target/debug/core-browser-extension-host'
with tempfile.TemporaryDirectory(prefix='cc-', dir='/tmp') as directory:
    root = Path(directory)
    root.chmod(0o700)
    config = root / 'host.json'
    extension_id = 'a' * 32
    config.write_text(json.dumps({'version': 1, 'extensionIds': [extension_id],
                                 'endpointParentDirectory': str(root / 'endpoints')}))
    config.chmod(0o600)
    cli = root / 'owned-cli'
    cli.write_text('#!' + sys.executable + '\n' + r"""
import json, os, sys
with open('spawned.jsonl', 'a') as log:
    log.write(json.dumps({'pid': os.getpid(), 'args': sys.argv[1:], 'cwd': os.getcwd()}) + '\n')
for line in sys.stdin:
    value = json.loads(line)
    print(json.dumps({'id': value.get('id'), 'result': {'pid': os.getpid(), 'echo': value}}), flush=True)
""")
    cli.chmod(0o700)
    entry = {'schemaVersion' : 2, 'entryId': 'stdio-fixture', 'paths': {
        'extensionHostPath': str(binary), 'codexCliPath': str(cli),
        'codexHome': str(root), 'nodePath': str(root), 'resourcesPath': str(root)}}
    registry = root / 'chrome-native-hosts-v2.json'
    registry.write_text(json.dumps({'schemaVersion': 2, 'entries': [entry]}))
    child = subprocess.Popen([str(binary), '--config', str(config),
                              f'chrome-extension://{extension_id}/'],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             cwd=root, env={'PATH': '/usr/bin:/bin', 'HOME': str(root), 'CODEX_HOME': str(root)})
    pending = bytearray()

    def request(method, request_id, params=None):
        data = json.dumps({'jsonrpc': '2.0', 'id': request_id, 'method': method, 'params': params}).encode()
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
    def connect(url, valid=True):
        parsed = urlsplit(url)
        stream = socket.create_connection((parsed.hostname, parsed.port), timeout=5)
        key = 'dGhlIHNhbXBsZSBub25jZQ=='
        query = parsed.query if valid else 'token=wrong'
        stream.sendall((f'GET /?{query} HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n'
                        f'Sec-WebSocket-Key: {key}\r\n\r\n').encode())
        header = bytearray()
        while not header.endswith(b'\r\n\r\n'):
            part = stream.recv(1)
            assert part, 'closed during HTTP upgrade'
            header.extend(part)
        if not valid:
            assert header.startswith(b'HTTP/1.1 403 ')
            stream.close()
            return None
        assert header.startswith(b'HTTP/1.1 101 ')
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        assert accept in header
        return stream

    def send_frame(stream, payload, opcode=1):
        mask = b'core'
        n = len(payload)
        prefix = bytes([0x80 | opcode, 0x80 | n]) if n < 126 else bytes([0x80 | opcode, 0xfe]) + struct.pack('>H', n)
        stream.sendall(prefix + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def receive_frame(stream):
        def exact(n):
            data = bytearray()
            while len(data) < n:
                part = stream.recv(n - len(data))
                assert part, 'closed before complete frame'
                data.extend(part)
            return bytes(data)
        first, second = exact(2)
        assert not second & 0x80
        n = second & 0x7f
        if n == 126:
            n = struct.unpack('>H', exact(2))[0]
        elif n == 127:
            n = struct.unpack('>Q', exact(8))[0]
        assert n < 1024 * 1024
        return first & 0xf, exact(n)

    def echo(stream, value):
        send_frame(stream, json.dumps(value).encode())
        opcode, payload = receive_frame(stream)
        assert opcode == 1
        result = json.loads(payload)
        assert result['result']['echo'] == value
        return result['result']['pid']

    def gone(pid):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.02)
        raise AssertionError('owned CLI not reaped')

    streams = []
    try:
        assert request('codexRuntime/hello', 'hello')['result'] == {
            'manifestSchemaVersion': 2, 'nativeHostProtocolVersion': 2,
            'nativeHostVersion': '0.1.0',
            'supportedMethods': ['codexRuntime/openLocalFile'],
            'supportedProtocolVersions': [2]}
        assert request('codexRuntime/status', 1)['result'] == {'phase': 'idle'}
        first = request('codexRuntime/ensure', {'key': 2})['result']
        assert first['entryId'] == 'stdio-fixture'
        status = request('codexRuntime/status', 3)['result']
        assert status == {'phase': 'connected', 'runtimeSessionId': first['runtimeSessionId']}
        assert not (root / 'spawned.jsonl').exists(), 'ensure must remain lazy'
        connect(first['localAppServerUrl'], valid=False)
        assert not (root / 'spawned.jsonl').exists(), 'auth rejection must not spawn'
        ws = connect(first['localAppServerUrl']); streams.append(ws)
        pid = echo(ws, {'id': 1, 'method': 'fixture/echo', 'params': '界' * 180})
        send_frame(ws, b'ping', 9)
        assert receive_frame(ws) == (10, b'ping')
        send_frame(ws, b'', 8)
        assert receive_frame(ws) == (8, b'')
        ws.close()
        ws = connect(first['localAppServerUrl']); streams.append(ws)
        assert echo(ws, {'id': 2, 'method': 'fixture/reconnect'}) == pid
        restarted = request('codexRuntime/restart', 4)['result']
        assert receive_frame(ws)[0] == 8
        gone(pid)
        ws.close()
        ws = connect(restarted['localAppServerUrl']); streams.append(ws)
        next_pid = echo(ws, {'id': 3, 'method': 'fixture/after-restart'})
        assert next_pid != pid
        spawned = [json.loads(line) for line in (root / 'spawned.jsonl').read_text().splitlines()]
        assert len(spawned) == 2
        assert all(item['args'] == ['app-server', '--analytics-default-enabled'] and Path(item['cwd']).resolve() == root.resolve() for item in spawned)
        assert restarted['localAppServerUrl'] == first['localAppServerUrl']
        assert restarted['runtimeSessionId'] != first['runtimeSessionId']
        registry.unlink()
        assert request('codexRuntime/restart', 5)['error']['data']['type'] == 'manifest_missing'
        assert request('codexRuntime/status', 6)['result']['runtimeSessionId'] == restarted['runtimeSessionId']
        child.stdin.close()
        assert child.wait(timeout=10) == 0
        gone(next_pid)
        print('Native Messaging: 7 controls; authenticated WebSocket echo/ping/reconnect/restart and EOF child cleanup passed')
    finally:
        for stream in streams:
            stream.close()
        if child.poll() is None:
            child.kill()
            child.wait(timeout=10)
