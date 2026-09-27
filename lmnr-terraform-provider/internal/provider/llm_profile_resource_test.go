package provider

import (
	"fmt"
	"reflect"
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/plancheck"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
)

func TestAccLlmProfileResourceLifecycle(t *testing.T) {
	api, baseURL := newFakeAPI(t)
	const address = "laminar_llm_profile.gateway"
	profileID := func(s *terraform.State) string { return s.RootModule().Resources[address].Primary.ID }

	resource.Test(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config: providerConfig(baseURL) + `
resource "laminar_llm_profile" "gateway" {
  name     = "gateway"
  llm_provider = "custom"
  models   = ["m1", "m2"]
  base_url = "https://gateway.example.com/v1"
  api_key  = "sk-first"
  headers  = { "X-Team" = "ml", "X-Env" = "prod" }
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr(address, "workspace_id", fakeWorkspaceID),
					resource.TestCheckResourceAttr(address, "auth_type", "api_key"),
					resource.TestCheckResourceAttr(address, "models.#", "2"),
					resource.TestCheckResourceAttr(address, "api_key", "sk-first"),
					resource.TestCheckResourceAttr(address, "headers.X-Team", "ml"),
					func(s *terraform.State) error {
						body := api.lastRequest("POST", "/v1/llm-profiles")
						config := body["config"].(map[string]any)
						if !reflect.DeepEqual(config["headerNames"], []any{"X-Env", "X-Team"}) {
							return fmt.Errorf("headerNames = %#v", config["headerNames"])
						}
						for _, unused := range []string{"region", "resourceId", "apiVersion"} {
							if _, ok := config[unused]; ok {
								return fmt.Errorf("config sent unused %s: %#v", unused, config)
							}
						}
						return nil
					},
				),
			},
			{
				// Rotate the key, drop a header, and change the model list.
				Config: providerConfig(baseURL) + `
resource "laminar_llm_profile" "gateway" {
  name     = "gateway"
  llm_provider = "custom"
  models   = ["m2", "m3"]
  base_url = "https://gateway.example.com/v1"
  api_key  = "sk-second"
  headers  = { "X-Team" = "ml" }
}
`,
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction(address, plancheck.ResourceActionUpdate)},
				},
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr(address, "api_key", "sk-second"),
					resource.TestCheckResourceAttr(address, "headers.%", "1"),
					resource.TestCheckTypeSetElemAttr(address, "models.*", "m3"),
					func(s *terraform.State) error {
						secrets := api.storedSecrets(profileID(s))
						if secrets["apiKey"] != "sk-second" || !reflect.DeepEqual(secrets["headers"], map[string]any{"X-Team": "ml"}) {
							return fmt.Errorf("stored secrets = %#v", secrets)
						}
						return nil
					},
				),
			},
			{
				ResourceName:            address,
				ImportState:             true,
				ImportStateVerify:       true,
				ImportStateVerifyIgnore: []string{"api_key", "headers", "updated_at"},
			},
			{
				// Switching provider in place sends the new provider's config and credentials.
				Config: providerConfig(baseURL) + `
resource "laminar_llm_profile" "gateway" {
  name              = "gateway"
  llm_provider          = "bedrock"
  models            = ["anthropic.claude"]
  region            = "us-east-1"
  auth_type         = "aws_keys"
  aws_access_key_id = "AKIA123"
  secret_access_key = "secret"
}
data "laminar_llm_profile" "by_name" {
  name       = "gateway"
  depends_on = [laminar_llm_profile.gateway]
}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr(address, "llm_provider", "bedrock"),
					resource.TestCheckNoResourceAttr(address, "api_key"),
					resource.TestCheckNoResourceAttr(address, "base_url"),
					resource.TestCheckResourceAttr("data.laminar_llm_profile.by_name", "region", "us-east-1"),
					resource.TestCheckResourceAttr("data.laminar_llm_profile.by_name", "auth_type", "aws_keys"),
					resource.TestCheckResourceAttr("data.laminar_llm_profile.by_name", "header_names.#", "0"),
					func(s *terraform.State) error {
						body := api.lastRequest("PATCH", "/v1/llm-profiles/")
						want := map[string]any{"auth": map[string]any{"type": "aws_keys", "accessKeyId": "AKIA123"}, "region": "us-east-1"}
						if !reflect.DeepEqual(body["config"], want) {
							return fmt.Errorf("config = %#v", body["config"])
						}
						return nil
					},
				),
			},
		},
	})
}

func TestAccLlmProfileResourceValidation(t *testing.T) {
	cases := map[string]struct {
		body string
		err  string
	}{
		"bedrock without region": {
			body: `llm_provider = "bedrock"
  auth_type = "bearer_token"
  token = "t"`,
			err: "Bedrock profiles require region",
		},
		"bedrock with api_key auth": {
			body: `llm_provider = "bedrock"
  region = "us-east-1"
  api_key = "k"`,
			err: "Bedrock requires auth_type",
		},
		"openai without api key": {
			body: `llm_provider = "openai_responses"`,
			err:  "requires api_key",
		},
		"unused field": {
			body: `llm_provider = "anthropic"
  api_key = "k"
  region = "us-east-1"`,
			err: `does not use region`,
		},
		"azure with both endpoints": {
			body: `llm_provider = "azure_responses"
  api_key = "k"
  resource_id = "r"
  base_url = "https://r.openai.azure.com"`,
			err: "exactly one of resource_id and base_url",
		},
		"custom without base url": {
			body: `llm_provider = "custom"
  api_key = "k"`,
			err: "requires base_url",
		},
		"trailing slash": {
			body: `llm_provider = "custom"
  api_key = "k"
  base_url = "https://gw.example.com/"`,
			err: "without a trailing slash",
		},
		"invalid header name": {
			body: `llm_provider = "custom"
  api_key = "k"
  base_url = "https://gw.example.com"
  headers = { "X Team" = "v" }`,
			err: "valid HTTP header name",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			resource.UnitTest(t, resource.TestCase{
				ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
				Steps: []resource.TestStep{{
					PlanOnly: true,
					Config: providerConfig("http://127.0.0.1:1") + `
resource "laminar_llm_profile" "test" {
  name   = "test"
  models = ["m"]
  ` + tc.body + `
}
`,
					ExpectError: regexp.MustCompile(tc.err),
				}},
			})
		})
	}
}
