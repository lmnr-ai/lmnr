# semantic-search-service

This is an interface to communicate with a vectordb. We use [`qdrant`](https://qdrant.tech/).

## Development

If you need to run the system just for app-server to see this server running, a simple

```sh
cargo run
```

would suffice.

### Running local db to test semantic search specifically

If you need to test semantic search functionality locally, then follow the below set up instructions.

To run qdrant in local dev docker, quite simply,
```sh
docker pull qdrant/qdrant
docker run -p 6333:6333 -p 6334:6334 --name qdrant -e QDRANT__SERVICE__GRPC_PORT="6334" qdrant/qdrant
```

you will also need to send a put request to the newly exposed API, somewhat like

```sh
curl -X 'PUT' '127.0.0.1:6333/collections/documents_1024' \
-H 'accept: application/json' \
-H 'Content-Type: text/json' \
-d \
"{\
    \"vectors\": {\
      \"size\": 1024,\
      \"distance\": \"Cosine\"\
    },\
    \"hnsw_config\": {\
        \"payload_m\": 16,\
        \"m\": 0\
    }\
}"
```

Here's the same thing without escaping quotes:

```json
{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "hnsw_config": {
        "payload_m": 16,
        "m": 0
    }
}
```

Lastly, to run the service do
```sh
cargo run
```