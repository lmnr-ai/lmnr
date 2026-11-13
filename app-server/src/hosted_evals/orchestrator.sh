# A remote run's orchestrator (`launch_orchestrator`), run with `sh -c` by the
# provider's `start_command`: POSIX sh only, no bash-isms. The app-server puts
# `export LMNR_SANDBOX_ID=<id>` in front; the rest of the env (run key, API URL,
# upload id, run spec, npm spec) is set on the sandbox.
#
# Downloads the archive with the run key, runs lmnr-cli, ends the run's log with
# its exit code, then deletes the sandbox however the run ended. The archive
# stays: the run's evaluations show its files.

# The user reads the run's log, not the provider's command log, so all output
# goes to a file whose tail can stand in for lmnr-cli's own lines (below).
exec >/tmp/lmnr-orchestrator.log 2>&1

# The Laminar Harbor plugin records suite and task paths relative to
# LMNR_EVALS_ROOT. lmnr-cli creates LMNR_RUN_LOG_MARKER once it has sent a line
# of the run's log.
export LMNR_EVALS_ROOT="$HOME/evals" LMNR_RUN_LOG_MARKER=/tmp/lmnr-run-log-started

mkdir -p "$LMNR_EVALS_ROOT" && cd "$LMNR_EVALS_ROOT" &&
  curl -fsS -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" \
    "$LMNR_BASE_URL/v1/hosted-evals/uploads/$LMNR_EVAL_UPLOAD_ID" -o /tmp/evals.tar.gz &&
  tar -xzf /tmp/evals.tar.gz && rm /tmp/evals.tar.gz &&
  npx -y --package="$LMNR_CLI_PACKAGE" lmnr-cli eval orchestrate
code=$?

# Without the marker lmnr-cli never ran (e.g. a failed download or npm install),
# so this output's tail is the run's log.
if [ -e "$LMNR_RUN_LOG_MARKER" ]; then
  : >/tmp/lmnr-tail
else
  tail -n 200 /tmp/lmnr-orchestrator.log | cut -c 1-4096 >/tmp/lmnr-tail
fi
curl -fsS --retry 3 -X POST -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" \
  -H "Content-Type: text/plain" --data-binary @/tmp/lmnr-tail \
  "$LMNR_BASE_URL/v1/hosted-evals/runs/$LMNR_EVAL_UPLOAD_ID/logs/end?exitCode=$code"

curl -fsS -X DELETE -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" \
  "$LMNR_BASE_URL/v1/hosted-evals/sandboxes/$LMNR_SANDBOX_ID"
