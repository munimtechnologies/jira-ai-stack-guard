'use strict';
// AI Stack Guard for Jira: keeps text written by Jira users out of agent-facing results.
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
//
// Anyone who can file a Jira ticket controls attachment names, compose files, requirements lines,
// package.json specs and SBOM purls. The scan results go to Rovo and to outside MCP clients, so
// every value copied from that content is reduced to a short token with no spaces before it is
// returned. A component name, a version and a location are all an agent needs; prose is not.
// No Forge imports, so it runs under plain Node for the tests.

// Characters that real image refs, versions, version specs, purls and file names use.
const TOKEN_DROP_RE = /[^A-Za-z0-9._:/@+~^<>=!,%?&*[\]{}$-]/g;
const NAME_DROP_RE = /[^A-Za-z0-9._-]/g;

function cut(s, max) {
  return s.length > max ? s.slice(0, max) : s;
}

/** 'vllm[audio] == 0.31.0  # pin' -> 'vllm[audio]==0.31.0'; prose loses its spaces and length. */
function safeToken(value, max) {
  if (value == null) return value;
  const s = String(value).split('#')[0].replace(TOKEN_DROP_RE, '');
  return cut(s, max || 120);
}

/** A file name from Jira: letters, digits, dot, underscore and dash only; other runs become '_'. */
function safeFileName(value, max) {
  const s = String(value == null ? '' : value).split(/[\\/]/).pop().replace(NAME_DROP_RE, '_').replace(/_+/g, '_');
  return cut(s, max || 80) || 'file';
}

/** Location labels this app builds itself ('attachment x.yaml', 'description code block 2'). */
function safeLabel(value, max) {
  const s = String(value == null ? '' : value).replace(/[^A-Za-z0-9 ._:-]/g, '_').replace(/\s+/g, ' ');
  return cut(s, max || 100);
}

/** Findings with every user-controlled string reduced. Matching has already happened. */
function sanitizeFindings(findings) {
  return (findings || []).map((f) => ({
    ...f,
    file: safeLabel(f.file),
    ref: safeToken(f.ref, 120),
    version: f.version == null ? null : safeToken(f.version, 40),
  }));
}

module.exports = {
  safeToken,
  safeFileName,
  safeLabel,
  sanitizeFindings,
};
