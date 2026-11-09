# Laminar optimization loop

The discipline layer for **iteratively improving an agent against an eval score** — tuning prompts, fixing the agent's pipeline, chasing a metric across many runs. It sits on top of [debugging.md](debugging.md) (session + notes + replay) and [eval-loop.md](eval-loop.md) (dataset + eval + diff machinery): read both first; this file assumes their mechanics and adds two rules that keep a multi-iteration optimization honest. Use it whenever the task is "make this score better" rather than "fix this one bug" — the failure modes below cost real money in wasted eval runs and, worse, produce fixes that don't generalize.

## 1. Spot-check on the exact failing rows before every full run

Never go straight from an edit to a full eval. Every candidate fix targets specific rows — verify it on exactly those first, at a few percent of a full run's cost:

1. Build (or reuse) a **single-row runner**: fetch dataset rows by index, POST each through the same path the eval's executor uses, print fired/not-fired vs target plus the finding head. If the harness lacks one, write it once — it pays for itself within two iterations.
2. Run the **target rows** the fix is aimed at.
3. Run **guard rows** of the opposite polarity: 2–3 previously-correct rows that must keep firing and 2–3 that must stay silent. Guards are what catch overcorrection — a fix that silences false positives loves to also silence true positives, and spot-checking only the target rows hides that until the full run.
4. **Re-run flaky rows 3× before believing a flip.** At production temperature, borderline rows flip between runs; one miss on a previously-passing row is a coin flip, not a regression, until it reproduces.
5. Commit to the full run only when targets AND guards are clean. Journal the spot-check result in the session note before launching.

Failure mode when skipped: full-run cost on every guess, and overcorrections discovered one expensive run late.

## 2. Fix evidence, not conclusions — and prefer general fixes over case-specific ones

When the child systematically misreads an artifact of its input (instrumentation quirks, rendering ambiguity, format noise), there are two shapes of fix:

- **Curate the record**: pre-process the input to delete/rewrite the confusing part so the model can't see it.
- **Surface and teach**: keep the input faithful, expose the one hidden fact the model needs (an attribute, a link, a marker), and add guidance for how to *read* that class of artifact.

Prefer surface-and-teach. Curation heuristics are overfit by construction — they fix the instances that match the pattern and nothing else, they silently edit what the judge sees, and they break when the pattern shifts. Teaching the reading generalizes to instances you haven't seen; in practice it scores better too, because the same misreading family shows up in places the heuristic never matched.

Smell test for overfit: if the fix names a specific string, prefix, or span name — ask what the *family* of the problem is, and fix that instead. State the general rule, give one concrete instance as an example.
