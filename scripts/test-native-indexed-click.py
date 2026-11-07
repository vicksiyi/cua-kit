#!/usr/bin/env python3
"""Opt-in live input check restricted to processes this script starts itself.

Exercises the real Swift mouseInput backend through its private NDJSON adapter;
it does not prove MCP/AgentLoop parity or arbitrary-app acceptance. Results are
local-only under artifacts/debug. Build cua-helper and CuaFixture first.
"""
from pathlib import Path
import argparse
import datetime
import json
import os
import selectors
import shutil
import tempfile
import plistlib
import subprocess
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--allow-owned-ui', action='store_true', help='launch owned fixture windows and click their Save button')
args = parser.parse_args()
if not args.allow_owned_ui:
    parser.error('Live input requires --allow-owned-ui; only owned fixture processes can be targeted')
root = Path(__file__).resolve().parent.parent
binary = root / 'native/macos/.build/debug'
for name in ['cua-helper', 'CuaFixture']:
    if not (binary / name).is_file():
        parser.error('Missing build product: ' + name)
log_dir = root / 'artifacts/debug'
log_dir.mkdir(parents=True, exist_ok=True)
stem = 'native-indexed-click-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
report_path = log_dir / (stem + '.json')
# Refuse to place runtime diagnostics in a tracked/publishable path.
ignored = subprocess.run(['git', 'check-ignore', '-q', str(report_path)], cwd=root)
if ignored.returncode:
    parser.error('Runtime report path must be gitignored')

class Lines:
    def __init__(self, process):
        self.process = process
        self.pending = b''
        self.events = []
        self.selector = selectors.DefaultSelector()
        self.selector.register(process.stdout, selectors.EVENT_READ)
    def read(self, timeout=10):
        end = time.monotonic() + timeout
        while b'\n' not in self.pending:
            remaining = end - time.monotonic()
            if remaining <= 0 or not self.selector.select(remaining):
                raise TimeoutError('Owned process output timed out')
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError('Owned process closed output; exit=' + str(self.process.poll()))
            self.pending += chunk
        line, self.pending = self.pending.split(b'\n', 1)
        return line.decode()
    def event(self, predicate):
        end = time.monotonic() + 10
        while True:
            line = self.read(max(0, end - time.monotonic()))
            if line == 'READY':
                value = {'event': 'ready'}
            else:
                value = json.loads(line)
            self.events.append(value)
            if predicate(value):
                return value
    def close(self):
        self.selector.close()

class FixtureLines(Lines):
    def __init__(self, process, path):
        self.process = process
        self.file = path.open('r')
        self.events = []
    def read(self, timeout=10):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            line = self.file.readline()
            if line:
                return line.rstrip('\n')
            if self.process.poll() is not None:
                raise RuntimeError('Owned fixture launcher exited: ' + str(self.process.returncode))
            time.sleep(.01)
        raise TimeoutError('Owned fixture output timed out')
    def close(self):
        self.file.close()

