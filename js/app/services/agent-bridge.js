import * as Store from './storage-service.js';
import { createModal } from '../../ui/components/modals/modal-factory.js';
import { downloadJsonData } from './export-service.js';
import { agentCatalog } from '../../shared/agent-command-catalog.mjs';

const ENDPOINT = 'http://127.0.0.1:17865';
const BACKUP_KEY = 'ftrack:agent-recovery:v1';
const RECEIPTS_KEY = 'ftrack:agent-receipts:v1';
const proposals = new Map();
const requests = new Map();
const listeners = new Set();
let token = null, connected = false, allowWrites = false, running = false, generation = 0;
let activeWorker = null, cancelWorker = null;
const pageId = crypto.randomUUID();
const state = { message: 'Disconnected' };
const notify = message => {
  state.message = message;
  for (const listener of listeners) listener();
};
export function getAgentConnectionState() { return { connected, allowWrites, ...state }; }
export function subscribeAgentConnection(listener) { listeners.add(listener); return () => listeners.delete(listener); }

export async function agentWorkspaceRevision(data) {
  // UI navigation is not a financial-data change. Preserve it on apply.
  const input = JSON.stringify({ schemaVersion: data.schemaVersion, scenarios: data.scenarios,
    migrationReport: data.migrationReport });
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))),
    byte => byte.toString(16).padStart(2, '0')).join('');
}
async function post(route, body, signal) {
  const response = await fetch(ENDPOINT + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ ...body, pageId }), signal: signal || AbortSignal.timeout(10_000)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Local helper request failed.');
  return value;
}
function isolated(workspace, request) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./agent-worker.js', import.meta.url), { type: 'module' });
    activeWorker = worker;
    const finish = (error, result) => {
      clearTimeout(timeout);
      worker.terminate();
      activeWorker = cancelWorker = null;
      error ? reject(new Error(error)) : resolve(result);
    };
    cancelWorker = () => finish('Agent calculation cancelled. No data was applied.');
    const timeout = setTimeout(() => finish('Agent calculation exceeded 90 seconds. No data was applied.'), 90_000);
    worker.onmessage = ({ data }) => finish(data.error, data.result);
    worker.onerror = event => finish(event.message || 'Application worker failed.');
    worker.postMessage({ workspace, request });
  });
}
function paginated(result, input) {
  const offset = input.offset ?? 0, limit = input.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Use offset ≥ 0 and limit between 1 and 200.');
  }
  if (Array.isArray(result)) return { total: result.length, offset, results: result.slice(offset, offset + limit) };
  if (Array.isArray(result?.occurrences)) return { ...result, total: result.occurrences.length,
    occurrences: result.occurrences.slice(offset, offset + limit) };
  return result;
}
export async function executeAgentRequest(tool, input) {
  const workspace = await Store.read();
  if (tool === 'ftrack_read') return paginated(await isolated(workspace, { ...input, kind: 'read' }), input);
  if (tool === 'ftrack_calculate') return isolated(workspace, { ...input, kind: 'calculate' });
  if (tool === 'ftrack_prepare') {
    if (typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 120) {
      throw new Error('Provide a unique requestId (1–120 characters) and reuse it only for an exact retry.');
    }
    const requestHash = JSON.stringify(input.operations);
    if (requests.has(input.requestId)) {
      const previous = requests.get(input.requestId);
      if (previous.requestHash !== requestHash) throw new Error('requestId was already used for different commands.');
      return previous.response;
    }
    const baseRevision = await agentWorkspaceRevision(workspace);
    const result = await isolated(workspace, { kind: 'prepare', operations: input.operations });
    if (!result.applicable) return result;
    if (proposals.size >= 10) throw new Error('Ten proposals are pending. Apply one or disconnect to clear them.');
    const proposalId = crypto.randomUUID();
    const response = { proposalId, baseRevision, expiresAt: new Date(Date.now() + 600_000).toISOString(),
      changes: result.changes, validation: result.validation, applicable: true };
    proposals.set(proposalId, { ...response, data: result.data, operations: input.operations });
    requests.set(input.requestId, { requestHash, response });
    return response;
  }
  if (tool !== 'ftrack_apply') throw new Error('Unknown agent request.');
  if (!allowWrites) throw new Error('Enable Allow agent changes in FTrack first. Preparation is still read-only.');
  if (input.approved !== true) throw new Error('Review the proposal and explicitly approve it before applying.');
  const receipts = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || '[]');
  const receipt = receipts.find(item => item.proposalId === input.proposalId);
  if (receipt) return { ...receipt, alreadyApplied: true };
  const proposal = proposals.get(input.proposalId);
  if (!proposal || Date.parse(proposal.expiresAt) < Date.now()) throw new Error('Proposal is missing or expired. Prepare again.');
  const afterRevision = await agentWorkspaceRevision(proposal.data);
  // If a prior call committed but its response/receipt was lost, recover it.
  const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
  if (backup?.proposalId === input.proposalId && await agentWorkspaceRevision(workspace) === afterRevision) {
    return { proposalId: input.proposalId, applied: true, alreadyApplied: true, revision: afterRevision };
  }
  let checked = false;
  await Store.transaction(async current => {
    if (!allowWrites || !connected) throw new Error('Connection or write permission was revoked.');
    if (await agentWorkspaceRevision(current) !== proposal.baseRevision) {
      throw new Error('Workspace changed since preparation. No data was applied. Prepare again.');
    }
    // Refuse to commit if a recovery snapshot cannot fit in browser storage.
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ proposalId: input.proposalId,
      createdAt: new Date().toISOString(), afterRevision, data: current }));
    checked = true;
    return { ...current, scenarios: proposal.data.scenarios, migrationReport: proposal.data.migrationReport };
  }, { source: 'agent' });
  if (!checked) throw new Error('Agent change was not applied.');
  const applied = { proposalId: input.proposalId, applied: true, revision: afterRevision,
    appliedAt: new Date().toISOString(), operations: proposal.operations.map(row => row.operation) };
  try { localStorage.setItem(RECEIPTS_KEY, JSON.stringify([...receipts, applied].slice(-50))); } catch (_) { /* recovery snapshot still exists */ }
  proposals.delete(input.proposalId);
  document.dispatchEvent(new CustomEvent('ftrack:agentDataApplied'));
  notify('Applied ' + applied.operations.length + ' agent command(s)');
  return applied;
}
async function poll(ticket) {
  if (running) return;
  running = true;
  try {
    while (connected && ticket === generation) {
      const { job } = await post('/poll', {});
      if (job) {
        notify('Agent: ' + job.tool);
        let result, error;
        const heartbeat = setInterval(() => {
          void post('/heartbeat', {}).catch(() => {
            connected = allowWrites = false;
            cancelWorker?.();
          });
        }, 5000);
        try { result = await executeAgentRequest(job.tool, job.input); }
        catch (reason) { error = reason.message; }
        finally { clearInterval(heartbeat); }
        await post('/result', { id: job.id, result, error });
        notify(error ? 'Agent request rejected: ' + error : 'Connected · Last request: ' + job.tool);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    connected = allowWrites = false;
    notify(error.message + ' Reconnect using the helper pairing code.');
  } finally { running = false; }
}
export async function connectAgentBridge(code) {
  if (running || connected) throw new Error('Disconnect the current agent connection first.');
  const paired = await post('/pair', { code: code.trim() });
  token = paired.token;
  connected = true;
  allowWrites = false;
  notify('Connected · Read and prepare only');
  void poll(++generation);
}
export async function disconnectAgentBridge() {
  connected = allowWrites = false;
  generation++;
  cancelWorker?.();
  try { await post('/disconnect', {}); } catch (_) { /* already disconnected */ }
  token = null;
  proposals.clear();
  requests.clear();
  notify('Disconnected');
}
export function openAgentConnectionDialog() {
  const { modal, close } = createModal({ contentClass: 'agent-connection-dialog' });
  const make = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
  modal.append(make('h2', 'Agent connection'),
    make('p', 'Start the local FTrack MCP helper. Ask Codex for ftrack_status, then paste its pairing code here. Only pair with an agent you trust: it can read financial data in this tab.'));
  const status = make('p', '');
  status.setAttribute('role', 'status');
  const codeLabel = make('label', 'Pairing code ');
  const code = document.createElement('input');
  code.type = 'password'; code.autocomplete = 'off'; code.className = 'input-text';
  codeLabel.append(code);
  const writeLabel = make('label', ' Allow agent changes for this connection');
  const write = document.createElement('input');
  write.type = 'checkbox';
  writeLabel.prepend(write);
  write.addEventListener('change', () => { allowWrites = connected && write.checked; notify(allowWrites ? 'Connected · Changes enabled' : 'Connected · Read and prepare only'); });
  const buttons = make('div', '');
  buttons.className = 'business-row-heading';
  const action = (text, handler) => {
    const button = make('button', text); button.type = 'button'; button.className = 'btn btn-secondary';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await handler(); } catch (error) { notify(error.message); }
      finally { render(); }
    });
    buttons.append(button); return button;
  };
  const connect = action('Connect', () => connectAgentBridge(code.value));
  const disconnect = action('Disconnect', disconnectAgentBridge);
  action('Cancel current calculation', () => cancelWorker?.());
  action('Download recovery backup', () => {
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
    if (!backup) throw new Error('No agent recovery backup exists yet.');
    downloadJsonData(backup.data, 'ftrack-agent-recovery.json');
  });
  action('Show available commands', () => {
    const pre = make('pre', JSON.stringify(agentCatalog(), null, 2));
    pre.style.whiteSpace = 'pre-wrap'; modal.append(pre);
  });
  action('Close', close);
  const render = () => {
    status.textContent = state.message;
    write.checked = allowWrites; write.disabled = !connected;
    connect.disabled = connected; disconnect.disabled = !connected;
  };
  modal.append(status, codeLabel, writeLabel, buttons,
    make('p', 'Every write requires a prepared, validated proposal. A local recovery snapshot is saved before applying. Disconnect revokes access. Rounding and payment timing are unchanged.'));
  const unsubscribe = subscribeAgentConnection(render);
  const observer = new MutationObserver(() => { if (!modal.isConnected) { unsubscribe(); observer.disconnect(); } });
  observer.observe(document.body, { childList: true });
  render();
}
window.addEventListener('pagehide', () => {
  activeWorker?.terminate();
  if (token) void fetch(ENDPOINT + '/disconnect', { method: 'POST', keepalive: true,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageId }) }).catch(() => {});
});
