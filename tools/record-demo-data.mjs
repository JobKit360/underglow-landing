// Records sample data for the landing-page demo from a throwaway UnderGlow server that has scanned the made-up sample project.
//   node website/tools/record-demo-data.mjs <base url, e.g. http://127.0.0.1:7861> <page id>
// Output: website/app/demo-data/codemap.json and workflow.json. Only sample data; the server must run on a throwaway data folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplify } from '../../workflowgraph-simple.mjs';

const base = process.argv[2], g = process.argv[3];
if (!base || !g) { console.error('usage: record-demo-data.mjs <base url> <page id>'); process.exit(2); }
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'demo-data');
fs.mkdirSync(out, { recursive: true });
const get = async (p) => (await fetch(base + p)).json();
const q = (s) => s.replace(/(^|&)g=[^&]*&?/, '$1').replace(/&$/, '');

const cm = {}, key = (p) => q(p.split('?')[1] ? p.split('/api/codemap/')[1] : p);
const add = async (rel) => { cm[q(rel)] = await get(`/api/codemap/${rel.includes('?') ? rel + '&' : rel + '?'}g=${g}`); return cm[q(rel)]; };
await add('state'); await add('tree'); await add('estimate'); await add('activity');
const tree = cm['tree'].nodes;
for (const p of Object.keys(tree)) {
  const r = await add('folder?p=' + encodeURIComponent(p));
  for (const f of r.files || []) { await add('file?f=' + encodeURIComponent(f.f)); await add('links?f=' + encodeURIComponent(f.f)); }
}
fs.writeFileSync(path.join(out, 'codemap.json'), JSON.stringify(cm));
// the real scanner, plus one thing a customer sets up on purpose: a person's OK in front of the live site (it draws the red "Your OK" gate)
const wf = await get('/api/workflow?g=' + g);
const live = wf.edges.find((e) => e.to === 'deploy:host');
if (live) { live.trigger = { kind: 'human' }; wf.simple = simplify(wf); }
fs.writeFileSync(path.join(out, 'workflow.json'), JSON.stringify(wf));
console.log('codemap entries', Object.keys(cm).length);
