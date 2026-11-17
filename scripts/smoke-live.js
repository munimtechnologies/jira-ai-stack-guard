'use strict';
// Smoke test against the live advisory feed: node scripts/smoke-live.js [outDir]
// Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/core');

async function main() {
  const outDir = process.argv[2] || '.';
  const res = await fetch(core.FEED_URL);
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const data = await res.json();
  const products = Object.keys(data.products);
  const items = products.reduce((n, k) => n + data.products[k].items.length, 0);
  const demoDir = path.join(__dirname, '..', 'demo');
  const sources = fs.readdirSync(demoDir).map((name) => ({
    file: name,
    kind: core.fileKind(name),
    text: fs.readFileSync(path.join(demoDir, name), 'utf8'),
  }));
  const findings = core.scanSources(data, sources);
  const report = core.compactReport(data, findings, { feedProducts: products.length, feedEntries: items });
  // Every curated product must be reachable by name through check-component.
  const unreachable = products.filter((k) => core.findProduct(data, data.products[k].name) !== k);
  if (unreachable.length) throw new Error(`products not found by name: ${unreachable.join(', ')}`);
  // Every entry's version fields must parse, or matching silently skips them.
  const bad = [];
  for (const k of products) {
    for (const it of data.products[k].items) {
      for (const field of ['introduced', 'fixed', 'lastAffected']) {
        if (it[field] && !core.vtuple(it[field])) bad.push(`${k} ${it.ids[0]} ${field}=${it[field]}`);
      }
      if (!Array.isArray(it.ids) || !it.ids.length || !it.summary || !it.url) bad.push(`${k} entry missing ids/summary/url`);
    }
  }
  if (bad.length) throw new Error(`unparseable feed entries: ${bad.join('; ')}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'demo-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'demo-comment.adf.json'), JSON.stringify(core.findingsCommentAdf(data, findings, 'AI Stack Guard: advisory check'), null, 2));
  console.log(`feed ${data.checked}: ${products.length} products, ${items} entries; demo: ${report.checked} checked, ${report.affected} affected, ${report.unpinned} unpinned`);
  for (const f of report.findings) console.log(`  ${f.where}  ${f.summary}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
