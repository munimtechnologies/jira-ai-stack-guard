'use strict';
// Tests for src/core.js (node --test). Apache-2.0. Made by MV2 of Munim, Inc. with AI agents.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const core = require('../src/core');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-feed.json'), 'utf8'));

const COMPOSE = [
  'services:',
  '  ollama:',
  '    image: ollama/ollama:0.33.1',
  '  webui:',
  '    image: ghcr.io/open-webui/open-webui:v0.11.2',
  '  proxy:',
  '    image: nginx:1.27',
  '  vllm:',
  '    image: vllm/vllm-openai:latest',
].join('\n');

test('vtuple and vcmp', () => {
  assert.deepEqual(core.vtuple('v1.2'), [1, 2, 0]);
  assert.deepEqual(core.vtuple('2.0.0-rc.1'), [2, 0, 0]);
  assert.equal(core.vtuple('latest'), null);
  assert.equal(core.vcmp([0, 33, 1], [0, 33, 3]), -1);
  assert.equal(core.vcmp([1, 0, 0], [1, 0, 0]), 0);
});

test('parseImage handles registries, digests, library/ and ${VAR:-default}', () => {
  assert.deepEqual(core.parseImage('ghcr.io/open-webui/open-webui:v0.11.2'), ['open-webui/open-webui', 'v0.11.2']);
  assert.deepEqual(core.parseImage('ollama/ollama:${OLLAMA_TAG:-0.33.1}'), ['ollama/ollama', '0.33.1']);
  assert.deepEqual(core.parseImage('localhost:5000/ollama/ollama@sha256:abc'), ['ollama/ollama', null]);
  assert.deepEqual(core.parseImage('docker.io/library/ollama:1'), ['ollama', '1']);
});

test('tagVersion', () => {
  assert.equal(core.tagVersion('main-v1.74.0-stable'), '1.74.0');
  assert.equal(core.tagVersion('0.6'), '0.6');
  assert.equal(core.tagVersion('latest'), null);
  assert.equal(core.tagVersion('cuda'), null);
  assert.equal(core.tagVersion('${TAG}'), null);
  assert.equal(core.tagVersion(null), null);
});

test('compose file: affected, ok-skipped and unpinned images', () => {
  const f = core.scanText(data, 'compose.yaml', 'yaml', COMPOSE);
  assert.equal(f.length, 3);
  const [ollama, webui, vllm] = f;
  assert.equal(ollama.line, 3);
  assert.equal(ollama.status, 'affected');
  assert.deepEqual(ollama.advisories.map((a) => a.id), ['CVE-2026-85180']); // Windows-only advisory skipped for images
  assert.equal(ollama.upgradeTo, '0.33.3');
  assert.equal(webui.line, 5);
  assert.equal(webui.version, '0.11.2');
  assert.deepEqual(webui.advisories.map((a) => a.id), ['GHSA-vpq8-f445-hcq7', 'GHSA-3vvh-g22g-jq6r']); // HIGH before MODERATE
  assert.equal(webui.advisories[0].notInPublicDatabases, true);
  assert.equal(webui.advisories[1].onlyIfFeatureUsed, true);
  assert.equal(webui.upgradeTo, '0.12.2');
  assert.equal(vllm.status, 'unpinned');
  assert.equal(vllm.line, 9);
});

test('Dockerfile FROM with flags', () => {
  const f = core.scanText(data, 'Dockerfile', 'docker', 'FROM --platform=linux/amd64 ollama/ollama:0.34.2 AS base\nRUN echo hi');
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].advisories.map((a) => a.id), ['CVE-2026-103663']);
  assert.equal(f[0].advisories[0].severity, 'CRITICAL');
  assert.equal(f[0].upgradeTo, '0.35.0');
});

test('requirements: only-lists, extras, underscores', () => {
  const text = 'litellm==1.82.7\nvllm[audio] == 0.31.0\nopen_webui==0.11.4\nrequests==2.0\n';
  const f = core.scanText(data, 'requirements.txt', 'req', text);
  assert.equal(f.length, 3);
  assert.equal(f[0].product, 'litellm');
  assert.equal(f[0].status, 'affected');
  assert.equal(f[0].upgradeTo, null);
  assert.equal(f[0].noFixedRelease, 1);
  assert.equal(f[1].product, 'vllm');
  assert.equal(f[1].upgradeTo, '0.32.0');
  assert.equal(f[2].product, 'openwebui');
  assert.deepEqual(f[2].advisories.map((a) => a.id), ['GHSA-3vvh-g22g-jq6r']);
  assert.equal(core.scanText(data, 'requirements.txt', 'req', 'litellm==1.82.9')[0].status, 'ok');
});

