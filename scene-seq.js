// Sequence diagram of a detached `lmnr-cli eval run --remote`.
const C = {
  blue: "#1971c2", green: "#2f9e44", purple: "#9c36b5", orange: "#e8590c",
  grey: "#495057", ink: "#1e1e1e",
};
const BG = {
  blue: "#e7f5ff", green: "#ebfbee", purple: "#f8f0fc", orange: "#fff4e6",
  grey: "#f8f9fa", note: "#fff9db",
};

const LANES = [
  ["cli", 130, 240, "lmnr-cli\nyour machine / CI"],
  ["orch", 450, 280, "Orchestrator sandbox\nlmnr-cli eval orchestrate\n+ Harbor + LaminarEnvironment"],
  ["app", 980, 240, "Laminar app-server\n/v1/hosted-evals/*"],
  ["s3", 1240, 140, "S3"],
  ["ecr", 1440, 180, "ECR\nour registry"],
  ["day", 1680, 220, "Daytona API\n(SandboxProvider)"],
  ["trial", 1950, 220, "Trial sandbox\none per trial"],
];
const X = Object.fromEntries(LANES.map(([id, x]) => [id, x]));
const LEFT = -40, RIGHT = 2100;
const ROW = 46, LINE = 18;

const bands = [], frames = [], items = [];
let y = 150;

const lines = (t) => t.split("\n").length;
const text = (x, y, t, size, color, extra = {}) =>
  ({ type: "text", x, y, text: t, fontSize: size, strokeColor: color, ...extra });

const msg = (from, to, label, color, { reply = false } = {}) => {
  const extra = (lines(label) - 1) * LINE;
  y += extra / 2;
  items.push({
    type: "arrow", x: X[from], y, points: [[0, 0], [X[to] - X[from], 0]],
    strokeColor: color, strokeWidth: reply ? 1.5 : 2,
    strokeStyle: reply ? "dashed" : "solid",
    label: { text: label, fontSize: 14, strokeColor: color },
  });
  y += ROW + extra / 2;
};

const note = (at, label, { width, dx = 14 } = {}) => {
  const longest = Math.max(...label.split("\n").map((l) => l.length));
  const w = width ?? longest * 7.6 + 28;
  const h = lines(label) * 20 + 18;
  items.push({
    type: "rectangle", x: X[at] + dx, y: y - 14, width: w, height: h,
    backgroundColor: BG.note, fillStyle: "solid", strokeColor: "#f08c00", strokeWidth: 1,
    label: { text: label, fontSize: 14, strokeColor: C.ink },
  });
  y += h + 10;
};

let bandStart = 0, bandColor = "grey", bandTitle = "";
const phase = (title, color) => {
  endPhase();
  y += 18;
  bandStart = y;
  bandColor = color;
  bandTitle = title;
  y += 46;
};
const endPhase = () => {
  if (!bandTitle) return;
  bands.push(
    { type: "rectangle", x: LEFT, y: bandStart, width: RIGHT - LEFT, height: y - bandStart,
      backgroundColor: BG[bandColor], fillStyle: "solid", strokeColor: "transparent", roundness: { type: 3 } },
    text(LEFT + 16, bandStart + 10, bandTitle, 20, C[bandColor]),
  );
  bandTitle = "";
};

let loopStart = 0;
const loop = () => { y += 6; loopStart = y; y += 52; };
const endLoop = (label) => {
  frames.push(
    { type: "rectangle", x: X.orch - 160, y: loopStart, width: X.trial - X.orch + 300, height: y - loopStart,
      backgroundColor: "transparent", strokeColor: C.green, strokeStyle: "dashed", strokeWidth: 1.5,
      roundness: { type: 3 } },
    text(X.orch - 148, loopStart + 8, label, 15, C.green),
  );
  y += 10;
};

