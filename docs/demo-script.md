# Demo video script (target 2:45, hard limit under 5:00)

Judges may stop at 3 minutes, so the whole story fits in the first 2:45. Record on a Forge demo site
(`forge site provision`), which has Rovo. Screenshots are numbered to match the narration lines in
`demo-narration.txt` (one line per slide), so a slides-plus-voice tool can build the video. No
third-party music.

| # | Time | Screen | Narration |
|---|---|---|---|
| 01 | 0:00 | Title card: "AI Stack Guard for Jira" | See line 1 |
| 02 | 0:12 | A compose file with ollama, open-webui, vllm, litellm | See line 2 |
| 03 | 0:30 | GitHub advisory page with no CVE ID, next to an empty OSV search | See line 3 |
| 04 | 0:45 | Jira issue "Prod AI stack", label ai-stack, three demo files attached | See line 4 |
| 05 | 1:00 | Issue panel: affected components, severities, update-to versions | See line 5 |
| 06 | 1:20 | Panel after the button: comment plus linked upgrade tasks | See line 6 |
| 07 | 1:35 | Rovo chat with the AI Stack Guard agent answering "Which AI deployments need updates?" | See line 7 |
| 08 | 1:55 | Claude or another MCP client calling check-component through mcp.atlassian.com | See line 8 |
| 09 | 2:15 | Daily check comment "new advisories since the last check" | See line 9 |
| 10 | 2:30 | Closing card: repo, feed, Apache-2.0, made with AI agents | See line 10 |
