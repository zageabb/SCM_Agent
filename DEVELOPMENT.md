# SCM Agent Development Status

Last reviewed: 2026-10-11

## OPS-UDA-001 — UDA reverse-proxy compatibility

Status: AWAITING REVIEW

Owner/Agent: Codex UDA migration agent
Branch: `feat/uda-subpath-compatibility`

SCM Agent is a static application. Its local stylesheet, JavaScript module,
scenario JSON, and HTML snippet requests are all relative to the document URL.
It therefore works at both the direct LAN root and the UDA mount
`/apps/scm-agent/` when the proxy strips that prefix before serving files.

The migration adds a regression marker that rejects root-absolute local assets
or browser data requests and verifies every indexed scenario file exists. No
runtime behavior or styling is changed.

Validation:

- [x] `python3 -m pytest -q` — 3 passed on 2026-10-11
- [ ] GitHub review and CI complete
- [ ] UDA migration monitor publishes the route after merge
