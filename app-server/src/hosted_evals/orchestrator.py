"""Hosted eval orchestrator, run inside the Daytona sandbox `hosted_evals::start_run` creates.

Downloads the uploaded `evals/` archive and runs `harbor run` once per suite (a directory
with a `harbor.yaml` JobConfig), with trials on Daytona and results reported to Laminar by
`--plugin laminar`. Launched through `uv run --with harbor --with lmnr`, so `yaml` and the
`harbor` CLI are available.
"""

import json
import os
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

import yaml

EVALS_DIR = Path.home() / "evals"
JOB_CONFIG_NAME = ".lmnr-job.json"


def main() -> int:
    params = json.loads(os.environ["LMNR_EVAL_RUN"])
    download_archive(params["archiveUrl"], EVALS_DIR)
    suites = params["datasets"] or sorted(
        path.parent.name for path in EVALS_DIR.glob("*/harbor.yaml")
    )
    if not suites:
        print("No suites found: expected <suite>/harbor.yaml at the archive root", file=sys.stderr)
        return 1
    failed = [suite for suite in suites if run_suite(EVALS_DIR / suite, params) != 0]
    if failed:
        print(f"harbor run failed for: {', '.join(failed)}", file=sys.stderr)
    return 1 if failed else 0


def download_archive(url: str, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as response:
        with tarfile.open(fileobj=response, mode="r|gz") as archive:
            archive.extractall(dest, filter="data")


def run_suite(suite_dir: Path, params: dict) -> int:
    config_path = suite_dir / "harbor.yaml"
    if not config_path.is_file():
        print(f"Unknown dataset {suite_dir.name}: no harbor.yaml", file=sys.stderr)
        return 1
    config = build_job_config(yaml.safe_load(config_path.read_text()) or {}, params)
    job_path = suite_dir / JOB_CONFIG_NAME
    job_path.write_text(json.dumps(config))
    # Custom agents are imported relative to the suite (`agent.module:Class`).
    pythonpath = os.pathsep.join(filter(None, [str(suite_dir), os.environ.get("PYTHONPATH")]))
    command = [
        "harbor", "run", "-c", str(job_path), "--yes", "--quiet",
        "--plugin", "laminar", "--pk", f"group_name={suite_dir.name}",
    ]
    print(f"Running suite {suite_dir.name}", flush=True)
    return subprocess.run(
        command, cwd=suite_dir, env={**os.environ, "PYTHONPATH": pythonpath}
    ).returncode


def build_job_config(config: dict, params: dict) -> dict:
    # Trials always run on Daytona, with the key this sandbox was given.
    environment = {k: v for k, v in (config.get("environment") or {}).items() if k != "import_path"}
    config["environment"] = {**environment, "type": "daytona"}
    if params["nAttempts"] is not None:
        config["n_attempts"] = params["nAttempts"]
    if params["nConcurrent"] is not None:
        config["n_concurrent_trials"] = params["nConcurrent"]
    for dataset in config.get("datasets") or []:
        if params["tasks"]:
            dataset["task_names"] = params["tasks"]
    for agent in config.get("agents") or []:
        if params["model"]:
            agent["model_name"] = params["model"]
        agent["env"] = {**(agent.get("env") or {}), **params["env"]}
    return config


if __name__ == "__main__":
    sys.exit(main())
