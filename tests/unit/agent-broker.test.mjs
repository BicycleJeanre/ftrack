import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createAgentBroker, getAgentRuntimeDirectory } from '../../scripts/lib/ftrack-agent-broker.mjs';

test('broker credentials have the same runtime path under sanitized MCP subprocess environments', () => {
  const script = 'import {getAgentRuntimeDirectory} from ' +
    JSON.stringify(new URL('../../scripts/lib/ftrack-agent-broker.mjs', import.meta.url).href) +
    '; console.log(getAgentRuntimeDirectory());';
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'TMPDIR'));
  const child = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim();
  assert.equal(child, getAgentRuntimeDirectory());
});

test('broker binds loopback, rejects hostile origins, pairs one tab, and requires separate agent credentials', async () => {
  const port = 18765;
  const origin = 'http://localhost:8000';
  const broker = createAgentBroker({ port, origins: [origin], timeoutMs: 300 });
  await new Promise(resolve => broker.server.listen(port, '127.0.0.1', resolve));
  const send = (route, body, token, source = origin) => fetch('http://127.0.0.1:' + port + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(source ? { Origin: source } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
  });
  try {
    assert.equal(broker.server.address().address, '127.0.0.1');
    assert.equal((await send('/pair', {}, null, 'https://evil.example')).status, 403);
    assert.equal((await send('/agent', { tool: 'ftrack_status' }, null, null)).status, 401);
    const status = await broker.call('ftrack_status');
    const paired = await (await send('/pair', { code: status.pairingCode })).json();
    assert.ok(paired.token);
    assert.equal((await send('/poll', { pageId: 'page1' }, paired.token)).status, 200);
    assert.equal((await send('/poll', { pageId: 'page2' }, paired.token)).status, 409);
    assert.equal((await send('/pair', { code: status.pairingCode })).status, 401);
    const result = broker.call('ftrack_read', { resource: 'scenarios' });
    const { job } = await (await send('/poll', { pageId: 'page1' }, paired.token)).json();
    assert.equal(job.tool, 'ftrack_read');
    assert.equal((await send('/result', { pageId: 'page2', id: job.id, result: [] }, paired.token)).status, 409);
    await send('/result', { pageId: 'page1', id: job.id, result: ['ok'] }, paired.token);
    assert.deepEqual(await result, ['ok']);
    await assert.rejects(() => broker.call('ftrack_read'), /timed out/);
    await send('/disconnect', { pageId: 'page1' }, paired.token);
    assert.equal((await broker.call('ftrack_status')).connected, false);
    assert.equal((await send('/poll', { pageId: 'page1' }, paired.token)).status, 401);
  } finally { broker.close(); }
});