test('package.json: ranges and line numbers', () => {
  const text = '{\n  "dependencies": {\n    "n8n": "^1.100.0",\n    "@modelcontextprotocol/inspector": "0.14.1"\n  }\n}\n';
  const f = core.scanText(data, 'package.json', 'npm', text);
  assert.equal(f.length, 2);
  assert.equal(f[0].line, 3);
  assert.equal(f[0].range, true);
  assert.deepEqual(f[0].advisories.map((a) => a.id), ['CVE-2026-0002', 'CVE-2026-0001']);
  assert.equal(f[0].upgradeTo, '1.120.0');
  assert.match(core.describe(f[0]), /version range/);
  assert.equal(f[1].line, 4);
  assert.equal(f[1].status, 'ok');
  assert.deepEqual(core.scanText(data, 'package.json', 'npm', '{not json'), []);
});

test('CycloneDX SBOM: docker, pypi, nested npm and oci purls', () => {
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [
      { type: 'container', name: 'ollama', purl: 'pkg:docker/ollama/ollama@0.30.0' },
      { type: 'library', name: 'litellm', purl: 'pkg:pypi/litellm@1.82.8' },
      { type: 'application', name: 'stack', components: [
        { type: 'library', name: 'inspector', purl: 'pkg:npm/%40modelcontextprotocol/inspector@0.13.0' },
      ] },
      { type: 'container', name: 'open-webui', purl: 'pkg:oci/open-webui@sha256%3Aabc?repository_url=ghcr.io/open-webui/open-webui&tag=v0.9.6' },
      { type: 'library', name: 'left-pad', purl: 'pkg:npm/left-pad@1.3.0' },
    ],
  };
  assert.equal(core.fileKind('sbom.cdx.json'), 'json');
  const f = core.scanText(data, 'sbom.cdx.json', 'json', JSON.stringify(sbom));
  assert.deepEqual(f.map((x) => [x.product, x.version, x.status]), [
    ['ollama', '0.30.0', 'affected'],
    ['litellm', '1.82.8', 'affected'],
    ['mcpinspector', '0.13.0', 'affected'],
    ['openwebui', '0.9.6', 'affected'],
  ]);
  assert.equal(f[3].advisories.length, 2);
});

test('parsePurl', () => {
  assert.deepEqual(core.parsePurl('pkg:npm/%40scope/name@1.0.0?a=b#x'), {
    type: 'npm', namespace: '@scope', name: 'name', version: '1.0.0', qualifiers: { a: 'b' },
  });
  assert.equal(core.parsePurl('not a purl'), null);
});

test('fileKind and codeBlockKind', () => {
  assert.equal(core.fileKind('docker-compose.yml'), 'yaml');
  assert.equal(core.fileKind('Dockerfile.gpu'), 'docker');
  assert.equal(core.fileKind('requirements-dev.txt'), 'req');
  assert.equal(core.fileKind('sub/package.json'), 'npm');
  assert.equal(core.fileKind('notes.txt'), null);
  assert.equal(core.codeBlockKind('yaml', 'anything'), 'yaml');
  assert.equal(core.codeBlockKind('', 'FROM ollama/ollama:0.1'), 'docker');
  assert.equal(core.codeBlockKind('', 'services:\n  a:\n    image: x'), 'yaml');
  assert.equal(core.codeBlockKind('', 'litellm==1.0'), 'req');
  assert.equal(core.codeBlockKind('', 'hello'), null);
});

