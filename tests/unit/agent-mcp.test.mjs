import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createFtrackMcpServer } from '../../scripts/ftrack-mcp.mjs';

test('official SDK client negotiates tools, discovers commands, and validates requests without a browser', async () => {
  const calls = [];
  const server = createFtrackMcpServer(async (tool, input) => { calls.push({ tool, input }); return { connected: false }; });
  const client = new Client({ name: 'ftrack-test', version: '1.0.0' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(left), client.connect(right)]);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
    const catalog = await client.callTool({ name: 'ftrack_catalog' });
    assert.ok(JSON.parse(catalog.content[0].text).commands.length > 40);
    const status = await client.callTool({ name: 'ftrack_status' });
    assert.equal(JSON.parse(status.content[0].text).connected, false);
    assert.equal(calls.length, 1);
    const rejected = await client.callTool({ name: 'ftrack_apply', arguments: { proposalId: 'test', approved: false } });
    assert.equal(rejected.isError, true);
    const malformed = await client.callTool({ name: 'ftrack_prepare', arguments: { requestId: 'x', operations: [{ args: [] }] } });
    assert.equal(malformed.isError, true);
    assert.equal(calls.length, 1);
  } finally { await client.close(); await server.close(); }
});
