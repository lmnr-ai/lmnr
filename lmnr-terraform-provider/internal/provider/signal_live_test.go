package provider

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
)

func TestAccSignalResourceLive(t *testing.T) {
	testAccLivePreCheck(t)
	name := fmt.Sprintf("terraform-acceptance-%d", time.Now().UnixNano())
	baseURL := os.Getenv("LMNR_BASE_URL")
	providerConfig := "provider \"laminar\" {}"
	if baseURL != "" {
		providerConfig = fmt.Sprintf("provider \"laminar\" { base_url = %q }", baseURL)
	}

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				PreConfig: func() { testAccLivePreCheck(t) },
				Config: providerConfig + fmt.Sprintf(`
resource "laminar_signal" "live" {
  name = %q
  prompt = "Detect failures in this trace."
  structured_output = jsonencode({
    type = "object"
    properties = { failed = { type = "boolean" } }
    required = ["failed"]
  })
}
`, name),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttrSet("laminar_signal.live", "id"),
					resource.TestCheckResourceAttr("laminar_signal.live", "name", name),
					resource.TestCheckResourceAttr("laminar_signal.live", "mode", "realtime"),
				),
			},
		},
	})
}
