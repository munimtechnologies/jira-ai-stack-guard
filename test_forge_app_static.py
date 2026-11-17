"""Static checks for the Forge app (python -m unittest), plus the Node tests when node is installed.

Apache-2.0. Made by MV2 of Munim, Inc. with AI agents. Standard library only.
"""
import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = (ROOT / "manifest.yml").read_text(encoding="utf-8")
INDEX = (ROOT / "src" / "index.js").read_text(encoding="utf-8")
CORE = (ROOT / "src" / "core.js").read_text(encoding="utf-8")


def block_list(name):
    """Items of a YAML list such as '      actions:' -> ['a', 'b'] (first occurrence)."""
    m = re.search(r"^(\s*)" + re.escape(name) + r":\s*\n((?:\1  - .*\n)+)", MANIFEST, re.M)
    return [x.strip()[2:].strip() for x in m.group(2).splitlines()] if m else []


class ManifestTest(unittest.TestCase):
    def test_handlers_exported(self):
        handlers = re.findall(r"^\s*- key: (\S+)\s*\n\s*handler: index\.(\w+)\s*$", MANIFEST, re.M)
        self.assertEqual(len(handlers), 6)
        for _, name in handlers:
            self.assertRegex(INDEX, r"export (async function|const) " + name + r"\b", name)

    def test_function_references_resolve(self):
        keys = {k for k, _ in re.findall(r"^\s*- key: (\S+)\s*\n\s*handler: index\.(\w+)", MANIFEST, re.M)}
        refs = re.findall(r"^\s*function: (\S+)\s*$", MANIFEST, re.M)
        self.assertGreaterEqual(len(refs), 6)
        for ref in refs:
            self.assertIn(ref, keys)

    def test_agent_actions_and_mcp_tools_exist(self):
        actions = set(re.findall(r"^    - key: (\S+)\s*\n\s*name: .*\n\s*function: \S+\s*\n\s*actionVerb: (?:GET|CREATE|UPDATE|DELETE|TRIGGER)", MANIFEST, re.M))
        self.assertEqual(actions, {"scan-issue", "check-component", "scan-project", "file-findings"})
        self.assertEqual(set(block_list("actions")), actions)
        tools = block_list("tools")
        self.assertTrue(tools)
        self.assertTrue(set(tools) <= actions)
        self.assertNotIn("file-findings", tools)  # write action stays inside Rovo, not external MCP clients

    def test_action_inputs_have_types(self):
        for typ in re.findall(r"^\s*type: (\S+)\s*$", MANIFEST, re.M):
            self.assertIn(typ, {"string", "integer", "number", "boolean"})

    def test_agent_name_length_and_resources(self):
        name = re.search(r"rovo:agent:\s*\n\s*- key: \S+\s*\n\s*name: (.+)", MANIFEST).group(1).strip()
        self.assertLessEqual(len(name), 30)
        for path in re.findall(r"^\s*path: (\S+)\s*$", MANIFEST, re.M):
            self.assertTrue((ROOT / path).is_file(), path)

    def test_scopes_and_egress(self):
        for scope in ("read:jira-work", "write:jira-work", "storage:app"):
            self.assertIn("- " + scope, MANIFEST)
        self.assertIn("https://raw.githubusercontent.com", MANIFEST)
        self.assertIn("raw.githubusercontent.com/munimtechnologies/ai-stack-advisories/main/advisories.json", CORE)

    def test_core_has_no_forge_imports(self):
        self.assertNotIn("@forge", CORE)
        imported = set(re.findall(r"^\s+(\w+)(?: as \w+)?,\s*$", INDEX.split("} from './core'")[0], re.M))
        exported = set(re.findall(r"^  (\w+),\s*$", CORE.split("module.exports = {")[1], re.M))
        self.assertTrue(imported, "index.js imports from core")
        self.assertTrue(imported <= exported, imported - exported)


class LicenceAndWordingTest(unittest.TestCase):
    def test_apache_everywhere(self):
        self.assertTrue((ROOT / "LICENSE").read_text(encoding="utf-8").lstrip().startswith("Apache License"))
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertEqual(pkg["license"], "Apache-2.0")
        self.assertIn("Apache-2.0", (ROOT / "README.md").read_text(encoding="utf-8"))

    def test_no_an_ai_wording(self):
        for path in ROOT.rglob("*"):
            if path.is_file() and path.suffix in {".md", ".js", ".jsx", ".json", ".yml", ".yaml", ".txt"} and "node_modules" not in path.parts:
                text = path.read_text(encoding="utf-8", errors="replace")
                self.assertIsNone(re.search(r"\b(is|as) an AI\b", text), path)


@unittest.skipUnless(shutil.which("node"), "node is not installed")
class NodeTests(unittest.TestCase):
    def test_node_unit_tests_pass(self):
        r = subprocess.run(["node", "--test", "test/core.test.js"], cwd=ROOT, capture_output=True, text=True, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout[-4000:] + r.stderr[-2000:])


if __name__ == "__main__":
    unittest.main()
