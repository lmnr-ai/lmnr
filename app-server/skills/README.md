# Vendored Agent Skills

Each directory here is an [Agent Skill](https://agentskills.io/specification), embedded into the
app-server binary at build time (`build.rs`) and served from `/v1/mcp` through the
[`io.modelcontextprotocol/skills`](https://modelcontextprotocol.io/extensions/skills/overview)
extension (`skills/list`, `skills/get`, `resources/read` on `skill://<name>/<path>`).

The source of truth is the public [lmnr-ai/lmnr-skills](https://github.com/lmnr-ai/lmnr-skills)
repo — the same skill `lmnr-cli setup` / `lmnr-cli skill add` installs. Don't edit these files
here; change them upstream, then run:

```bash
app-server/skills/sync.sh        # or: app-server/skills/sync.sh <ref>
```

Top-level files in this directory (this README, `sync.sh`) are not served.
