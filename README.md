# AI Stack Guard for Jira

A Forge app for Jira that checks the self-hosted AI apps a team runs against curated security
advisories, then turns the results into Jira work.

Covered apps: Ollama, Open WebUI, vLLM, LiteLLM, n8n, Dify, Langflow, Flowise, RAGFlow,
AnythingLLM, ComfyUI and MCP Inspector.

**Status: v0.1.0, in development.** The unit tests are written but their first run is still
pending. It has not been deployed to a Jira site yet. It is MV2 of Munim, Inc.'s entry for Atlassian's Codegeist 2026, in the category
Apps for Software Teams. Made with AI agents. Licence: Apache-2.0.

## Why

Teams now run their own model servers and AI front ends next to their normal services: Ollama,
vLLM, Open WebUI, LiteLLM, n8n. These projects publish security advisories very often: vLLM's
September and October 2026 batches alone fill several pages of the feed.

Many of these advisories never reach the databases that dependency scanners read. Some have no
CVE ID at all, and they appear only as GitHub security advisories in the project's own repository.
There are two more gaps:
- These apps usually run as Docker images, and no package lockfile describes them.
- An advisory often matters only if a particular feature is switched on.

AI Stack Guard reads the version pins your team already keeps and matches them against
[ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories). That is a
curated, openly licensed feed kept by MV2 of Munim, Inc. For each advisory the feed records:
- the affected range;
- whether it only matters when an optional feature is used;
- whether it was missing from OSV when checked.

## What it does

- **Reads what you already have.** It reads files attached to a Jira issue, or pasted into a code
  block in its description:
  - `compose.yaml`
  - Dockerfiles
  - `requirements*.txt`
  - `package.json`
  - CycloneDX SBOMs, with `pkg:docker`, `pkg:oci`, `pkg:pypi` and `pkg:npm` purls
- **Issue panel.** Shows each component's status (affected, ok, or no exact version), its
  advisories ordered by severity, and the version to update to. One button posts the findings as
  a comment and opens one linked upgrade task per affected component.
- **Rovo agent "AI Stack Guard"** with four actions:
  - `scan-issue`: check the AI stack on an issue.
  - `check-component`: answer "is Ollama 0.33.1 safe?"
  - `scan-project`: review every issue labelled `ai-stack` in a project.
  - `file-findings`: comment and open upgrade tasks. It runs only when you ask.
- **MCP tools.** `scan-issue`, `check-component` and `scan-project` are exposed through Forge's
  `rovo:mcp` module, so Rovo Studio agents and outside MCP clients can use them with the calling
  user's Jira permissions. The write action is not exposed.
- **Daily check.** Once a day it re-checks every issue labelled `ai-stack`. It comments only on
  advisories it has not reported before, and opens upgrade tasks for them. Nobody has to remember
  to re-scan when a new advisory comes out.

## Privacy and data flow

- It reads only the Jira issues it is pointed at, with the permissions of the user or the app.
- It never connects to your servers. It only reads the version pins written on the issue.
- The one outbound request fetches the public advisory feed from `raw.githubusercontent.com`,
  cached for six hours. No Jira data leaves Atlassian.
- Forge storage holds the cached feed, the advisories already reported for each issue, and the
  keys of the upgrade tasks it opened.

## Try it

1. Install the app on a Jira Cloud site. The development steps are below.
2. Create an issue such as "Prod AI stack" and add the label `ai-stack`.
3. Attach the files in `demo/` to it. They are deliberately outdated pins.
4. Open the AI Stack Guard panel, or ask the Rovo agent: "Is the AI stack on this issue affected?"

## Develop

```
npm install
npm test                # unit tests for src/core.js (node --test)
npm run smoke -- out    # checks the demo files against the live feed
python -m unittest test_forge_app_static.py
```

To deploy, you need an Atlassian developer site (free) and the Forge CLI (`npm i -g @forge/cli`):

```
forge login
forge register          # replaces the placeholder app.id in manifest.yml
forge deploy
forge install --product jira --site <your-site>.atlassian.net
```

## Layout

- `src/core.js` holds the matching logic and the Jira document (ADF) builders. It has no Forge
  imports, so it runs under plain Node. It is a port of the feed's
  [`scan_stack.py`](https://github.com/munimtechnologies/ai-stack-advisories/blob/main/scan_stack.py)
  and uses the same matching rules.
- `src/index.js` holds the Forge functions: the Rovo actions and MCP tools, the daily check, and
  the panel resolver.
- `src/frontend/index.jsx` is the issue panel, written in UI Kit.
- `test/` has the Node unit tests and a small fixture feed.

## Limits

- It checks the versions written down, not what is actually running. Pin exact versions.
  `latest` is reported as "no exact version".
- The curated list covers the apps above, not every dependency. Keep using a general dependency
  scanner as well.
- "No known advisories" means none in the curated list as of its date. It is not a guarantee.
- For a version range such as `^1.100.0`, the lowest allowed version is checked.

## Credits and licence

Made by MV2 of Munim, Inc. (mv2@munimtech.com) with AI agents. Licensed under Apache-2.0; see
`LICENSE`. The advisory data is from
[ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories), whose own
sources are the projects' GitHub security advisories, NVD and CERT notes, each linked per entry.
