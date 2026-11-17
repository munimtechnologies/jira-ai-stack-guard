// AI Stack Guard for Jira: issue panel (UI Kit).
// Copyright 2026 Munim, Inc. Licensed under the Apache License, Version 2.0 (Apache-2.0).
// Made by MV2 of Munim, Inc. with AI agents.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Strong, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const LOZENGE = { affected: 'removed', ok: 'success', unpinned: 'moved' };

function Finding({ f }) {
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance={LOZENGE[f.status] || 'default'}>{f.status}</Lozenge>
        <Text>
          <Strong>{f.component} {f.version || ''}</Strong> ({f.where})
        </Text>
      </Inline>
      <Text>{f.summary}</Text>
      {f.advisories.map((a) => (
        <Text key={a.id}>
          <Link href={a.url} openNewTab>{a.id}</Link> {String(a.severity || 'unrated').toLowerCase()}
          {a.fixedIn ? `, fixed in ${a.fixedIn}` : ', no fixed release'}
          {a.onlyIfFeatureUsed ? ', only if that feature is used' : ''}
          {a.notInPublicDatabases ? ', not in OSV when checked' : ''}: {a.summary}
        </Text>
      ))}
      {f.moreAdvisories ? <Text>…and {f.moreAdvisories} more.</Text> : null}
    </Stack>
  );
}

function App() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [filed, setFiled] = useState(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await invoke('scanThisIssue'));
    } catch (e) {
      setError(String((e && e.message) || e));
    }
    setBusy(false);
  };

  const file = async () => {
    setBusy(true);
    setError(null);
    try {
      setFiled(await invoke('fileThisIssue'));
    } catch (e) {
      setError(String((e && e.message) || e));
    }
    setBusy(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (busy && !report) return <Spinner label="Checking this issue's AI stack" />;
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!report) return null;
  if (report.error) return <SectionMessage appearance="information"><Text>{report.error}</Text></SectionMessage>;
  if (!report.findings || !report.findings.length) {
    return (
      <SectionMessage appearance="information">
        <Text>
          No self-hosted AI components were found. Attach a compose file, Dockerfile, requirements file, package.json or
          CycloneDX SBOM, or paste one into a code block in the description, then reload.
        </Text>
      </SectionMessage>
    );
  }
  return (
    <Stack space="space.200">
      <SectionMessage appearance={report.affected ? 'warning' : 'success'}>
        <Text>
          {report.checked} component(s) checked: {report.affected} affected, {report.unpinned} without an exact version.
          Curated advisories as of {report.curatedDataAsOf || '?'}.
        </Text>
      </SectionMessage>
      {report.findings.map((f) => <Finding key={`${f.where}-${f.component}`} f={f} />)}
      {report.affected ? (
        <Button appearance="primary" isDisabled={busy || !!filed} onClick={file}>
          Comment and open upgrade tasks
        </Button>
      ) : null}
      {filed && filed.tasks ? (
        <Text>Upgrade tasks: {filed.tasks.map((x) => x.key).join(', ') || 'none'}.</Text>
      ) : null}
      <Text>
        Data: <Link href="https://github.com/munimtechnologies/ai-stack-advisories" openNewTab>ai-stack-advisories</Link>, kept
        by MV2 of Munim, Inc. with AI agents. Only version pins on this issue are read.
      </Text>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
