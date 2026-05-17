# pii-redactor

CPU-only gRPC service that takes a list of texts and returns the same list
with PII redacted.

It loads any HuggingFace token-classification model exported to ONNX:

- `model.onnx` — the exported model (plus any sibling `model.onnx_data*`
  external-data shards)
- `tokenizer.json` — the matching fast tokenizer
- `config.json` — must contain `id2label` in either BIO (`O`, `B-X`, `I-X`)
  or BIOES (`O`, `B-X`, `I-X`, `E-X`, `S-X`) scheme

The service has no opinions about which model — bring the OpenAI privacy
filter, a Piiranha checkpoint, an in-house model, anything that fits the
shape above.

## Layout

```
pii-redactor/
├── Cargo.toml
├── Dockerfile          # bakes ./models/ into the image
├── build.rs
├── proto/
│   └── pii_redactor.proto
├── src/
│   ├── engine.rs       # ONNX inference + BIO span -> char span
│   ├── labels.rs       # config.json parsing
│   ├── main.rs         # tonic gRPC server
│   └── proto.rs
└── models/             # (gitignored) put weights here before docker build
    ├── model.onnx
    ├── model.onnx_data  # optional: external data shard(s), if the export uses them
    ├── tokenizer.json
    └── config.json
```

## gRPC interface

```proto
service PiiRedactorService {
    rpc Redact(RedactRequest) returns (RedactResponse);
}

message RedactRequest {
    // Each entry MUST be a stringified JSON value. The service walks the
    // tree, recursively parses string leaves whose content is itself
    // stringified JSON, redacts PII from string values, and returns each
    // entry re-serialized as a JSON string with the same structure.
    repeated string texts = 1;
    optional string placeholder_format = 2;  // default "[REDACTED_{LABEL}]"
    // Object-key names whose VALUES should be skipped (structural metadata,
    // not content). Applied at every nesting level. If empty, a built-in
    // default list is used (see `DEFAULT_SKIP_KEYS` in `src/json_walker.rs`).
    repeated string skip_keys = 3;
}

message RedactResponse {
    repeated string texts = 1;
}
```

`{LABEL}` is substituted with the base label uppercased
(e.g. `PRIVATE_EMAIL`, `PRIVATE_PERSON`, `SECRET`, `ACCOUNT_NUMBER`).

### How redaction works

The OpenAI privacy filter is a token-classification NER model trained on
natural text. Feeding it raw JSON (escaped quotes, braces, separators)
destroys its accuracy, so the service pre-processes each input:

1. **Parse** the input as JSON. Reject with `INVALID_ARGUMENT` if it isn't.
2. **Walk** the tree depth-first. Recursively parse string leaves that
   themselves contain valid JSON objects/arrays (capped at 8 nesting levels).
   Drop string values whose object key matches `skip_keys`.
3. **Render** all redaction-eligible string leaves into a single
   `key: value\n\nkey: value\n\n...` document that gives the model the same
   structural cue it has seen thousands of times in training data
   (form dumps, email signatures, system outputs).
4. **Tokenise** the rendered document. If it exceeds
   `PII_MAX_TOKENS_PER_TEXT` (default 24,576), reject with `RESOURCE_EXHAUSTED`.
5. **Chunk** if the rendered document exceeds `PII_CHUNK_SIZE` (default 512).
   Sliding windows with `PII_CHUNK_OVERLAP` (default 64) tokens of overlap so
   entities straddling a boundary are still detected.
6. **Run inference** on each window, decode BIOES tags into char spans.
7. **Merge** spans across windows, then **route** each span back to its
   originating leaf via byte offsets recorded during rendering. Spans
   landing in key-prefix or separator regions are silently discarded.
8. **Re-serialise** the JSON tree (object key order preserved). Originally
   stringified JSON wrappers are re-stringified inside-out.

Object keys are never redacted. Numbers, booleans, and nulls pass through.

## Performance knobs

Set via flag or env var:

| flag                  | env                   | default | meaning |
|-----------------------|-----------------------|---------|---------|
| `--model-dir`         | `PII_MODEL_DIR`       | `/models` | dir holding the three model files |
| `--port`              | `PII_PORT`            | `8910`  | gRPC listen port |
| `--chunk-size`        | `PII_CHUNK_SIZE`      | `512`   | tokens per inference window (longer texts are sliced) |
| `--chunk-overlap`     | `PII_CHUNK_OVERLAP`   | `64`    | overlap tokens between adjacent windows; sized to cover the longest expected entity |
| `--max-tokens-per-text` | `PII_MAX_TOKENS_PER_TEXT` | `24576` | per-text hard cap; oversize inputs rejected with `RESOURCE_EXHAUSTED` |
| `--max-batch-size`    | `PII_MAX_BATCH_SIZE`  | `32`    | reserved for future cross-text window batching |
| `--max-texts-per-request` | `PII_MAX_TEXTS_PER_REQUEST` | `1024` | reject `Redact` calls with more texts than this |
| `--intra-threads`     | `PII_INTRA_THREADS`   | `0`     | ORT op-level threads (0 = ORT default) |
| `--inter-threads`     | `PII_INTER_THREADS`   | `1`     | ORT inter-op threads |
| `--num-sessions`      | `PII_NUM_SESSIONS`    | `1`     | parallel ORT sessions (one per concurrent request) |

