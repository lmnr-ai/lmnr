default: fmt lint install generate

build:
	go build -v ./...

install: build
	go install -v ./...

lint:
	golangci-lint run

generate:
	cd tools; go generate ./...

# Refresh the vendored API spec that internal/client/contract_test.go checks against.
# OPENAPI_SPEC defaults to the docs repo checked out next to lmnr.
OPENAPI_SPEC ?= ../../docs/openapi/openapi.yaml
sync-openapi:
	cp $(OPENAPI_SPEC) openapi/openapi.yaml
	go test ./internal/client -run OpenAPISpec

fmt:
	gofmt -s -w -e .

test:
	go test -v -cover -timeout=120s -parallel=10 ./...

testacc:
	TF_ACC=1 go test -v -cover -timeout 120m ./...

.PHONY: fmt lint test testacc build install generate sync-openapi
