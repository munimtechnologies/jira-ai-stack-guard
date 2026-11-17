// AI Stack Guard for Jira: Forge functions (Rovo actions and MCP tools, daily check, issue panel).
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import Resolver from '@forge/resolver';
import {
  FEED_URL,
  fileKind,
  codeBlockKind,
  adfCodeBlocks,
  scanSources,
  checkComponent as checkOne,
  compactReport,
  advisoryKeys,
  newSince,
  findingsCommentAdf,
  upgradeIssueFields,
} from './core';
import { safeFileName, sanitizeFindings } from './sanitize';

const INVENTORY_LABEL = 'ai-stack';
const TASK_LABEL = 'ai-stack-guard';
const FEED_CACHE_KEY = 'feed-v1';
const FEED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = 2000000;
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]+$/;

/** Forge storage keys allow letters, digits and : . _ - # and spaces only. */
function storeKey(...parts) {
  return parts.join('-').replace(/[^a-zA-Z0-9:._#-]/g, '_').slice(0, 400);
}

// ---------- data ----------

async function loadFeed() {
  const cached = await kvs.get(FEED_CACHE_KEY);
  if (cached && cached.data && Date.now() - cached.fetchedAt < FEED_MAX_AGE_MS) return cached.data;
  try {
    const res = await api.fetch(FEED_URL);
    if (res.ok) {
      const data = await res.json();
      if (data && data.products) {
        await kvs.set(FEED_CACHE_KEY, { fetchedAt: Date.now(), data });
        return data;
      }
    }
    console.warn(`Advisory feed fetch returned HTTP ${res.status}`);
  } catch (e) {
    console.warn(`Advisory feed fetch failed: ${e}`);
  }
  if (cached && cached.data) return cached.data;
  throw new Error('Could not load the curated advisory feed. Try again later.');
}

function requester(as) {
  return as === 'user' ? api.asUser() : api.asApp();
}

async function jiraJson(as, r, init) {
  const res = await requester(as).requestJira(r, {
    ...(init || {}),
    headers: { Accept: 'application/json', ...(init && init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira returned HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Text sources on an issue: relevant attachments plus code blocks in the description. */
async function issueSources(issueKey, as) {
  const issue = await jiraJson(as, route`/rest/api/3/issue/${issueKey}?fields=summary,description,attachment,project`);
  const sources = [];
  for (const att of issue.fields.attachment || []) {
    const kind = fileKind(att.filename);
    if (!kind || att.size > MAX_ATTACHMENT_BYTES) continue;
    // redirect=false: Jira Cloud otherwise answers 303 to the media host (api.media.atlassian.com),
    // which is outside this app's egress list. With it, the bytes come straight from the Jira API.
    const res = await requester(as).requestJira(route`/rest/api/3/attachment/content/${att.id}?redirect=false`);
    if (!res.ok) {
      console.warn(`Attachment ${att.id} on ${issueKey}: HTTP ${res.status}`);
      continue;
    }
    // Attachment names are chosen by whoever filed the issue: keep them to a short, plain token.
    sources.push({ file: `attachment ${safeFileName(att.filename)}`, kind, text: await res.text() });
  }
  adfCodeBlocks(issue.fields.description).forEach((block, i) => {
    const kind = codeBlockKind(block.language, block.text);
    if (kind) sources.push({ file: `description code block ${i + 1}`, kind, text: block.text });
  });
  return { issue, sources };
}

async function scanIssueFindings(issueKey, as) {
  const data = await loadFeed();
  const { issue, sources } = await issueSources(issueKey, as);
  // Results go to Rovo and outside MCP clients: strip prose from every value copied out of the issue.
  return { data, issue, sources, findings: sanitizeFindings(scanSources(data, sources)) };
}

async function searchIssueKeys(jql, as, max) {
  const body = JSON.stringify({ jql, fields: ['summary'], maxResults: max || 50 });
  const page = await jiraJson(as, route`/rest/api/3/search/jql`, { method: 'POST', body });
  return (page.issues || []).map((i) => i.key);
}

async function addComment(issueKey, adf, as) {
  await jiraJson(as, route`/rest/api/3/issue/${issueKey}/comment`, { method: 'POST', body: JSON.stringify({ body: adf }) });
}

async function taskIssueTypeId(projectKey, as) {
  const meta = await jiraJson(as, route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = (meta.issueTypes || meta.values || []).filter((x) => !x.subtask);
  const pick = ['Task', 'Bug', 'Story'].map((n) => types.find((x) => x.name === n)).find(Boolean) || types[0];
  if (!pick) throw new Error(`No issue type available to create tasks in ${projectKey}.`);
  return pick.id;
}

/** Create one upgrade task per affected component that has none yet; returns the task keys. */
async function fileUpgradeTasks(data, issue, findings, as) {
  const projectKey = issue.fields.project.key;
  const created = [];
  let typeId = null;
  for (const f of findings.filter((x) => x.status === 'affected')) {
    const memo = storeKey('task', issue.key, f.product, f.version);
    const existing = await kvs.get(memo);
    if (existing) {
      created.push({ key: existing, component: `${f.name} ${f.version}`, new: false });
      continue;
    }
    if (!typeId) typeId = await taskIssueTypeId(projectKey, as);
    const { summary, description } = upgradeIssueFields(data, f, issue.key);
    const fields = { project: { key: projectKey }, issuetype: { id: typeId }, summary, description, labels: [TASK_LABEL] };
    let task;
    try {
      task = await jiraJson(as, route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields }) });
    } catch (e) {
      // Some project screens have no Labels field; retry without it.
      delete fields.labels;
      task = await jiraJson(as, route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields }) });
    }
    await kvs.set(memo, task.key);
    try {
      await jiraJson(as, route`/rest/api/3/issueLink`, {
        method: 'POST',
        body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: issue.key }, outwardIssue: { key: task.key } }),
      });
    } catch (e) {
      console.warn(`Could not link ${task.key} to ${issue.key}: ${e}`);
    }
    created.push({ key: task.key, component: `${f.name} ${f.version}`, new: true });
  }
  return created;
}

