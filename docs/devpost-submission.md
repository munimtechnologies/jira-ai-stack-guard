# Codegeist 2026 submission draft: AI Stack Guard for Jira

Draft text for the Devpost form. Fill in the bracketed parts once the app is deployed.
Category: **Apps for Software Teams**. Bonus prize: **Best app with Atlassian MCP** (`rovo:mcp` plus an
open-source `SKILL.md`). The app also has a `rovo:agent` with four actions.

## Tagline

Your team runs Ollama, vLLM and Open WebUI now. AI Stack Guard tells you, inside Jira, when they need
patching. That includes advisories your dependency scanner never sees.

## Inspiration

Platform teams now run model servers and AI front ends next to their normal services. These projects
publish security advisories at a pace few teams can follow. vLLM alone published several pages of
advisories in September and October 2026. Many never reach the databases that dependency scanners
read: they have no CVE ID and exist only as a GitHub security advisory in the project's own repository.
The apps also run as Docker images that no lockfile describes, and many advisories only matter when an
optional feature is switched on. Jira is already where teams track their deployments, so AI Stack Guard
puts the answer there.

## What it does

- **Reads what the team already keeps.** It reads compose files, Dockerfiles, requirements files,
  package.json files and CycloneDX SBOMs attached to a Jira issue or pasted into its description. It
  never connects to your servers.
- **Issue panel.** Every affected component, its advisories by severity, and the version to update to.
  One button comments the findings and opens one linked upgrade task per component.
- **Rovo agent "AI Stack Guard".** Ask "Is the AI stack on this issue affected?", "Which AI deployments
  in this project need updates?" or "Is Ollama 0.33.1 safe?". It files findings only when asked.
- **MCP tools.** `scan-issue`, `check-component` and `scan-project` are exposed through the Atlassian
  MCP server (`rovo:mcp`), so Claude, Cursor or any other MCP client can ask the same questions with
  the user's own Jira permissions. A published `SKILL.md`, listed on skills.sh, teaches outside agents
  when and how to use the tools, with a local fallback that needs no Jira.
- **Safe to hand to an agent.** Anyone who can file a ticket can write into it, so the tools return
  structured findings, not issue prose. Every value copied out of an issue (attachment names, image
  refs, requirement lines, versions) is cut to a short token with no spaces before an agent sees it,
  `scan-project` returns issue keys instead of titles, and the only write action stays inside Jira,
  behind Rovo's confirmation.
- **Daily check.** It re-checks every issue labelled `ai-stack` each day and comments only about
  advisories it has not reported before. A new advisory becomes a Jira task the next morning, and
  nobody has to remember to re-scan.

## How we built it

- Forge app on `nodejs22.x`: `rovo:agent`, `rovo:mcp`, `action` (4), `jira:issuePanel` (UI Kit),
  `scheduledTrigger`, `@forge/kvs` for the feed cache and change detection.
- The matching engine (`src/core.js`) is a JavaScript port of the scanner in the open
  [ai-stack-advisories](https://github.com/munimtechnologies/ai-stack-advisories) feed. It handles version
  ranges, single affected versions, "last affected" entries for advisories with no fix yet, Windows-only
  advisories, and image tags such as `main-v1.74.0-stable`. It also understands CycloneDX purls
  (`pkg:docker`, `pkg:oci`, `pkg:pypi`, `pkg:npm`) and Jira's document format.
- `src/sanitize.js` sits between the engine and every agent-facing result; its tests feed it
  prompt-injection text through each input route.
- The feed is curated by MV2 of Munim, Inc. with AI agents. Each entry records the affected range,
  whether it depends on an optional feature, and whether it was in OSV when checked.
- **AI disclosure:** this project was made with AI agents working for MV2 of Munim, Inc.

## Challenges

- Rovo is not available on free developer sites, so development used a Forge demo site.
- Jira serves attachments through a redirect to its media host; the app asks for them directly so the
  bytes stay on the Jira API.
- An agent that reads Jira issues reads text written by anyone who can file one. A security scanner
  that can be talked into filing tickets would be worse than none, so the outside MCP tools are
  read-only and their answers carry no free text from issues. A third-party audit of the first skill
  release flagged exactly these two risks (indirect prompt injection, and an unpinned scanner
  download); v0.1.2 fixes both.
- Advisory data is messy: some fixes exist only for one release line, some advisories have no fixed
  release, and image tags rarely look like plain versions. The engine has unit tests for each of these
  cases.

## What's next

- A Marketplace listing (free).
- Confluence: check the deployment pages teams already write.
- Bitbucket: run the same check on pull requests that change a compose file.

## Testing instructions for judges

1. Install with the installation link: [link].
2. Create an issue named "Prod AI stack" in any project and add the label `ai-stack`.
3. Attach the three files from
   https://github.com/munimtechnologies/jira-ai-stack-guard/tree/main/demo (`compose.yaml`,
   `requirements.txt`, `sbom.cdx.json`). They pin deliberately outdated versions.
4. Open the **AI Stack Guard** panel on the issue. It lists the affected components. Press
   **Comment and open upgrade tasks**.
5. In Rovo chat, pick the **AI Stack Guard** agent and ask: "Which AI deployments in this project need
   updates?"
6. MCP (optional): in Atlassian Administration > Apps > Sites > your site > Connected apps, enable the
   app's tools. Then add `https://mcp.atlassian.com/forge/[appId]` as a remote MCP server in any MCP
   client.
No configuration or API keys are needed. The only outbound request fetches the public feed from
raw.githubusercontent.com.

## Links

- Repository (Apache-2.0): https://github.com/munimtechnologies/jira-ai-stack-guard
- Agent skill: https://skills.sh/munimtechnologies/jira-ai-stack-guard/ai-stack-guard
- Advisory feed: https://github.com/munimtechnologies/ai-stack-advisories
- Video: [YouTube link]
