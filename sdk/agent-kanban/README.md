# Cursor SDK Agent Timeline

A timeline-style activity view for Cursor Cloud Agents. It uses the Cursor SDK
to list cloud agents, bucket them by recent activity, preview artifacts on
timeline cards, and create new cloud agents from a repository and prompt.

This example demonstrates:

- required API-key onboarding before any Cloud Agent data loads,
- cloud-agent listing sorted by latest activity and grouped into date buckets,
- timeline cards with status, repo/branch metadata, latest activity, PR/repo
  links, and artifact previews,
- create-agent flows backed by `Agent.create({ cloud: { repos } })`,
- authenticated artifact media previews proxied through local API routes.

## Getting Started

```bash
pnpm install
pnpm dev
```

Open the local Next.js URL and complete onboarding by entering a Cursor API key
from the [Cursor integrations dashboard](https://cursor.com/dashboard/integrations).
If you keep "Remember this key" checked, the key is stored locally at
`~/.agent-kanban/settings.json`; otherwise it is kept only in the in-memory app
session.

## Notes

Repository listing is rate-limited by the Cloud Agents API and is cached briefly
in memory. Artifact previews are fetched through authenticated local API routes,
so refresh the timeline if a preview stops loading.