test('checkComponent: names, Windows-only advisories, lastAffected, unpinned, unknown', () => {
  assert.equal(core.findProduct(data, 'Open WebUI'), 'openwebui');
  assert.equal(core.findProduct(data, 'open-webui'), 'openwebui');
  assert.equal(core.findProduct(data, 'vllm/vllm-openai'), 'vllm');
  assert.equal(core.findProduct(data, 'ragflow'), null); // not in this fixture
  assert.equal(core.checkComponent(data, 'ollama', '0.20.0').status, 'affected'); // Windows advisory counted
  assert.equal(core.checkComponent(data, 'ollama', '0.20.0', 'docker').status, 'ok');
  assert.equal(core.checkComponent(data, 'Dify', '1.11.4').status, 'affected');
  assert.equal(core.checkComponent(data, 'Dify', 'v1.11.5').status, 'ok');
  assert.equal(core.checkComponent(data, 'ollama', 'latest').status, 'unpinned');
  assert.equal(core.checkComponent(data, 'nonsense', '1.0').status, 'unknown-product');
});

test('change detection keys', () => {
  const f = core.scanText(data, 'compose.yaml', 'yaml', COMPOSE);
  assert.deepEqual(core.advisoryKeys(f), [
    'ollama@0.33.1:CVE-2026-85180',
    'openwebui@0.11.2:GHSA-3vvh-g22g-jq6r',
    'openwebui@0.11.2:GHSA-vpq8-f445-hcq7',
  ]);
  const fresh = core.newSince(f, ['ollama@0.33.1:CVE-2026-85180']);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].product, 'openwebui');
  assert.equal(fresh[0].advisories.length, 2);
  assert.equal(core.newSince(f, core.advisoryKeys(f)).length, 0);
});

test('ADF: code blocks are found, nested too', () => {
  const doc = {
    type: 'doc', version: 1, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Prod stack' }] },
      { type: 'codeBlock', attrs: { language: 'yaml' }, content: [{ type: 'text', text: COMPOSE }] },
      { type: 'expand', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'litellm==1.82.7' }] }] },
    ],
  };
  const blocks = core.adfCodeBlocks(doc);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].language, 'yaml');
  assert.equal(blocks[1].text, 'litellm==1.82.7');
  assert.deepEqual(core.adfCodeBlocks(null), []);
});

function walkAdf(node, visit) {
  visit(node);
  for (const c of node.content || []) walkAdf(c, visit);
}

test('ADF comment and upgrade task are well formed', () => {
  const f = core.scanText(data, 'compose.yaml', 'yaml', COMPOSE);
  const adf = core.findingsCommentAdf(data, f, 'AI Stack Guard');
  assert.equal(adf.type, 'doc');
  assert.equal(adf.version, 1);
  const hrefs = [];
  walkAdf(adf, (n) => {
    if (n.type === 'text') {
      assert.ok(n.text && n.text.length > 0, 'no empty text nodes');
      for (const m of n.marks || []) if (m.type === 'link') hrefs.push(m.attrs.href);
    }
    if (n.type === 'bulletList') assert.ok(n.content.length > 0, 'no empty lists');
  });
  assert.ok(hrefs.includes('https://osv.dev/vulnerability/CVE-2026-85180'));
  assert.ok(hrefs.includes(core.FEED_HOME));
  assert.match(JSON.stringify(adf), /Not checked \(no exact version\): vLLM/);
  const clean = core.findingsCommentAdf(data, core.scanText(data, 'c.yaml', 'yaml', 'image: ollama/ollama:0.35.0'));
  assert.match(JSON.stringify(clean), /No known advisories affect the 1 pinned/);
  const task = core.upgradeIssueFields(data, f[0], 'OPS-12');
  assert.equal(task.summary, 'Update Ollama 0.33.1 to 0.33.3 (1 known advisory)');
  assert.match(JSON.stringify(task.description), /OPS-12 \(compose.yaml:3\)/);
});

test('compact report', () => {
  const f = core.scanText(data, 'compose.yaml', 'yaml', COMPOSE);
  const r = core.compactReport(data, f, { issueKey: 'OPS-12' });
  assert.equal(r.issueKey, 'OPS-12');
  assert.equal(r.checked, 3);
  assert.equal(r.affected, 2);
  assert.equal(r.unpinned, 1);
  assert.equal(r.curatedDataAsOf, '2026-11-10');
  assert.equal(r.findings[0].where, 'compose.yaml:3');
  assert.equal(r.findings[0].updateTo, '0.33.3');
});
