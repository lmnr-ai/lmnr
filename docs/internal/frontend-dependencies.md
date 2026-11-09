# Frontend dependencies (`frontend/pnpm-workspace.yaml`)

## Build-script policy (`allowBuilds`)

Dependency lifecycle scripts (`preinstall` / `install` / `postinstall`) run arbitrary code on every developer machine, CI runner, and Docker build, so they are a common supply-chain attack vector. pnpm 12 blocks them by default and fails the install on any package with a build script that `allowBuilds` does not list.

- **Every `allowBuilds` entry is `false`** unless the package does not work without its script. A `true` needs a comment saying what breaks without it, and that claim must be verified: clean install (`rm -rf node_modules && pnpm install --frozen-lockfile`), then `pnpm test`, `pnpm build`, and `pnpm run dev`.
- When a new dependency (or a version bump) adds a build script, `pnpm install` fails. Read the script in the published tarball (`npm pack <pkg>@<version>` into a scratch dir), add the package as `false` with a one-line comment on what the script does, and re-run the checks above.
- Packages that ship native binaries usually don't need their script: the binary comes from a per-platform `optionalDependencies` package, which the JS wrapper resolves at runtime. The script only verifies the binary or downloads it when optional deps were skipped. Never install with `--no-optional` / `--omit=optional`.
- `@sentry/nextjs` v11 no longer pulls `@sentry/cli`: its `@sentry/bundler-plugins` use the `sentry` package (a JS bundle with no install scripts), so `@sentry/cli` has no `allowBuilds` entry.
- `pnpm ignored-builds` lists what was denied. `lmnr-private` gets this file from upstream merges; `lmnr-ts` follows the same all-`false` policy.

What the current entries' scripts do, and why `false` is safe (verified in LAM-2507 with pnpm 12, clean install, glibc and Alpine):

| Package | Script | Without it |
|---|---|---|
| `esbuild` (0.18 / 0.25 / 0.28) | `postinstall` checks `@esbuild/<platform>` and hard-links it over `bin/esbuild` | `bin/esbuild` stays a small Node shim that execs the platform binary; `tsx`, `drizzle-kit` use the JS API, which resolves the binary directly |
| `core-js` | Prints a funding banner | Nothing |
| `protobufjs` | Warns about `versionScheme` mismatches in the parent `package.json` | Nothing |
| `@google/genai` | `preinstall` is `echo 'preinstall: no-op'` | Nothing |
