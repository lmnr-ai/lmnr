resource "laminar_signal" "failure_detector" {
  name   = "Failure detector"
  prompt = "Identify failed or abandoned runs and explain why."

  structured_output = jsonencode({
    type = "object"
    properties = {
      failed = { type = "boolean" }
      reason = { type = "string" }
    }
    required = ["failed", "reason"]
  })

  # Evaluate a quarter of the traces whose `agent.run` span finished with an error.
  sample_rate = 25
  trigger = {
    type       = "spanName"
    span_names = ["agent.run"]
  }
  filters = [
    { column = "status", operator = "eq", value = "error" },
    { column = "tags", operator = "not_includes", values = ["synthetic"] },
  ]

  lifecycle {
    # Destroying a Signal deletes its events.
    prevent_destroy = true
  }
}

# Self-hosted deployments route Signals through a workspace LLM profile.
resource "laminar_signal" "self_hosted" {
  name           = "Tool misuse"
  prompt         = "Did the agent call a tool with invalid arguments?"
  llm_profile_id = laminar_llm_profile.openai.id
  model          = "gpt-5-mini"

  structured_output = jsonencode({
    type       = "object"
    properties = { misuse = { type = "boolean" } }
    required   = ["misuse"]
  })
}
