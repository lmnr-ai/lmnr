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
    repeated string texts = 1;
    optional string placeholder_format = 2;  // default "[REDACTED_{LABEL}]"
}

message RedactResponse {
    repeated string texts = 1;
}
```

`{LABEL}` is substituted with the base label uppercased
(e.g. `EMAIL_ADDRESS`).

## Performance knobs

Set via flag or env var:

| flag                  | env                   | default | meaning |
|-----------------------|-----------------------|---------|---------|
| `--model-dir`         | `PII_MODEL_DIR`       | `/models` | dir holding the three model files |
| `--port`              | `PII_PORT`            | `8910`  | gRPC listen port |
| `--max-seq-len`       | `PII_MAX_SEQ_LEN`     | `512`   | longer texts are truncated |
| `--max-batch-size`    | `PII_MAX_BATCH_SIZE`  | `32`    | sub-batch size per inference |
| `--intra-threads`     | `PII_INTRA_THREADS`   | `0`     | ORT op-level threads (0 = ORT default) |
| `--inter-threads`     | `PII_INTER_THREADS`   | `1`     | ORT inter-op threads |
| `--num-sessions`      | `PII_NUM_SESSIONS`    | `1`     | parallel ORT sessions (one per concurrent request) |

Defaults assume one box, one model, full CPU pinned to one session — the
fastest config for short bursty traffic. For higher concurrency,
either bump `--num-sessions` (each session takes its own copy of the graph
and competes for cores), or run multiple replicas behind a load balancer.

## Build & run

You don't have weights yet — get them first (see below), then either
build & run locally, or via Docker.

### Local

```bash
cd pii-redactor
# put model.onnx, tokenizer.json, config.json in ./models/
cargo run --release -- --model-dir ./models
```

The `ort` crate downloads ONNX Runtime binaries automatically at build time.
For air-gapped builds set `ORT_DYLIB_PATH=/path/to/libonnxruntime.so`.

### Docker (weights baked in)

```bash
cd pii-redactor
# 1. populate ./models/ with model.onnx, tokenizer.json, config.json
# 2. build
docker build -t lmnr/pii-redactor:latest .
# 3. run
docker run --rm -p 8910:8910 lmnr/pii-redactor:latest
```

The image embeds the weights and `libonnxruntime.so`, so it boots without
any external resources.

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
cp ./hf_download/onnx/model_quantized.onnx_data   models/model.onnx_data
```

Note: ONNX external-data files (`*.onnx_data`, `*.onnx_data_1`, …) MUST sit
next to `model.onnx` with their original filenames — the `.onnx` graph
references them by name, so don't rename them. The Dockerfile's `COPY models
/models` already picks up everything in the directory.

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

Once running on `localhost:8910`:

### grpcurl

```bash
# install grpcurl: https://github.com/fullstorydev/grpcurl
grpcurl -plaintext \
  -import-path pii-redactor/proto \
  -proto pii_redactor.proto \
  -d '{
    "texts": [
      "Hi, my name is Jane Doe and my email is jane@example.com.",
      "Call me at +1-415-555-0123."
    ]
  }' \
  localhost:8910 pii_redactor.PiiRedactorService/Redact
```

Expected output (labels depend on the model):

```json
{
  "texts": [
    "Hi, my name is [REDACTED_PERSON] and my email is [REDACTED_EMAIL_ADDRESS].",
    "Call me at [REDACTED_PHONE_NUMBER]."
  ]
}
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

ch = grpc.insecure_channel("localhost:8910")
stub = pii_redactor_pb2_grpc.PiiRedactorServiceStub(ch)
resp = stub.Redact(pii_redactor_pb2.RedactRequest(texts=[
    "Hi, my name is Jane Doe and my email is jane@example.com.",
    "Call me at +1-415-555-0123.",
]))
for t in resp.texts:
    print(t)
```

### Smoke test that the service comes up

```bash
docker run --rm -p 8910:8910 lmnr/pii-redactor:latest &
sleep 2
grpcurl -plaintext localhost:8910 list
```
