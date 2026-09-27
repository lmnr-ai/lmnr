package provider

import (
	"fmt"
	"reflect"
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
)

const signalSchema = `
  structured_output = jsonencode({
    type       = "object"
    properties = { failed = { type = "boolean" } }
    required   = ["failed"]
  })
`

func TestAccSignalResourceLifecycle(t *testing.T) {
	api, baseURL := newFakeAPI(t)
	const address = "laminar_signal.test"

	resource.Test(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				// Server defaults for trigger, filters, and mode.
				Config: providerConfig(baseURL) + `
resource "laminar_signal" "test" {
  name        = "Failure detector"
  prompt      = "Identify failures"
  sample_rate = 50
` + signalSchema + `}`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttrSet(address, "id"),
					resource.TestCheckResourceAttr(address, "project_id", fakeProjectID),
					resource.TestCheckResourceAttr(address, "mode", "realtime"),
					resource.TestCheckResourceAttr(address, "disabled", "false"),
					resource.TestCheckResourceAttr(address, "sample_rate", "50"),
					resource.TestCheckResourceAttr(address, "trigger.type", "rootSpanFinished"),
					resource.TestCheckResourceAttr(address, "filters.#", "1"),
					resource.TestCheckResourceAttr(address, "filters.0.column", "total_token_count"),
					resource.TestCheckResourceAttr(address, "filters.0.value", "1000"),
					resource.TestCheckResourceAttr(address, "version", "1"),
					func(*terraform.State) error {
						body := api.lastRequest("POST", "/v1/signals")
						if _, ok := body["llmProfileId"]; ok {
							return fmt.Errorf("create sent llmProfileId without configuration: %#v", body)
						}
						return nil
					},
				),
			},
			{
				Config: providerConfig(baseURL) + `
resource "laminar_signal" "test" {
  name     = "Failure detector v2"
  prompt   = "Identify failures"
  mode     = "batch"
  disabled = true
  trigger = {
    type       = "spanName"
    span_names = ["agent.run"]
  }
  filters = [
    { column = "status", operator = "eq", value = "error" },
    { column = "tags", operator = "includes", values = ["prod", "beta"] },
    { column = "total_token_count", operator = "gte", value = "250" },
  ]
` + signalSchema + `}`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr(address, "name", "Failure detector v2"),
					resource.TestCheckNoResourceAttr(address, "sample_rate"),
					resource.TestCheckResourceAttr(address, "trigger.span_names.0", "agent.run"),
					resource.TestCheckResourceAttr(address, "filters.#", "3"),
					resource.TestCheckResourceAttr(address, "filters.1.values.#", "2"),
					resource.TestCheckResourceAttr(address, "version", "2"),
					func(*terraform.State) error {
						body := api.lastRequest("PATCH", "/v1/signals/")
						if value, ok := body["sampleRate"]; !ok || value != nil {
							return fmt.Errorf("sampleRate = %#v, want explicit null", body["sampleRate"])
						}
						want := []any{
							map[string]any{"column": "status", "operator": "eq", "value": "error"},
							map[string]any{"column": "tags", "operator": "includes", "value": []any{"prod", "beta"}},
							map[string]any{"column": "total_token_count", "operator": "gte", "value": "250"},
						}
						if !reflect.DeepEqual(body["filters"], want) {
							return fmt.Errorf("filters = %#v", body["filters"])
						}
						if !reflect.DeepEqual(body["trigger"], map[string]any{"type": "spanName", "spanNames": []any{"agent.run"}}) {
							return fmt.Errorf("trigger = %#v", body["trigger"])
						}
						return nil
					},
				),
			},
			{
				ResourceName:      address,
				ImportState:       true,
				ImportStateVerify: true,
			},
			{
				// Removing trigger and filters restores the defaults; an empty list clears filters.
				Config: providerConfig(baseURL) + `
resource "laminar_signal" "test" {
  name    = "Failure detector v2"
  prompt  = "Identify failures"
  filters = []
` + signalSchema + `}`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr(address, "trigger.type", "rootSpanFinished"),
					resource.TestCheckResourceAttr(address, "filters.#", "0"),
					resource.TestCheckResourceAttr(address, "mode", "realtime"),
				),
			},
		},
	})
}

func TestAccSignalResourceSelfHostedRoute(t *testing.T) {
	_, baseURL := newFakeAPI(t)

	resource.Test(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config: providerConfig(baseURL) + `
resource "laminar_llm_profile" "openai" {
  name     = "openai"
  llm_provider = "openai_responses"
  models   = ["gpt-5-mini"]
  api_key  = "sk-test"
}
resource "laminar_signal" "test" {
  name           = "Routed"
  prompt         = "Identify failures"
  llm_profile_id = laminar_llm_profile.openai.id
  model          = "gpt-5-mini"
` + signalSchema + `}`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttrPair("laminar_signal.test", "llm_profile_id", "laminar_llm_profile.openai", "id"),
					resource.TestCheckResourceAttr("laminar_signal.test", "llm_profile_name", "openai"),
					resource.TestCheckResourceAttr("laminar_signal.test", "model", "gpt-5-mini"),
				),
			},
		},
	})
}

func TestAccSignalResourceValidation(t *testing.T) {
	cases := map[string]struct {
		body string
		err  string
	}{
		"operator not valid for column": {
			body: `filters = [{ column = "status", operator = "gt", value = "error" }]`,
			err:  `Invalid filter operator`,
		},
		"list value for scalar column": {
			body: `filters = [{ column = "total_token_count", operator = "gt", values = ["1"] }]`,
			err:  "Use value",
		},
		"value and values": {
			body: `filters = [{ column = "tags", operator = "includes", value = "a", values = ["a"] }]`,
			err:  "Invalid Attribute Combination",
		},
		"non-numeric token count": {
			body: `filters = [{ column = "total_token_count", operator = "gt", value = "Inf" }]`,
			err:  "must be a finite number",
		},
		"span names without spanName trigger": {
			body: `trigger = { type = "rootSpanFinished", span_names = ["a"] }`,
			err:  "span_names",
		},
		"spanName trigger without span names": {
			body: `trigger = { type = "spanName" }`,
			err:  "span_names",
		},
		"model without profile": {
			body: `model = "gpt-5-mini"`,
			err:  "Invalid Attribute Combination",
		},
		"padded name": {
			body: ``,
			err:  "Invalid whitespace",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			signalName := "Validation"
			if name == "padded name" {
				signalName = " Validation "
			}
			resource.UnitTest(t, resource.TestCase{
				ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
				Steps: []resource.TestStep{{
					PlanOnly: true,
					Config: providerConfig("http://127.0.0.1:1") + fmt.Sprintf(`
resource "laminar_signal" "test" {
  name   = %q
  prompt = "Identify failures"
  %s
`, signalName, tc.body) + signalSchema + `}`,
					ExpectError: regexp.MustCompile(tc.err),
				}},
			})
		})
	}
}