function contextIssueKey(payload) {
  const ctx = payload && payload.context && payload.context.jira;
  const key = String((payload && payload.issueKey) || (ctx && ctx.issueKey) || '').trim().toUpperCase();
  return ISSUE_KEY_RE.test(key) ? key : null;
}

function contextProjectKey(payload) {
  const ctx = payload && payload.context && payload.context.jira;
  const key = String((payload && payload.projectKey) || (ctx && ctx.projectKey) || '').trim().toUpperCase();
  return PROJECT_KEY_RE.test(key) ? key : null;
}

const NO_ISSUE = {
  error: 'No issue key. Open a Jira issue that describes an AI stack, or give an issue key such as OPS-12.',
};

// ---------- Rovo actions and MCP tools ----------

/** GET: scan one issue's attachments and description code blocks. */
export async function scanIssue(payload) {
  const issueKey = contextIssueKey(payload);
  if (!issueKey) return NO_ISSUE;
  const { data, sources, findings } = await scanIssueFindings(issueKey, 'user');
  if (!sources.length) {
    return {
      issueKey,
      checked: 0,
      message: 'No compose file, Dockerfile, requirements file, package.json or CycloneDX SBOM was found on this issue (as an attachment or a code block in the description).',
    };
  }
  return compactReport(data, findings, { issueKey, sourcesRead: sources.map((s) => s.file) });
}

/** GET: check one component and version by hand. */
export async function checkComponent(payload) {
  const data = await loadFeed();
  const product = payload && payload.product;
  if (!product) return { error: 'Give a product name, for example Ollama, Open WebUI, vLLM or LiteLLM.' };
  const f = checkOne(data, product, payload.version, payload.platform);
  if (f.status === 'unknown-product') return f;
  return compactReport(data, [f], { query: { product, version: payload.version || null, platform: payload.platform || null } });
}

