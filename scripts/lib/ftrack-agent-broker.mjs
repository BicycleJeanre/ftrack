import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, readFile, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const BRIDGE_PORT = 17865;
const secret = () => randomBytes(24).toString('hex');
const same = (left = '', right = '') => {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
export const defaultOrigins = ['https://bicyclejeanre.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

export function createAgentBroker({ port = BRIDGE_PORT, origins = defaultOrigins, timeoutMs = 120_000 } = {}) {
  const agentToken = secret();
  let pairingCode = secret(), session = null, attempts = 0, attemptWindow = Date.now();
  const jobs = new Map();
  const allowed = new Set(origins);
  const json = (res, code, value) => {
    if (!res.destroyed) {
      res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    }
  };
  const release = () => {
    for (const job of jobs.values()) job.fail(new Error('FTrack disconnected; check the app before retrying a write.'));
    jobs.clear();
    session = null;
    pairingCode = secret();
  };
  const connected = () => session && Date.now() - session.lastSeen < 25_000;
  async function call(tool, input = {}) {
    if (tool === 'ftrack_status') return { connected: Boolean(connected()),
      pairingCode: connected() ? null : pairingCode, url: 'http://127.0.0.1:' + port,
      appOrigin: session?.origin ?? null };
    if (!connected()) throw new Error('Open FTrack, choose Agent connection, and pair using ftrack_status.');
    if (jobs.size >= 40) throw new Error('Too many queued requests.');
    const id = secret();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        jobs.delete(id);
        reject(new Error('App request timed out. Apply outcome may be uncertain; retry the SAME proposalId, not a new write.'));
      }, timeoutMs);
      const finish = (fn, result) => { clearTimeout(timer); jobs.delete(id); fn(result); };
      jobs.set(id, { id, tool, input, sent: false,
        done: result => finish(resolve, result),
        fail: error => finish(reject, error) });
    });
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) return json(res, 403, { error: 'Invalid Host.' });
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) return json(res, 403, { error: 'Origin is not allowed.' });
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method !== 'POST') return json(res, 405, { error: 'POST required.' });
      const bytes = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) return json(res, 413, { error: 'Request is too large.' });
        bytes.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(bytes).toString() || '{}');
      if (req.url === '/agent') {
        if (origin || !same(req.headers.authorization, 'Bearer ' + agentToken)) return json(res, 401, { error: 'Unauthorized agent.' });
        return json(res, 200, { result: await call(body.tool, body.input) });
      }
      if (!origin) return json(res, 403, { error: 'Browser Origin required.' });
      if (req.url === '/pair') {
        if (Date.now() - attemptWindow > 60_000) { attemptWindow = Date.now(); attempts = 0; }
        if (++attempts > 10) return json(res, 429, { error: 'Too many pairing attempts.' });
        if (!same(body.code, pairingCode)) return json(res, 401, { error: 'Invalid pairing code.' });
        if (connected()) return json(res, 409, { error: 'Disconnect the currently paired tab first.' });
        release();
        session = { token: secret(), origin, lastSeen: Date.now(), pageId: null };
        return json(res, 200, { token: session.token });
      }
      if (!session || origin !== session.origin || !same(req.headers.authorization, 'Bearer ' + session.token)) {
        return json(res, 401, { error: 'Pair this tab with the helper again.' });
      }
      // A per-page lease prevents copied sessionStorage in duplicated tabs
      // from creating multiple live data writers.
      if (req.url === '/poll') {
        if (typeof body.pageId !== 'string' || !body.pageId) return json(res, 400, { error: 'pageId required.' });
        if (session.pageId && session.pageId !== body.pageId && connected()) {
          return json(res, 409, { error: 'Another tab owns the connection. Disconnect it first.' });
        }
        session.pageId = body.pageId;
        session.lastSeen = Date.now();
        const job = [...jobs.values()].find(item => !item.sent);
        if (job) { job.sent = true; return json(res, 200, { job: { id: job.id, tool: job.tool, input: job.input } }); }
        return json(res, 200, { job: null });
      }
      if (body.pageId !== session.pageId) return json(res, 409, { error: 'This page does not own the connection.' });
      session.lastSeen = Date.now();
      if (req.url === '/heartbeat') return json(res, 200, { ok: true });
      if (req.url === '/result') {
        const job = jobs.get(body.id);
        if (!job?.sent) return json(res, 409, { error: 'Unknown or expired request.' });
        body.error ? job.fail(new Error(String(body.error))) : job.done(body.result);
        return json(res, 200, { ok: true });
      }
      if (req.url === '/disconnect') { release(); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: 'Unknown endpoint.' });
    } catch (error) { json(res, 400, { error: error.message }); }
  });
  server.requestTimeout = 130_000;
  server.headersTimeout = 15_000;
  return { server, agentToken, call, close: () => { release(); server.closeAllConnections(); server.close(); } };
}

export function getAgentRuntimeDirectory() {
  // MCP clients intentionally sanitize subprocess env, including TMPDIR.
  // A stable location is essential when a terminal broker is shared by clients.
  return process.platform === 'win32'
    ? path.join(homedir(), '.ftrack-mcp')
    : path.join('/tmp', 'ftrack-mcp-' + process.getuid());
}
export async function connectLocalBroker() {
  const runtimeDir = getAgentRuntimeDirectory();
  await mkdir(runtimeDir, { mode: 0o700, recursive: true });
  const dir = await lstat(runtimeDir);
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) ||
    (process.getuid && dir.uid !== process.getuid())) throw new Error('Unsafe MCP runtime directory.');
  const file = path.join(runtimeDir, 'connection.json');
  const broker = createAgentBroker();
  try {
    await new Promise((resolve, reject) => {
      broker.server.once('error', reject);
      broker.server.listen(BRIDGE_PORT, '127.0.0.1', resolve);
    });
    const temp = file + '.' + secret();
    await writeFile(temp, JSON.stringify({ agentToken: broker.agentToken }), { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
    return { call: broker.call, close: broker.close, owner: true };
  } catch (error) {
    if (error.code !== 'EADDRINUSE') { broker.close(); throw error; }
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
      (process.getuid && stat.uid !== process.getuid())) throw new Error('Unsafe MCP runtime credentials.');
    const { agentToken } = JSON.parse(await readFile(file, 'utf8'));
    const call = async (tool, input) => {
      const response = await fetch('http://127.0.0.1:' + BRIDGE_PORT + '/agent', {
        method: 'POST', headers: { Authorization: 'Bearer ' + agentToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, input }), signal: AbortSignal.timeout(125_000)
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || 'Bridge failed.');
      return body.result;
    };
    await call('ftrack_status');
    return { call, close() {}, owner: false };
  }
}
