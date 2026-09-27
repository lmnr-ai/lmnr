data "laminar_dataset" "golden" {
  name = "golden-set"
}

output "golden_dataset_id" {
  value = data.laminar_dataset.golden.id
}
