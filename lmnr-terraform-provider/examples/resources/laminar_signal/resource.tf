resource "laminar_signal" "failure_detector" {
  name   = "Failure detector"
  prompt = "Identify failed or abandoned runs."

  structured_output = jsonencode({
    type = "object"
    properties = {
      failed = { type = "boolean" }
      reason = { type = "string" }
    }
    required = ["failed", "reason"]
  })
}
