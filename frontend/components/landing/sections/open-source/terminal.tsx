"use client";

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// Combined terminal: types `git clone`, shows clone output, types
// `cd lmnr && docker compose up -d`, shows the real Docker v2 output
// (`[+] Running N/M` header + per-container spinner→✔ transitions).
// Animation is gated on `useInView` so it only starts once the panel is
// actually visible to the reader (and only fires once per page load).

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const GIT_COMMAND = "git clone https://github.com/lmnr-ai/lmnr";
// Condensed for the marketing visual — real git clone output is ~7 lines.
const GIT_LINES = ["Cloning into 'lmnr'...", "done."];

const DOCKER_COMMAND = "cd lmnr && docker compose up -d";

interface Row {
  name: string;
  verb: "Created" | "Started";
  elapsed: string;
}
// Mirrors the real `docker-compose.yml` from `cd lmnr`:
// - Project name: `lmnr` → containers prefixed `lmnr-<service>-1` unless
//   the service has a `container_name:` override (clickhouse does — its
//   container is just `clickhouse`).
// - Services: postgres, clickhouse, quickwit, app-server,
//   frontend (+ the implicit `lmnr_default` network).
// Names padded to a common width so the verb/elapsed column lines up.
const ROWS: Row[] = [
  { name: "Network lmnr_default          ", verb: "Created", elapsed: "0.2s" },
  { name: "Container lmnr-postgres-1     ", verb: "Started", elapsed: "1.4s" },
  { name: "Container clickhouse          ", verb: "Started", elapsed: "1.6s" },
  { name: "Container lmnr-quickwit-1     ", verb: "Started", elapsed: "1.7s" },
  { name: "Container lmnr-app-server-1   ", verb: "Started", elapsed: "2.3s" },
  { name: "Container lmnr-frontend-1     ", verb: "Started", elapsed: "2.6s" },
];

const PRESENT_TENSE = { Created: "Creating", Started: "Starting" } as const;

const TYPE_MS = 30;
const PAUSE_MS = 320;
const GIT_LINE_MS = 200;
const SPAWN_MS = 100;
const TICK_MS = 240;
const SPINNER_MS = 80;

type Phase = "type1" | "git" | "type2" | "compose" | "ready";

const Cursor = () => <span className="inline-block w-1.5 h-3.5 bg-foreground-300 ml-0.5 align-middle animate-pulse" />;

const Terminal = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const [phase, setPhase] = useState<Phase>("type1");
  const [typed1, setTyped1] = useState("");
  const [gitLines, setGitLines] = useState(0);
  const [typed2, setTyped2] = useState("");
  const [spawned, setSpawned] = useState(0); // visible containers (0..N)
  const [ticked, setTicked] = useState(0); // ticked-to-✔ containers (0..N)
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Phase 1: type `git clone …`
  useEffect(() => {
    if (!isInView || phase !== "type1") return;
    if (typed1.length >= GIT_COMMAND.length) {
      const t = setTimeout(() => setPhase("git"), PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped1(GIT_COMMAND.slice(0, typed1.length + 1)), TYPE_MS);
    return () => clearTimeout(t);
  }, [isInView, phase, typed1]);

  // Phase 2: stream git clone output lines
  useEffect(() => {
    if (!isInView || phase !== "git") return;
    if (gitLines >= GIT_LINES.length) {
      const t = setTimeout(() => setPhase("type2"), PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGitLines((n) => n + 1), GIT_LINE_MS);
    return () => clearTimeout(t);
  }, [isInView, phase, gitLines]);

  // Phase 3: type `cd lmnr && docker compose up -d`
  useEffect(() => {
    if (!isInView || phase !== "type2") return;
    if (typed2.length >= DOCKER_COMMAND.length) {
      const t = setTimeout(() => setPhase("compose"), PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTyped2(DOCKER_COMMAND.slice(0, typed2.length + 1)), TYPE_MS);
    return () => clearTimeout(t);
  }, [isInView, phase, typed2]);

  // Phase 4: spawn containers as spinners, then tick each to ✔
  useEffect(() => {
    if (!isInView || phase !== "compose") return;
    if (spawned < ROWS.length) {
      const t = setTimeout(() => setSpawned((n) => n + 1), SPAWN_MS);
      return () => clearTimeout(t);
    }
    if (ticked < ROWS.length) {
      const t = setTimeout(() => setTicked((n) => n + 1), TICK_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase("ready"), PAUSE_MS);
    return () => clearTimeout(t);
  }, [isInView, phase, spawned, ticked]);

  // Spinner glyph ticker — only active during compose phase.
  useEffect(() => {
    if (phase !== "compose") return;
    const t = setInterval(() => setSpinnerFrame((f) => (f + 1) % SPINNER.length), SPINNER_MS);
    return () => clearInterval(t);
  }, [phase]);

  return (
    <div ref={ref} className="font-mono text-xs leading-5 flex flex-col gap-0.5">
      <p className="text-foreground-300 whitespace-pre-wrap">
        <span className="text-primary-300">~ $</span> {typed1}
        {phase === "type1" && <Cursor />}
      </p>
      {GIT_LINES.slice(0, gitLines).map((line, i) => (
        <p key={`git-${i}`} className="text-foreground-400 whitespace-pre-wrap">
          {line}
        </p>
      ))}

      {(phase === "type2" || phase === "compose" || phase === "ready") && (
        <p className="text-foreground-300 whitespace-pre-wrap mt-1">
          <span className="text-primary-300">~/lmnr $</span> {typed2}
          {phase === "type2" && <Cursor />}
        </p>
      )}

      {(phase === "compose" || phase === "ready") && (
        <>
          <p className="text-primary-300 whitespace-pre">
            [+] Running {ticked}/{ROWS.length}
          </p>
          {ROWS.slice(0, spawned).map((r, i) => {
            const isTicked = i < ticked;
            return (
              <p key={r.name} className="text-foreground-400 whitespace-pre">
                {isTicked ? " ✔" : ` ${SPINNER[spinnerFrame]}`} {r.name}
                {isTicked ? `${r.verb}   ${r.elapsed}` : PRESENT_TENSE[r.verb]}
              </p>
            );
          })}
        </>
      )}

      {phase === "ready" && (
        <>
          <p className="text-primary-300 whitespace-pre">▶ Ready on http://localhost:5667</p>
        </>
      )}
    </div>
  );
};

export default Terminal;
