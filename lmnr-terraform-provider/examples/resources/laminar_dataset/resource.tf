resource "laminar_dataset" "golden" {
  name = "golden-set"

  lifecycle {
    # Destroying a dataset deletes its datapoints.
    prevent_destroy = true
  }
}
