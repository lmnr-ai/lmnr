#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent

import openai


DEFAULT_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
MAX_DIFF_CHARS = 12000
MAX_CONTEXT_CHARS = 6000
MAX_PATCH_LINES = 800
DOC_CONTEXT_CANDIDATES = (
    "README.md",
    "docs/README.md",
    "docs/index.md",
    "docs/TOC.md",
    "docs/_sidebar.md",
)
DOC_FILE_EXTS = (".md", ".mdx", ".yaml", ".yml", ".json", ".toml")


def read_trimmed(path: Path, limit: int) -> tuple[str, bool]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    truncated = False
    if len(text) > limit:
        text = text[:limit]
        truncated = True
    return text, truncated


def collect_context(docs_root: Path, max_chars: int) -> tuple[list[tuple[str, str, bool]], bool]:
    contexts: list[tuple[str, str, bool]] = []
    total = 0
    truncated_any = False

    for rel in DOC_CONTEXT_CANDIDATES:
        if total >= max_chars:
            break
        candidate = docs_root / rel
        if not candidate.exists() or not candidate.is_file():
            continue
        remaining = max_chars - total
        content, truncated = read_trimmed(candidate, remaining)
        if not content.strip():
            continue
        contexts.append((rel, content, truncated))
        total += len(content)
        truncated_any = truncated_any or truncated

    return contexts, truncated_any


def collect_context_all(docs_root: Path, max_chars: int) -> tuple[list[tuple[str, str, bool]], bool]:
    contexts: list[tuple[str, str, bool]] = []
    total = 0
    truncated_any = False

    for path in sorted(docs_root.rglob("*")):
        if total >= max_chars:
            break
        if not path.is_file():
            continue
        if path.suffix.lower() not in DOC_FILE_EXTS:
            continue
        remaining = max_chars - total
        rel = str(path.relative_to(docs_root))
        content, truncated = read_trimmed(path, remaining)
        if not content.strip():
            continue
        contexts.append((rel, content, truncated))
        total += len(content)
        truncated_any = truncated_any or truncated

    return contexts, truncated_any


def build_prompt(
    diff: str,
    diff_truncated: bool,
    diff_limit: int,
    contexts: list[tuple[str, str, bool]],
    context_truncated: bool,
    context_limit: int,
) -> str:
    context_section = "\nDocs repo context snippets:\n"
    if contexts:
        for rel, content, truncated in contexts:
            marker = " (truncated)" if truncated else ""
            context_section += f"\n# {rel}{marker}\n{content}\n"
    else:
        context_section += "\n(none available)\n"

    truncation_notes = []
    if diff_truncated:
        truncation_notes.append(f"diff truncated to first {diff_limit} characters")
    if context_truncated:
        truncation_notes.append(f"docs context capped at {context_limit} characters")
    truncation_note = ""
    if truncation_notes:
        truncation_note = f" ({'; '.join(truncation_notes)})"

    prompt = dedent(
        f"""
        You are a careful technical writer helping keep the docs repo in sync with app changes.
        Using the supplied app diff and limited docs context, propose minimal documentation edits.
        Return a unified diff patch (apply -p0) with file paths relative to the docs repo root.

        Guardrails:
        - Only propose docs changes for user-visible behavior, APIs, UX, or configuration; ignore internal-only dev tooling or infra changes.
        - Keep the tone clear, concise, and focused on the user experience Laminar provides—empowering but not salesy.
        - Only touch existing documentation files (markdown/mdx/yaml/json/toml) under the docs repo root.
        - Keep scope tight: at most 6 files changed and under 200 total changed lines.
        - No speculative or architectural rewrites; edit what the diff requires.
        - Do not add binaries or large assets; keep formatting and frontmatter intact.
        - If no documentation updates are needed, respond with NO_CHANGES exactly.

        App repository diff{truncation_note}:
        {diff}
        """
    ).strip()

    prompt += "\n\n" + context_section.strip() + "\n\nReturn only the patch or NO_CHANGES."
    return prompt


def ensure_api_key() -> str:
    key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not key:
        sys.exit("Missing LLM_API_KEY or OPENAI_API_KEY.")
    return key


def paths_are_safe(patch_text: str) -> bool:
    for line in patch_text.splitlines():
        if not line.startswith(("+++", "---")):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) < 2:
            continue
        path = parts[1].strip()
        if path.startswith(("a/", "b/")):
            path = path[2:]
        if path.startswith("/") or path.startswith(".."):
            return False
    return True


def call_llm(prompt: str, model: str) -> str:
    client = openai.OpenAI(api_key=ensure_api_key())
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    return response.choices[0].message.content.strip()


def apply_patch(docs_root: Path, patch_text: str) -> None:
    patch_path = Path("/tmp/llm-docs.patch")
    patch_path.write_text(patch_text, encoding="utf-8")
    subprocess.run(["git", "apply", "--directory", str(docs_root), str(patch_path)], check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate docs patch from app diff via LLM.")
    parser.add_argument("--diff", required=True, help="Path to diff file from the app repo.")
    parser.add_argument("--docs-path", required=True, help="Path to checked out docs repository.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Model to use for generation.")
    parser.add_argument("--max-diff-chars", type=int, default=MAX_DIFF_CHARS)
    parser.add_argument("--max-context-chars", type=int, default=MAX_CONTEXT_CHARS)
    parser.add_argument(
        "--context-mode",
        choices=["samples", "all"],
        default="samples",
        help="Context selection: samples uses curated top-level docs; all walks all doc files up to the size cap.",
    )
    args = parser.parse_args()

    docs_root = Path(args.docs_path).resolve()
    if not docs_root.exists():
        sys.exit(f"Docs path not found: {docs_root}")

    diff_path = Path(args.diff)
    if not diff_path.exists():
        sys.exit(f"Diff file not found: {diff_path}")

    diff_raw = diff_path.read_text(encoding="utf-8", errors="ignore")
    if not diff_raw.strip():
        print("Diff is empty; no docs changes suggested.")
        return 0

    diff, diff_truncated = read_trimmed(diff_path, args.max_diff_chars)
    if args.context_mode == "all":
        contexts, context_truncated = collect_context_all(docs_root, args.max_context_chars)
    else:
        contexts, context_truncated = collect_context(docs_root, args.max_context_chars)
    prompt = build_prompt(
        diff, diff_truncated, args.max_diff_chars, contexts, context_truncated, args.max_context_chars
    )

    try:
        suggestion = call_llm(prompt, args.model)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"LLM call failed: {exc}")

    if suggestion.upper() == "NO_CHANGES":
        print("LLM suggested no documentation updates.")
        return 0

    patch_lines = suggestion.count("\n") + 1
    if patch_lines > MAX_PATCH_LINES:
        sys.exit(f"Generated patch too large ({patch_lines} lines); aborting apply.")

    if not paths_are_safe(suggestion):
        sys.exit("Patch contains unsafe file paths; aborting.")

    try:
        apply_patch(docs_root, suggestion)
    except subprocess.CalledProcessError as exc:
        sys.exit(f"Failed to apply patch from LLM: {exc}. Inspect /tmp/llm-docs.patch for details.")

    print("Applied docs patch from LLM suggestion.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
