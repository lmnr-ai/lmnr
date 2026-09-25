import assert from 'node:assert/strict';
import test from 'node:test';
import {createCdpClient} from './cdp-client';

class Socket {
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: {data: string}) => void;
  sent: any[] = [];
  closed = false;
  send(value: string) {this.sent.push(JSON.parse(value));}
  close() {this.closed = true;}
}
function connected(timeout = 1000) {
  const socket = new Socket();
  const client = createCdpClient(socket as unknown as WebSocket, timeout);
  socket.onopen!();
  return {socket, client};
}

test('CDP completes requests and rejects render exceptions', async () => {
  const {socket, client} = connected();
  await client.ready;
  const result = client.evaluate('1');
  socket.onmessage!({data: JSON.stringify({id: 1, result: {result: {value: 1}}})});
  assert.equal(await result, 1);
  const failure = assert.rejects(client.evaluate('bad'), /exception/);
  socket.onmessage!({data: JSON.stringify({id: 2, result: {exceptionDetails: {text: 'exception'}}})});
  await failure; client.close();
});

test('CDP rejects pending render and PCM reads on connection loss', async () => {
  for (const event of ['onclose', 'onerror'] as const) {
    const {socket, client} = connected();
    await client.ready;
    const render = assert.rejects(client.evaluate('render()'), /CDP/);
    const pcm = assert.rejects(client.evaluate('pcm()'), /CDP/);
    socket[event]!();
    await Promise.all([render, pcm]);
    assert.equal(socket.closed, true);
    await assert.rejects(client.evaluate('later()'), /CDP/);
  }
});

test('CDP deadlines and Chrome exit cancel pending work', async () => {
  const {client} = connected(10);
  await client.ready;
  await assert.rejects(client.evaluate('hung()'), /timed out/);
  const next = connected(); await next.client.ready;
  const rendering = assert.rejects(next.client.evaluate('render()'), /Chrome exited/);
  next.client.close(new Error('Chrome exited'));
  await rendering;
});
