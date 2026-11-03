import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';

// Chrome invokes this executable with origin; the private config path is installed by the host application.
const config = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { socketPath: string; token: string; extensionId: string };
if (process.argv[3] !== `chrome-extension://${config.extensionId}/`) throw new Error('Unexpected extension origin.');
const socket = connect(config.socketPath);
socket.on('connect', () => socket.write(JSON.stringify({ hello: 1, token: config.token, extensionId: config.extensionId }) + '\n'));
socket.on('error', () => process.exit(1));
socket.on('close', () => process.exit(0));
process.stdin.on('end', () => socket.end());
let buffer: Buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const size = buffer.readUInt32LE(0);
    if (size > 32 * 1024 * 1024) process.exit(1);
    if (buffer.length < size + 4) break;
    const payload = buffer.subarray(4, size + 4); buffer = buffer.subarray(size + 4);
    try { const message = JSON.parse(payload.toString('utf8')); socket.write(JSON.stringify(message) + '\n'); }
    catch { process.exit(1); }
  }
});
const lines = createInterface({ input: socket });
lines.on('line', line => {
  const data = Buffer.from(line, 'utf8');
  // Chrome enforces 1 MiB native-host -> extension messages. Large screenshots flow in the opposite direction.
  if (data.length > 1024 * 1024) { socket.destroy(); return; }
  const header = Buffer.alloc(4); header.writeUInt32LE(data.length);
  process.stdout.write(Buffer.concat([header, data]));
});
