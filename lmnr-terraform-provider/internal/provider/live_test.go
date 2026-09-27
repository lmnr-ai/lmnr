package provider

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
)

// TestAccLive runs against a real Laminar API (LMNR_TF_LIVE_TEST=1). Set
// LMNR_TF_LIVE_SELF_HOSTED=1 for deployments that route Signals through an LLM
// profile; Laminar Cloud rejects llm_profile_id.
func TestAccLive(t *testing.T) {
	testAccLivePreCheck(t)
	suffix := fmt.Sprintf("tf-acc-%d", time.Now().UnixNano())
	providerBlock := `provider "laminar" {}`
	if baseURL := os.Getenv("LMNR_BASE_URL"); baseURL != "" {
		providerBlock = fmt.Sprintf(`provider "laminar" { base_url = %q }`, baseURL)
	}
	selfHosted := os.Getenv("LMNR_TF_LIVE_SELF_HOSTED") != ""

	config := func(prompt string) string {
		route := ""
		profile := ""
		if selfHosted {
			profile = fmt.Sprintf(`
resource "laminar_llm_profile" "live" {
  name         = "%s"
  llm_provider = "openai_responses"
  models       = ["gpt-5-mini", "gpt-5"]
  api_key      = "sk-terraform-acceptance"
}
`, suffix)
			route = `
  llm_profile_id = laminar_llm_profile.live.id
  model          = "gpt-5-mini"`
		}
		return providerBlock + profile + fmt.Sprintf(`
resource "laminar_dataset" "live" {
  name = "%[1]s"
}

resource "laminar_signal" "live" {
  name   = "%[1]s"
  prompt = %[2]q
  trigger = {
    type       = "spanName"
    span_names = ["agent.run"]
  }
  filters = [
    { column = "status", operator = "eq", value = "error" },
    { column = "tags", operator = "not_includes", values = ["test"] },
  ]
  structured_output = jsonencode({
    type       = "object"
    properties = { failed = { type = "boolean" } }
    required   = ["failed"]
  })%[3]s
}

data "laminar_project" "current" {}

data "laminar_signal" "by_name" {
  name = laminar_signal.live.name
}

data "laminar_dataset" "by_name" {
  name = laminar_dataset.live.name
}
`, suffix, prompt, route)
	}

	checks := []resource.TestCheckFunc{
		resource.TestCheckResourceAttrSet("laminar_signal.live", "id"),
		resource.TestCheckResourceAttr("laminar_signal.live", "mode", "realtime"),
		resource.TestCheckResourceAttr("laminar_signal.live", "filters.#", "2"),
		resource.TestCheckResourceAttrPair("laminar_signal.live", "project_id", "data.laminar_project.current", "id"),
		resource.TestCheckResourceAttrPair("data.laminar_signal.by_name", "id", "laminar_signal.live", "id"),
		resource.TestCheckResourceAttrPair("data.laminar_dataset.by_name", "id", "laminar_dataset.live", "id"),
	}
	if selfHosted {
		checks = append(checks,
			resource.TestCheckResourceAttrPair("laminar_signal.live", "llm_profile_id", "laminar_llm_profile.live", "id"),
			resource.TestCheckResourceAttr("laminar_signal.live", "llm_profile_name", suffix),
		)
	}

	steps := []resource.TestStep{
		{Config: config("Detect failures in this trace."), Check: resource.ComposeAggregateTestCheckFunc(checks...)},
		{Config: config("Detect failed tool calls in this trace."), Check: resource.TestCheckResourceAttr("laminar_signal.live", "version", "2")},
		{ResourceName: "laminar_signal.live", ImportState: true, ImportStateVerify: true},
		{ResourceName: "laminar_dataset.live", ImportState: true, ImportStateVerify: true},
	}
	if selfHosted {
		steps = append(steps, resource.TestStep{
			ResourceName: "laminar_llm_profile.live", ImportState: true, ImportStateVerify: true,
			ImportStateVerifyIgnore: []string{"api_key"},
		})
	}
	resource.Test(t, resource.TestCase{ProtoV6ProviderFactories: testAccProtoV6ProviderFactories, Steps: steps})
}