Defaults assume one box, one model, full CPU pinned to one session — the
fastest config for short bursty traffic. For higher concurrency,
either bump `--num-sessions` (each session takes its own copy of the graph
and competes for cores), or run multiple replicas behind a load balancer.

## Build & run

### Docker (weights baked in from HuggingFace — no prep needed)

```bash
cd pii-redactor
docker build -t lmnr/pii-redactor:latest .
docker run --rm -p 8910:8910 lmnr/pii-redactor:latest
```

The `Dockerfile` pulls the int8-quantized OpenAI privacy-filter ONNX export
(~1.6 GB) plus tokenizer & config from HuggingFace at build time, pinned to
a specific commit for reproducibility. The final image embeds the weights
and `libonnxruntime.so`, so it boots without any external resources.

To bake in a different model variant (FP16 / Q4 / FP32), override the build
args. Example for the Q4 variant (~917 MB):

```bash
docker build -t lmnr/pii-redactor:latest \
  --build-arg HF_MODEL_FILE=onnx/model_q4.onnx \
  --build-arg HF_MODEL_DATA_FILES=onnx/model_q4.onnx_data \
  .
```

To bake in a different model entirely (e.g. Piiranha), override `HF_MODEL`
+ `HF_REVISION` and point `HF_MODEL_FILE` / `HF_MODEL_DATA_FILES` /
`HF_TOKENIZER_FILE` / `HF_CONFIG_FILE` at the right paths in that repo.
Set `HF_MODEL_DATA_FILES=""` for models that have no external-data shards.

To override the baked-in weights at runtime without rebuilding, bind-mount
your own model directory over `/models`:

```bash
docker run --rm -p 8910:8910 \
  -v "$(pwd)/models:/models:ro" \
  lmnr/pii-redactor:latest
```

### Cross-building for a different target arch

The Dockerfile is `TARGETARCH`-aware: it auto-downloads the matching
ONNX Runtime build (`x64` for `amd64`, `aarch64` for `arm64`). To cross-build
for AWS x86 deploy from an Apple Silicon Mac:

```bash
docker buildx build --platform linux/amd64 -t lmnr/pii-redactor:latest .
```

Same for arm64 servers (Graviton, etc.):

```bash
docker buildx build --platform linux/arm64 -t lmnr/pii-redactor:latest .
```

Both ONNX Runtime tarballs are SHA-256 verified per arch (see `ORT_SHA256_AMD64`
/ `ORT_SHA256_ARM64` in the Dockerfile).

### Local (no Docker)

For local dev you do need to populate `./models/` yourself — see the
[Preparing weights](#preparing-weights) section below.

```bash
cd pii-redactor
# put model.onnx, tokenizer.json, config.json in ./models/
cargo run --release -- --model-dir ./models
```

The `ort` crate downloads ONNX Runtime binaries automatically at build time.
For air-gapped builds set `ORT_DYLIB_PATH=/path/to/libonnxruntime.so`.

## Preparing weights

The service expects three files (plus optional ONNX external-data shards)
under `./models/`. There are two recommended sources.

### Option A — OpenAI privacy filter (BIOES, ~1.5 GB MoE)

The HuggingFace repo `openai/privacy-filter` already ships an ONNX export
under `onnx/`. Pick one of the precision variants — the smaller ones are
the right call on CPU:

| File                       | Size    | Notes                            |
|----------------------------|---------|----------------------------------|
| `onnx/model.onnx` + `model.onnx_data*` | ~5.5 GB | full FP32 weights      |
| `onnx/model_fp16.onnx`     | ~2.8 GB | half precision                   |
| `onnx/model_quantized.onnx` + `model_quantized.onnx_data` | ~1.6 GB | int8 dynamic — recommended for CPU |
| `onnx/model_q4.onnx`       | ~917 MB | int4 — smallest, slight accuracy hit |

```bash
pip install -U "huggingface_hub[cli]"
mkdir -p models
huggingface-cli download openai/privacy-filter \
  tokenizer.json config.json \
  onnx/model_quantized.onnx onnx/model_quantized.onnx_data \
  --local-dir ./hf_download

cp ./hf_download/tokenizer.json ./hf_download/config.json models/
cp ./hf_download/onnx/model_quantized.onnx        models/model.onnx
cp ./hf_download/onnx/model_quantized.onnx_data   models/model_quantized.onnx_data
```

Note: ONNX external-data files (`*.onnx_data`, `*.onnx_data_1`, …) MUST sit
next to `model.onnx` with their **original** filenames — the `.onnx` graph
references them by name, so don't rename them. The `.onnx` graph file
itself is fine to rename to `model.onnx` (which is what the engine looks
for); only the external-data shards must keep their export-time basenames.

OpenAI's privacy filter uses a **BIOES** tag scheme (8 PII categories ×
4 boundary tags + O = 33 labels). The service handles BIOES natively.

