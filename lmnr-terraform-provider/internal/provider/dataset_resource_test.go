package provider

import (
	"regexp"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/plancheck"
)

func TestAccDatasetResourceLifecycle(t *testing.T) {
	_, baseURL := newFakeAPI(t)
	dataset := func(name string) string {
		return providerConfig(baseURL) + `
resource "laminar_dataset" "test" {
  name = "` + name + `"
}
`
	}

	resource.Test(t, resource.TestCase{
		PreCheck:                 func() { testAccPreCheck(t) },
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config: dataset("golden"),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttrSet("laminar_dataset.test", "id"),
					resource.TestCheckResourceAttr("laminar_dataset.test", "name", "golden"),
					resource.TestCheckResourceAttr("laminar_dataset.test", "project_id", fakeProjectID),
				),
			},
			{
				Config: dataset("golden-v2"),
				ConfigPlanChecks: resource.ConfigPlanChecks{
					PreApply: []plancheck.PlanCheck{plancheck.ExpectResourceAction("laminar_dataset.test", plancheck.ResourceActionUpdate)},
				},
				Check: resource.TestCheckResourceAttr("laminar_dataset.test", "name", "golden-v2"),
			},
			{
				ResourceName:      "laminar_dataset.test",
				ImportState:       true,
				ImportStateVerify: true,
			},
			{
				Config: dataset("golden-v2") + `
data "laminar_dataset" "by_name" {
  name       = "golden-v2"
  depends_on = [laminar_dataset.test]
}
data "laminar_dataset" "by_id" {
  id = laminar_dataset.test.id
}
data "laminar_project" "current" {}
`,
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttrPair("data.laminar_dataset.by_name", "id", "laminar_dataset.test", "id"),
					resource.TestCheckResourceAttr("data.laminar_dataset.by_id", "name", "golden-v2"),
					resource.TestCheckResourceAttr("data.laminar_project.current", "id", fakeProjectID),
				),
			},
			{
				Config: dataset("golden-v2") + `
resource "laminar_dataset" "twin" {
  name = "golden-v2"
}
data "laminar_dataset" "ambiguous" {
  name       = "golden-v2"
  depends_on = [laminar_dataset.test, laminar_dataset.twin]
}
`,
				ExpectError: regexp.MustCompile("Ambiguous dataset name"),
			},
		},
	})
}
