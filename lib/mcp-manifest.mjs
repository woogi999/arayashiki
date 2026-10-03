// Writes src-tauri/mcp-manifest.json: the app's MCP instructions and tool
// list (agent/tool-defs.js), which `arayashiki.exe --mcp` answers
// `initialize` and `tools/list` from on its own, so an AI app sees the
// server and its tools without the app's window starting. Run after
// changing tool-defs.js (tests/agent.test.js checks it's current).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_INSTRUCTIONS, mcpListing } from '../agent/tool-defs.js';

export const MANIFEST = fileURLToPath(new URL('../src-tauri/mcp-manifest.json', import.meta.url));
export const manifestText = () => JSON.stringify({ instructions: APP_INSTRUCTIONS, tools: mcpListing() }, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  fs.writeFileSync(MANIFEST, manifestText());
  console.log(`Wrote ${MANIFEST}`);
}
