# start qdrant container
docker run -d -p 6333:6333 -p 6334:6334 \
    -e QDRANT__SERVICE__GRPC_PORT="6334" \
    qdrant/qdrant \

# sleep for 5 seconds to allow container to start
sleep 5

# create documents collection
curl --location --request PUT 'localhost:6333/collections/documents' \
--header 'Content-Type: application/json' \
--data '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "hnsw_config": {
        "payload_m": 16,
        "m": 0
    }
}'

# add index over user_id to documents collection
curl --location --request PUT 'http://localhost:6333/collections/documents/index' \
--header 'Content-Type: application/json' \
--data '{
    "field_name": "user_id",
    "field_schema": "keyword"
}'

# add index over document_id to documents collection
curl --location --request PUT 'http://localhost:6333/collections/documents/index' \
--header 'Content-Type: application/json' \
--data '{
    "field_name": "document_id",
    "field_schema": "keyword"
}'