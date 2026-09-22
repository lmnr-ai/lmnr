data "laminar_signal" "existing" {
  id = "00000000-0000-0000-0000-000000000000"
}

output "signal_name" {
  value = data.laminar_signal.existing.name
}
