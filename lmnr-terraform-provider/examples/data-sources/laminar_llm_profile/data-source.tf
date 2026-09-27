data "laminar_llm_profile" "openai" {
  name = "openai"
}

output "openai_models" {
  value = data.laminar_llm_profile.openai.models
}
