data "laminar_signal" "failure_detector" {
  name = "Failure detector"
}

output "failure_detector_id" {
  value = data.laminar_signal.failure_detector.id
}