// 1. Images
phase("1. Build and push images (your machine)", "blue");
note("cli", "resolve ${VAR} secrets from the env and .env\npack evals/ (max 1 GiB, never .env* or .git)");
note("cli", "local Docker: build or pull every image the\nsuites use, for linux/amd64, then docker save");
msg("cli", "app", "POST /images/layers/missing {diffIds}", C.blue);
msg("app", "cli", "{missing}", C.blue, { reply: true });
msg("cli", "app", "PUT /images/layers/{diffId}  (gzip stream, missing only)", C.blue);
msg("app", "ecr", "push blob (server-side IAM)", C.blue);
msg("cli", "app", "POST /images {config}", C.blue);
msg("app", "ecr", "put manifest", C.blue);
msg("app", "cli", "{image: sha256 digest}", C.blue, { reply: true });

// 2. Start
phase("2. Start the run", "orange");
msg("cli", "app", "POST /uploads  (archive)", C.orange);
msg("app", "s3", "stream archive", C.orange);
msg("app", "cli", "{uploadId}", C.orange, { reply: true });
msg("cli", "app", "POST /runs {uploadId, cliVersion, spec: secrets + digests}", C.orange);
note("app", "mint a short-lived run API key\n(Postgres, expires with the run TTL)");
msg("app", "day", "create orchestrator sandbox\n(env: run key, LMNR_EVAL_RUN)", C.orange);
msg("app", "day", "start command: fetch archive,\nnpx lmnr-cli eval orchestrate", C.orange);
msg("app", "cli", "202 {sandboxId}", C.orange, { reply: true });
note("cli", "exits: the machine can go offline");

// 3. Orchestrator
phase("3. Orchestrator runs Harbor in the cloud (run API key)", "green");
msg("orch", "app", "GET /uploads/{id}", C.green);
msg("app", "s3", "read archive", C.green);
msg("app", "orch", "archive", C.green, { reply: true });
note("orch", "harbor run (pinned 0.25.0) with\nLaminarEnvironment + Laminar plugin", { dx: -140 });
loop();
msg("orch", "app", "POST /images/snapshots {image, resources}", C.green);
msg("app", "day", "grant pull (ECR token) + create snapshot\n(first time per image x resources)", C.green);
msg("day", "ecr", "pull image", C.green);
msg("app", "orch", "{state: pending ... ready}  (polled)", C.green, { reply: true });
msg("orch", "app", "POST /sandboxes {image, resources}", C.green);
msg("app", "day", "create sandbox (project label, cap)", C.green);
msg("day", "trial", "start from snapshot", C.green);
msg("app", "orch", "{sandboxId}", C.green, { reply: true });
msg("orch", "app", "commands + files  (agent, then verifier)", C.green);
msg("app", "trial", "exec, upload, download  (Daytona toolbox)", C.green);
msg("app", "orch", "exit code, stdout, stderr, files", C.green, { reply: true });
msg("orch", "app", "POST /v1/evals datapoints + spans  (Laminar plugin)", C.purple);
msg("orch", "app", "DELETE /sandboxes/{trial}", C.green);
msg("app", "day", "delete trial sandbox", C.green);
endLoop("for each trial, n_concurrent at a time");

// 4. Finish
phase("4. Finish", "grey");
msg("orch", "app", "DELETE /sandboxes/$LMNR_SANDBOX_ID  (itself)", C.grey);
msg("app", "day", "delete orchestrator sandbox", C.grey);
note("app", "results: a new evaluation per suite in the Laminar UI");
endPhase();

const END = y + 20;
const lifelines = LANES.flatMap(([id, x, w, label]) => [
  { type: "line", x, y: 125, points: [[0, 0], [0, END - 125]],
    strokeColor: "#adb5bd", strokeStyle: "dashed", strokeWidth: 1 },
  { type: "rectangle", x: x - w / 2, y: 40, width: w, height: 85,
    backgroundColor: "#ffffff", fillStyle: "solid", strokeColor: C.ink, strokeWidth: 2,
    roundness: { type: 3 }, label: { text: label, fontSize: 16, strokeColor: C.ink } },
]);

export const skeleton = [
  ...bands,
  ...lifelines,
  ...frames,
  ...items,
  text(LEFT, -60, "lmnr-cli eval run --remote (detached): sequence", 30, C.ink),
  text(LEFT, -18, "solid = request, dashed = response; every sandbox call goes through the app-server, so Daytona and ECR credentials never leave it", 15, C.grey),
];
