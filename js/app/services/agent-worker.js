import { runAgentEngine } from './agent-engine.js';
self.onmessage = async ({ data: { workspace, request } }) => {
  try { self.postMessage({ result: await runAgentEngine(workspace, request) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
