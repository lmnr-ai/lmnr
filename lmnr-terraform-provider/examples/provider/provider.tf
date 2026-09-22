terraform {
  required_providers {
    laminar = {
      source = "lmnr-ai/laminar"
    }
  }
}

provider "laminar" {
  # Configure with LMNR_PROJECT_API_KEY. Self-hosted users can additionally set
  # LMNR_BASE_URL or configure base_url here.
}