### Option B — Piiranha (BIO, ~280 MB)

```bash
pip install -U transformers "optimum[onnxruntime]" onnx onnxruntime
mkdir -p models
optimum-cli export onnx \
  --model iiiorg/piiranha-v1-detect-personal-information \
  --task token-classification \
  --opset 17 \
  models/

# Optional int8 dynamic quantisation (~3-4x CPU speedup):
python -c "
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
q = ORTQuantizer.from_pretrained('models')
q.quantize(save_dir='models', quantization_config=AutoQuantizationConfig.avx512_vnni(is_static=False))
"
mv models/model_quantized.onnx models/model.onnx  # only if you ran the quantiser
```

### After either option

`./models/` should contain at minimum:

- `model.onnx` (+ any `model.onnx_data*` shards from the export)
- `tokenizer.json`
- `config.json`

Other files (`tokenizer_config.json`, `special_tokens_map.json`, etc.) are
fine to leave; the service ignores them.

## Testing the service

Once running on `localhost:8910`. Remember: **every entry in `texts` must be
stringified JSON.** Plain strings will be rejected with `INVALID_ARGUMENT`.

### grpcurl — simple message

```bash
# install grpcurl: https://github.com/fullstorydev/grpcurl
grpcurl -plaintext \
  -import-path pii-redactor/proto \
  -proto pii_redactor.proto \
  -d '{
    "texts": [
      "{\"content\":\"Hi, my name is Jane Doe and my email is jane@example.com. Call me at +1-415-555-0123.\"}"
    ]
  }' \
  localhost:8910 pii_redactor.PiiRedactorService/Redact
```

Expected output (labels depend on the model):

```json
{
  "texts": [
    "{\"content\":\"Hi, my name is[REDACTED_PRIVATE_PERSON] and my email is[REDACTED_PRIVATE_EMAIL]. Call me at[REDACTED_PRIVATE_PHONE].\"}"
  ]
}
```

### grpcurl — nested Anthropic-style tool_result

Recursive parsing handles stringified-JSON values inside the tree. The
default `skip_keys` list suppresses structural fields like `tool_use_id`,
`type`, `role`, `cache_control`, etc.

```bash
grpcurl -plaintext \
  -import-path pii-redactor/proto \
  -proto pii_redactor.proto \
  -d '{
    "texts": [
      "{\"content\":[{\"content\":[{\"text\":\"{\\\"account_id\\\":\\\"apn_1KhW56n\\\"}\",\"type\":\"text\"}],\"tool_use_id\":\"toolu_bdrk_01K8\",\"type\":\"tool_result\"}],\"role\":\"user\"}"
    ]
  }' \
  localhost:8910 pii_redactor.PiiRedactorService/Redact
```

Expected output — `account_id` gets `[REDACTED_SECRET]` because the model
sees the `account_id:` key as PII context; structural keys are untouched:

```json
{
  "texts": [
    "{\"content\":[{\"content\":[{\"text\":\"{\\\"account_id\\\":\\\"[REDACTED_SECRET]\\\"}\",\"type\":\"text\"}],\"tool_use_id\":\"toolu_bdrk_01K8\",\"type\":\"tool_result\"}],\"role\":\"user\"}"
  ]
}
```

### Overriding `skip_keys`

Pass an explicit list to replace the defaults entirely:

```bash
grpcurl -plaintext -import-path pii-redactor/proto -proto pii_redactor.proto \
  -d '{
    "texts": ["{\"my_field\":\"sensitive\",\"other\":\"keep\"}"],
    "skip_keys": ["other"]
  }' \
  localhost:8910 pii_redactor.PiiRedactorService/Redact
```

### Python

```python
import grpc
import pii_redactor_pb2
import pii_redactor_pb2_grpc

# Generate stubs once:
#   python -m grpc_tools.protoc \
#     -I pii-redactor/proto \
#     --python_out=. --grpc_python_out=. \
#     pii-redactor/proto/pii_redactor.proto

import json

ch = grpc.insecure_channel("localhost:8910")
stub = pii_redactor_pb2_grpc.PiiRedactorServiceStub(ch)

# Each entry MUST be a stringified JSON value.
payloads = [
    {"content": "Hi, my name is Jane Doe. Call me at +1-415-555-0123."},
    {"messages": [{"role": "user", "content": "Email me at jane@example.com"}]},
]
resp = stub.Redact(pii_redactor_pb2.RedactRequest(
    texts=[json.dumps(p) for p in payloads],
))
for raw in resp.texts:
    print(json.loads(raw))  # back to dict, structurally identical
```

### Smoke test that the service comes up

```bash
docker run --rm -p 8910:8910 lmnr/pii-redactor:latest &
sleep 2
grpcurl -plaintext localhost:8910 list
```
