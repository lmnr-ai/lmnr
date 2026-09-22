# Terraform Provider for Laminar

Manage Laminar resources with Terraform. The first supported resource is a Signal.

## Example

```hcl
terraform {
  required_providers {
    laminar = {
      source = "lmnr-ai/laminar"
    }
  }
}

provider "laminar" {}

resource "laminar_signal" "failure_detector" {
  name   = "Failure detector"
  prompt = "Identify failed or abandoned runs."

  structured_output = jsonencode({
    type       = "object"
    properties = { failed = { type = "boolean" } }
    required   = ["failed"]
  })
}
```

Set `LMNR_PROJECT_API_KEY` before running Terraform. Self-hosted users can also set `LMNR_BASE_URL`.

## Development

Requirements: Go 1.25+, Terraform 1.0+.

```shell
go test ./...
TF_ACC=1 go test ./internal/provider -run TestAccSignalResourceLifecycle -v
go build ./...
```

The acceptance test uses a real Terraform CLI process against an in-memory HTTP implementation of the Laminar Signal API. To test manually against a local Laminar server, build the provider and configure a Terraform development override.

## OpenAPI generation

`generator_config.yml` maps the Signal operations from OpenAPI to a Terraform resource and data source. Run:

```shell
tfplugingen-openapi generate \
  --config generator_config.yml \
  --output provider_code_spec.json \
  openapi/generator-openapi.yaml
```

The checked-in focused generator input works around the OpenAPI generator's current lack of `allOf` support. Generated schema is advisory: lifecycle code remains handwritten and tested because update and delete mappings currently do not affect generated schemas.
