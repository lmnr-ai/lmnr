# The project that owns the configured project API key.
data "laminar_project" "current" {}

output "project_id" {
  value = data.laminar_project.current.id
}
