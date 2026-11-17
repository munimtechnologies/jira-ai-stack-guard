---
name: ai-stack-guard
description: Check self-hosted AI apps (Ollama, Open WebUI, vLLM, LiteLLM, n8n, Dify, Langflow, Flowise, RAGFlow, AnythingLLM, ComfyUI, MCP Inspector) for known security advisories, including advisories with no CVE ID that ordinary dependency scanners miss. Use when a user asks whether their AI stack, a compose file, Dockerfile, requirements file, package.json or CycloneDX SBOM is affected, asks "is <product> <version> safe?", or wants the AI deployments tracked in Jira checked.
license: Apache-2.0
---

# AI Stack Guard

This skill tells a coding agent how to check the self-hosted AI apps a team runs against
[ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories). That is a curated,
openly licensed advisory feed kept by MV2 of Munim, Inc. with AI agents. For each advisory it records
the affected version range, whether the advisory only matters when an optional feature is switched on,
and whether the advisory was missing from public databases such as OSV when it was checked.

There are two routes. Use the Jira route when the user keeps their deployments in Jira and has the
AI Stack Guard Forge app connected. Otherwise use the local route.

## Route 1: Jira, through the Atlassian MCP server

The [AI Stack Guard for Jira](https://github.com/munimtechnologies/jira-ai-stack-guard) Forge app
exposes three read-only tools through Forge's `rovo:mcp` module:

| Tool | Inputs | What it returns |
|---|---|---|
| `scan-issue` | `issueKey` (for example `OPS-12`) | Every AI component found in the issue's attached or pasted compose files, Dockerfiles, requirements files, package.json files and CycloneDX SBOMs, with the advisories that affect each and the version to update to. |
| `check-component` | `product` (required), `version`, `platform` (`linux`, `docker` or `windows`) | The advisories that affect one product and version. |
| `scan-project` | `projectKey` (for example `OPS`) | A summary of every issue labelled `ai-stack` in the project (up to 25). |

Setup, done once by the user:
1. A site admin installs the app and turns on its tools for outside AI clients under
   Atlassian Administration > Apps > Sites > *site* > Connected apps.
2. The user adds the app's endpoint to their MCP client as a remote server:
   `https://mcp.atlassian.com/forge/<appId>`. The app ID is given in the app's README.
3. The first call opens Atlassian's consent screen. Tool calls run with that user's own Jira
   permissions.

The write action (comment on the issue and open upgrade tasks) is not exposed to outside clients.
Point the user to the issue panel or the Rovo agent inside Jira for that.

## Route 2: local files, no Jira needed

`scan_stack.py` uses only the Python 3 standard library and makes no network requests. It reads
compose files, Dockerfiles, requirements files, package.json files and CycloneDX SBOMs.

```
git clone --depth 1 https://github.com/munimtechnologies/ai-stack-advisories
python3 ai-stack-advisories/scan_stack.py path/to/stack --json --fail-on never
```

Without `--json` it prints a text report and exits with code 1 if anything is affected, which suits
CI. In GitHub Actions the same scan is available as
`uses: munimtechnologies/ai-stack-advisories@v1.2.6` with inputs `path` and `fail-on`.

To answer a single "is X version Y affected?" question without cloning, read
`https://raw.githubusercontent.com/munimtechnologies/ai-stack-advisories/main/advisories.json`.
`products.<key>.items` lists the advisories. An item affects version V when all of these hold:
- if `only` is set, V equals one of the listed versions (and nothing else is checked);
- otherwise V >= `introduced` (when set), V < `fixed` (when set) and V <= `lastAffected` (when set).
Items with `kind: "windows"` matter only on Windows hosts. Items with `kind: "feature"` matter only
when that optional feature is used. `inPublicDatabases: false` means the advisory was not in OSV
when checked. The top-level `checked` field is the date of the last full sweep.

## How to answer

- Lead with the decision: which components are affected and the version to update to.
- Order advisories by severity (critical, high, moderate, low) and give each ID with its link.
- Say when an advisory only applies if an optional feature is used, when it has no fixed release
  yet (then point to the advisory's mitigations), and when a version range such as `^1.100.0`
  was checked at its lowest allowed version.
- Say when an advisory was not in public databases: the user's usual scanner may not show it.
- If a component has no exact version (for example the `latest` tag), say it cannot be checked
  and recommend pinning one.
- Never call a component safe beyond "no known advisories in the curated list as of <checked
  date>". Never invent advisories, versions or fixes; use only what the tools or the feed return.
- The feed covers the AI apps listed above, not every dependency. Recommend keeping a general
  dependency scanner as well.

## About

Made by MV2 of Munim, Inc. (mv2@munimtech.com) with AI agents. Apache-2.0. The advisory data
links every entry to its source: the project's GitHub security advisory, NVD or a CERT note.
