variable "openai_api_key" {
  type      = string
  sensitive = true
}

variable "aws_access_key_id" {
  type = string
}

variable "aws_secret_access_key" {
  type      = string
  sensitive = true
}

variable "gateway_api_key" {
  type      = string
  sensitive = true
}

variable "gateway_team_token" {
  type      = string
  sensitive = true
}

resource "laminar_llm_profile" "openai" {
  name         = "openai"
  llm_provider = "openai_responses"
  models       = ["gpt-5-mini", "gpt-5"]
  api_key      = var.openai_api_key
}

resource "laminar_llm_profile" "bedrock" {
  name              = "bedrock"
  llm_provider      = "bedrock"
  models            = ["anthropic.claude-sonnet-4-5-20250929-v1:0"]
  region            = "us-east-1"
  auth_type         = "aws_keys"
  aws_access_key_id = var.aws_access_key_id
  secret_access_key = var.aws_secret_access_key
}

resource "laminar_llm_profile" "gateway" {
  name         = "internal-gateway"
  llm_provider = "custom"
  models       = ["llama-3.3-70b"]
  base_url     = "https://llm-gateway.example.com/v1"
  api_key      = var.gateway_api_key
  headers = {
    "X-Team" = var.gateway_team_token
  }
}
