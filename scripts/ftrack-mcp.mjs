#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connectLocalBroker } from './lib/ftrack-agent-broker.mjs';
import { agentCatalog, AGENT_READS, AGENT_CALCULATIONS, assertSafeAgentInput } from '../js/shared/agent-command-catalog.mjs';

const schema = properties => ({ type: 'object', properties, additionalProperties: false });
const number = { type: 'integer' }, string = { type: 'string' }, object = { type: 'object' };
const tools = [
  { name: 'ftrack_status', description: 'Connection status and pairing code for the local FTrack tab.', inputSchema: schema({}) },
  { name: 'ftrack_catalog', description: 'Discover supported application commands and their ordered positional arguments.', inputSchema: schema({}) },
  { name: 'ftrack_read', description: 'Read scoped FTrack data. Request statementSource explicitly for original CSV. Offset/limit paginate returned arrays.',
    inputSchema: { ...schema({ resource: { enum: AGENT_READS }, scenarioId: number, startDate: string, endDate: string,
      sourceId: string, offset: number, limit: number }), required: ['resource'] } },
  { name: 'ftrack_calculate', description: 'Read-only projections, Workshop preview/break-even tests (including paused/default variables and optimization), or goal solver. Large range tests can be cancelled; no plan is saved.',
    inputSchema: { ...schema({ calculation: { enum: AGENT_CALCULATIONS }, scenarioId: number, businessModel: object,
      options: object, settings: object, values: { type: 'array' }, startMonth: string, months: number,
      includeRepayments: { type: 'boolean' }, meetsOnly: { type: 'boolean' }, offset: number, limit: number }),
    required: ['calculation', 'scenarioId'] } },
  { name: 'ftrack_prepare', description: 'Prepare a validated atomic batch without changing live data. First call catalog. Review returned diff, then apply its proposalId only with user approval. requestId identifies retries of the exact same batch.',
    inputSchema: { ...schema({ requestId: string, operations: { type: 'array', minItems: 1, maxItems: 30,
      items: { ...schema({ operation: string, args: { type: 'array' } }), required: ['operation', 'args'] } } }),
    required: ['requestId', 'operations'] } },
  { name: 'ftrack_apply', description: 'Apply a prepared proposal atomically after approval. App write access must be enabled. Rejects stale data. Retry the SAME proposalId after an uncertain outcome. Keeps recovery backup in the app, never Git.',
    inputSchema: { ...schema({ proposalId: string, approved: { const: true } }), required: ['proposalId', 'approved'] } }
].map(tool => ({ ...tool, annotations: { readOnlyHint: tool.name !== 'ftrack_apply',
  destructiveHint: tool.name === 'ftrack_apply', openWorldHint: false, idempotentHint: true } }));

function check(value, definition) {
  if (Object.hasOwn(definition, 'const') && value !== definition.const) throw new Error('Explicit approval is required.');
  if (definition.enum && !definition.enum.includes(value)) throw new Error('Unknown resource or calculation.');
  if (definition.type === 'object') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Object expected.');
    for (const key of definition.required || []) if (!Object.hasOwn(value, key)) throw new Error('Missing ' + key);
    for (const [key, child] of Object.entries(value)) {
      const field = definition.properties?.[key];
      if (!field && definition.additionalProperties === false) throw new Error('Unexpected field: ' + key);
      if (field) check(child, field);
    }
  } else if (definition.type === 'array') {
    if (!Array.isArray(value) || value.length < (definition.minItems || 0) || value.length > (definition.maxItems || Infinity)) throw new Error('Invalid array length.');
    if (definition.items) value.forEach(item => check(item, definition.items));
  } else if (definition.type === 'integer' ? !Number.isSafeInteger(value)
    : definition.type && typeof value !== definition.type) throw new Error('Invalid argument type.');
}
export function createFtrackMcpServer(call) {
  const server = new Server({ name: 'ftrack', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      const tool = tools.find(item => item.name === params.name);
      if (!tool) throw new Error('Unknown FTrack tool.');
      const input = params.arguments || {};
      assertSafeAgentInput(input);
      check(input, tool.inputSchema);
      const result = params.name === 'ftrack_catalog' ? agentCatalog() : await call(params.name, input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const broker = await connectLocalBroker();
  if (process.argv.includes('--bridge')) {
    console.error(JSON.stringify(await broker.call('ftrack_status'), null, 2));
  } else {
    const server = createFtrackMcpServer(broker.call);
    await server.connect(new StdioServerTransport());
    process.stdin.on('end', () => { broker.close(); void server.close(); });
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { broker.close(); process.exit(0); });
}
