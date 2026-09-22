package provider

import (
	"os"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/hashicorp/terraform-plugin-go/tfprotov6"
)

var testAccProtoV6ProviderFactories = map[string]func() (tfprotov6.ProviderServer, error){
	"laminar": providerserver.NewProtocol6WithError(New("test")()),
}

func testAccPreCheck(t *testing.T) {
	t.Helper()
	if testing.Short() {
		t.Skip("acceptance tests skipped with -short")
	}
}

func testAccLivePreCheck(t *testing.T) {
	t.Helper()
	if os.Getenv("LMNR_TF_LIVE_TEST") == "" {
		t.Skip("set LMNR_TF_LIVE_TEST=1 to run against a live Laminar API")
	}
	if os.Getenv("LMNR_PROJECT_API_KEY") == "" {
		t.Fatal("LMNR_PROJECT_API_KEY must be set for live acceptance tests")
	}
}