/**
 * GET: every issue labelled ai-stack in a project, summarised. Issue titles are left out on
 * purpose: they are free text from whoever filed the issue, and the issue key is enough to link.
 */
export async function scanProject(payload) {
  const projectKey = contextProjectKey(payload);
  if (!projectKey) return { error: 'No project key. Give one, for example OPS.' };
  const keys = await searchIssueKeys(`project = "${projectKey}" AND labels = "${INVENTORY_LABEL}" ORDER BY updated DESC`, 'user', 25);
  if (!keys.length) {
    return { projectKey, message: `No issues in ${projectKey} have the label "${INVENTORY_LABEL}". Add it to the issues that describe your AI deployments.` };
  }
  const issues = [];
  let data = null;
  for (const key of keys) {
    const r = await scanIssueFindings(key, 'user');
    data = r.data;
    const affected = r.findings.filter((f) => f.status === 'affected');
    issues.push({
      issueKey: key,
      checked: r.findings.length,
      affected: affected.map((f) => ({ component: f.name, version: f.version, advisories: f.advisories.length, updateTo: f.upgradeTo, worst: f.advisories[0] && f.advisories[0].severity })),
      unpinned: r.findings.filter((f) => f.status === 'unpinned').map((f) => f.name),
    });
  }
  return { projectKey, curatedDataAsOf: data && data.checked, issues };
}

/** CREATE: comment the findings on the issue and open one upgrade task per affected component. */
export async function fileFindings(payload) {
  const issueKey = contextIssueKey(payload);
  if (!issueKey) return NO_ISSUE;
  const { data, issue, findings } = await scanIssueFindings(issueKey, 'user');
  if (!findings.length) return { issueKey, message: 'No pinned self-hosted AI components found on this issue, so nothing was filed.' };
  await addComment(issueKey, findingsCommentAdf(data, findings, 'AI Stack Guard: advisory check'), 'user');
  const tasks = await fileUpgradeTasks(data, issue, findings, 'user');
  await kvs.set(storeKey('seen', issueKey), advisoryKeys(findings));
  return { issueKey, commented: true, tasks };
}

// ---------- daily check ----------

/** Re-check every issue labelled ai-stack; comment and open tasks only for advisories not seen before. */
export async function dailyCheck() {
  const keys = await searchIssueKeys(`labels = "${INVENTORY_LABEL}" ORDER BY updated DESC`, 'app', 50);
  let reported = 0;
  for (const key of keys) {
    try {
      const { data, issue, findings } = await scanIssueFindings(key, 'app');
      const seen = (await kvs.get(storeKey('seen', key))) || [];
      const fresh = newSince(findings, seen);
      if (fresh.length) {
        await addComment(key, findingsCommentAdf(data, fresh, 'AI Stack Guard: new advisories since the last check'), 'app');
        await fileUpgradeTasks(data, issue, fresh, 'app');
        reported += 1;
      }
      await kvs.set(storeKey('seen', key), advisoryKeys(findings));
    } catch (e) {
      console.error(`Daily check of ${key} failed: ${e}`);
    }
  }
  console.log(`AI Stack Guard daily check: ${keys.length} issue(s) checked, ${reported} with new advisories.`);
  return { statusCode: 200 };
}

// ---------- issue panel ----------

const resolver = new Resolver();

resolver.define('scanThisIssue', async ({ context }) => {
  const issueKey = context && context.extension && context.extension.issue && context.extension.issue.key;
  if (!issueKey) return NO_ISSUE;
  const { data, sources, findings } = await scanIssueFindings(issueKey, 'user');
  return compactReport(data, findings, { issueKey, sourcesRead: sources.map((s) => s.file) });
});

resolver.define('fileThisIssue', async ({ context }) => {
  const issueKey = context && context.extension && context.extension.issue && context.extension.issue.key;
  return fileFindings({ issueKey });
});

export const panelResolver = resolver.getDefinitions();
