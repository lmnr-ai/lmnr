// Skeleton for convertToExcalidrawElements. Rows: 1 images, 2 trials, 3 results, 4 detached.
const BLUE = "#1971c2", GREEN = "#2f9e44", PURPLE = "#9c36b5", ORANGE = "#e8590c", GREY = "#495057";
const FILL = { blue: "#d0ebff", green: "#d3f9d8", purple: "#f3d9fa", orange: "#ffe8cc", grey: "#f1f3f5", yellow: "#fff3bf" };

const box = (id, x, y, w, h, text, fill, stroke = GREY, extra = {}) => (boxes[id] = {
  type: "rectangle", id, x, y, width: w, height: h,
  backgroundColor: fill, fillStyle: "solid", strokeColor: stroke, strokeWidth: 2,
  roundness: { type: 3 },
  label: { text, fontSize: 16, strokeColor: "#1e1e1e" },
  ...extra,
});
const frame = (id, x, y, w, h, stroke) => ({
  type: "rectangle", id, x, y, width: w, height: h,
  backgroundColor: "transparent", strokeColor: stroke, strokeStyle: "dashed", strokeWidth: 1,
  roundness: { type: 3 },
});
const title = (x, y, text, size = 24, color = "#1e1e1e") => ({
  type: "text", x, y, text, fontSize: size, strokeColor: color,
});
// Boxes are registered as they are created so arrows can be drawn edge to edge.
const boxes = {};
const edgePoint = (b, toward, gap = 6) => {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  const t = Math.min(
    dx ? (b.width / 2 + gap) / Math.abs(dx) : Infinity,
    dy ? (b.height / 2 + gap) / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * t, y: cy + dy * t };
};
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const arrow = (from, to, text, color, extra = {}) => {
  const a = boxes[from], b = boxes[to];
  const p = edgePoint(a, center(b)), q = edgePoint(b, center(a));
  return {
    type: "arrow", x: p.x, y: p.y, points: [[0, 0], [q.x - p.x, q.y - p.y]],
    start: { id: from }, end: { id: to },
    strokeColor: color, strokeWidth: 2,
    ...(text ? { label: { text, fontSize: 14, strokeColor: color } } : {}),
    ...extra,
  };
};

export const skeleton = [
  title(0, -90, "Laminar hosted evals: lmnr-cli eval run", 32),
  title(0, -45, "Numbers follow one run; colors are the four flows", 16, GREY),

  // Columns
  frame("f_client", -20, 20, 540, 900, GREY),
  title(0, 30, "Your machine / CI", 22),
  frame("f_app", 780, 20, 540, 900, BLUE),
  title(800, 30, "Laminar app-server  /v1/hosted-evals/*", 22, BLUE),
  frame("f_daytona", 1700, 20, 260, 900, GREEN),
  title(1715, 30, "Daytona", 22, GREEN),
  title(1715, 58, "(SandboxProvider impl)", 14, GREEN),

  // Client
  box("c_cli", 0, 90, 230, 110, "lmnr-cli eval run\n(TypeScript, npm)\nreads evals/ + .env", FILL.grey),
  box("c_docker", 270, 90, 230, 110, "Local Docker\nbuild / pull for\nlinux/amd64, docker save", FILL.blue, BLUE),
  frame("f_harbor", -10, 245, 520, 335, "#f08c00"),
  title(0, 252, "one Harbor process (uvx, pinned 0.25.0)", 14, "#f08c00"),
  box("c_env", 0, 280, 500, 130, "LaminarEnvironment\n(lmnr_hosted_env.py, a Harbor environment)\none trial = one sandbox, driven over HTTP", FILL.green, GREEN),
  box("c_plugin", 0, 470, 500, 90, "Laminar Harbor plugin (lmnr Python SDK)\nreports every trial", FILL.purple, PURPLE),
  box("c_detached", 0, 650, 500, 130, "lmnr-cli --remote (detached)\npack evals/ (max 1 GiB), push images (1-3)\nthen exit: the machine can go offline", FILL.orange, ORANGE),
  title(0, 820, "Local mode: Harbor runs trials in local Docker,\nno sandbox routes involved.", 14, GREY),

  // App-server
  box("a_images", 800, 90, 500, 110, "Image routes\nlayers/missing, PUT layers/{diff_id}, POST /images\nimages.rs + registry.rs (Redis layer cache)", FILL.blue, BLUE),
  box("a_sandbox", 800, 280, 230, 130, "Sandbox routes\nsnapshots, sandboxes,\ncommands, files\nownership + cap", FILL.green, GREEN),
  box("a_provider", 1070, 280, 230, 130, "SandboxProvider\ntrait (enum_dispatch)\nDaytona today", FILL.green, GREEN),
  box("a_evals", 800, 470, 500, 90, "Evals + tracing ingestion\n/v1/evals (HTTP), spans (gRPC)", FILL.purple, PURPLE),
  box("a_detached", 800, 650, 500, 130, "Detached runs\nPOST /uploads, POST /runs\nmints a short-lived run API key", FILL.orange, ORANGE),
  box("a_s3", 800, 820, 230, 80, "S3\nrun archives", FILL.grey),
  box("a_pg", 1070, 820, 230, 80, "Postgres\nrun API keys", FILL.grey),

  // External
  box("e_ecr", 1430, 60, 220, 100, "ECR\nlmnr-hosted-evals/<project>\nserver-side IAM only", FILL.blue, BLUE),
  box("e_snap", 1720, 90, 220, 110, "Snapshots\none per image\nx resources", FILL.green, GREEN),
  box("e_trials", 1720, 280, 220, 130, "Trial sandboxes\none per trial", FILL.green, GREEN),
  box("e_ui", 1450, 470, 200, 90, "Laminar UI\nevaluations", FILL.purple, PURPLE),
  box("e_orch", 1720, 650, 220, 130, "Orchestrator sandbox\nnpx lmnr-cli eval\norchestrate\n= Harbor box, in cloud", FILL.orange, ORANGE),

  // 1-3: images
  arrow("c_cli", "c_docker", "1", BLUE),
  arrow("c_docker", "a_images", "2 missing layers only", BLUE),
  arrow("a_images", "e_ecr", "3 push", BLUE),
  arrow("e_ecr", "e_snap", "pull once", BLUE, { strokeStyle: "dashed" }),

  // 4-5: trials
  arrow("c_env", "a_sandbox", "4 project API key", GREEN),
  arrow("a_sandbox", "a_provider", "", GREEN),
  arrow("a_provider", "e_snap", "build snapshot\n(+ ECR token)", GREEN),
  arrow("a_provider", "e_trials", "5 create,\nexec, files", GREEN),

  // 6: results
  arrow("c_plugin", "a_evals", "6 datapoints + spans", PURPLE),
  arrow("a_evals", "e_ui", "", PURPLE),

  // Detached
  arrow("c_detached", "a_detached", "archive + run spec", ORANGE),
  arrow("a_detached", "a_s3", "", ORANGE),
  arrow("a_detached", "a_pg", "", ORANGE),
  arrow("a_detached", "e_orch", "start via provider", ORANGE),
  arrow("e_orch", "e_trials", "4-6 through\nthe app-server", ORANGE, { strokeStyle: "dashed" }),
];