processes = []
channels = []
owned_pids = set()
report = {'scope': 'owned-fixture-only', 'transport': 'private-NDJSON', 'cases': [], 'passed': False}
with tempfile.TemporaryDirectory(prefix='cua-owned-click-') as temporary, (log_dir / (stem + '.stderr.log')).open('w') as errors:
    def spawn(name):
        executable = binary / name
        if name == 'CuaFixture':
            bundle = Path(temporary) / ('Fixture-' + str(len(owned_pids)) + '.app') / 'Contents'
            (bundle / 'MacOS').mkdir(parents=True)
            executable = bundle / 'MacOS' / name
            shutil.copy2(binary / name, executable)
            (bundle / 'Info.plist').write_bytes(plistlib.dumps({
                'CFBundleExecutable': name, 'CFBundleIdentifier': 'org.cua-kit.fixture.' + uuid.uuid4().hex,
                'CFBundlePackageType': 'APPL', 'CFBundleName': 'Cua Kit click fixture',
                'NSHighResolutionCapable': True,
            }))
        command = [str(executable)]
        if name == 'CuaFixture':
            output = Path(temporary) / ('fixture-' + str(len(owned_pids)) + '.jsonl')
            output.touch(mode=0o600)
            command = [str(binary / name), '--launch-owned-fixture', str(bundle.parent), '--report-file', str(output)]
        process = subprocess.Popen(command, cwd=root, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=errors)
        processes.append(process)
        channel = Lines(process)
        if name == 'CuaFixture':
            try:
                launched = json.loads(channel.read())
                if launched.get('event') != 'launched' or not isinstance(launched.get('pid'), int) or launched['pid'] <= 0:
                    raise RuntimeError('Owned fixture launch failed: ' + json.dumps(launched))
                process.fixture_pid = launched['pid']
                owned_pids.add(process.fixture_pid)
            finally:
                channel.close()
            channel = FixtureLines(process, output)
        channels.append(channel)
        return process, channel
    try:
        report['stage'] = 'desktop-preflight'
        desktop = subprocess.run([str(binary / 'CuaFixture'), '--desktop-session-check'],
            capture_output=True, text=True, timeout=5, check=True)
        report['desktopSession'] = json.loads(desktop.stdout)
        if report['desktopSession'].get('screenLocked') is True:
            raise RuntimeError('DESKTOP_LOCKED: unlock the desktop before owned-window live acceptance; no input attempted')
        helper, responses = spawn('cua-helper')
        def request(method, params=None):
            identifier = str(uuid.uuid4())
            helper.stdin.write((json.dumps({'id': identifier, 'method': method, 'params': params or {}}) + '\n').encode())
            helper.stdin.flush()
            response = json.loads(responses.read())
            if response.get('id') != identifier:
                raise RuntimeError('Native response ID mismatch')
            if 'error' in response:
                raise RuntimeError(json.dumps(response['error']))
            return response['result']
        report['stage'] = 'helper-handshake'
        hello = request('hello')
        if not hello['permissions']['accessibility']:
            raise RuntimeError('Accessibility permission absent; no fixture input attempted')
        report['stage'] = 'foreground-fixture-startup'
        target_process, target_events = spawn('CuaFixture')
        target_events.event(lambda event: event.get('active') is True)
        assert target_process.fixture_pid in owned_pids and target_process.poll() is None
        target_id = request('bind', {'pid': target_process.fixture_pid})['targetId']
        def observe():
            return request('observe', {'targetId': target_id})
        def stable_observation():
            # LaunchServices/AppKit adds toolbar AX groups asynchronously after
            # activation. Wait for observed state convergence before first input,
            # without retrying a dispatched action or relaxing backend checks.
            end = time.monotonic() + 3
            previous = None
            identical = 0
            while time.monotonic() < end:
                state = observe()
                current = json.dumps(state['elements'], sort_keys=True)
                identical = identical + 1 if current == previous and not state['warnings'] else 0
                if identical >= 2:
                    return state
                previous = current
                time.sleep(.1)
            raise RuntimeError('Owned fixture AX state did not settle before input')
        def click_case(name, coordinate=False):
            assert target_process.fixture_pid in owned_pids and target_process.poll() is None
            marker = 'owned-' + name + '-' + uuid.uuid4().hex[:6]
            state = stable_observation()
            field = next(item for item in state['elements'] if item['role'] == 'AXTextField')
            try:
                request('action', {'targetId': target_id, 'snapshotId': state['snapshotId'],
                    'elementId': field['id'], 'operation': 'setValue', 'value': marker})
            except Exception:
                # Owned-fixture state only; preserve evidence without retrying
                # a rejected action or weakening snapshot validation.
                report['rejectedActionObservation'] = state
                report['afterRejectedActionObservation'] = observe()
                raise
            state = stable_observation()
            button = next(item for item in state['elements'] if item['name'] == 'Save fixture')
            input_params = {'targetId': target_id, 'snapshotId': state['snapshotId'],
                'alwaysSimulateClick': True, 'deadlineUnixMilliseconds': time.time() * 1000 + 8000}
            if coordinate:
                state = request('observeWithScreenshot', {'targetId': target_id})
                button = next(item for item in state['elements'] if item['name'] == 'Save fixture')
                frame = button['frame']
                image = state['screenshot']
                rect = image['contentRect']
                input_params.update(snapshotId=state['snapshotId'],
                    x=(frame['x'] + frame['width'] / 2 - rect['x']) * image['pixelWidth'] / rect['width'],
                    y=(frame['y'] + frame['height'] / 2 - rect['y']) * image['pixelHeight'] / rect['height'])
            else:
                input_params['elementId'] = button['id']
            result = request('mouseInput', input_params)
            observed = False
            end = time.monotonic() + 3
            while time.monotonic() < end:
                state = observe()
                if 'Saved ' + marker in json.dumps(state['elements']):
                    observed = True
                    break
                time.sleep(.05)
            report['cases'].append({'name': name, 'dispatch': result, 'savedTextObserved': observed})
            if not observed:
                raise AssertionError(name + ': dispatch returned but saved text did not change')
        report['stage'] = 'foreground-click'
        click_case('foreground')
        report['stage'] = 'foreground-coordinate-click'
        click_case('foreground-coordinate', coordinate=True)
        report['stage'] = 'second-fixture-startup'
        foreground, foreground_events = spawn('CuaFixture')
        foreground_events.event(lambda event: event.get('active') is True)
        target_events.event(lambda event: event.get('active') is False)
        report['stage'] = 'background-click'
        click_case('background')
        report['stage'] = 'background-coordinate-click'
        click_case('background-coordinate', coordinate=True)
        request('release', {'targetId': target_id})
        report['passed'] = True
        report['stage'] = 'complete'
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        # Each handle is owned by this run; never discover or kill by app name.
        for process in reversed(processes):
            if process.poll() is None and process.stdin and not process.stdin.closed:
                process.stdin.close()
        for process in reversed(processes):
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        for channel in channels:
            channel.close()
        report['fixtureEvents'] = [channel.events for channel in channels[1:]]
        report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': report['passed'], 'cases': report['cases'], 'error': report.get('error'), 'stage': report.get('stage'), 'localReport': str(report_path)}))
raise SystemExit(0 if report['passed'] else 1)
