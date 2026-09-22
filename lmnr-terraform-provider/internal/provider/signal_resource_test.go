package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/hashicorp/terraform-plugin-testing/helper/resource"
	"github.com/hashicorp/terraform-plugin-testing/terraform"
)

func TestAccSignalResourceLifecycle(t *testing.T) {
	var mu sync.Mutex
	var signal map[string]any
	var lastPatch map[string]any
	const id = "018f78a6-cedf-7a62-9f4a-3dcb2ae61010"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.Header.Get("Authorization") != "Bearer test-key" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/signals":
			var input map[string]any
			_ = json.NewDecoder(r.Body).Decode(&input)
			signal = canonicalSignal(id, input, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(signal)
		case r.Method == http.MethodGet && r.URL.Path == "/v1/signals/"+id:
			if signal == nil {
				http.NotFound(w, r)
				return
			}
			_ = json.NewEncoder(w).Encode(signal)
		case r.Method == http.MethodPatch && r.URL.Path == "/v1/signals/"+id:
			if signal == nil {
				http.NotFound(w, r)
				return
			}
			var input map[string]any
			_ = json.NewDecoder(r.Body).Decode(&input)
			lastPatch = input
			for key, value := range input {
				signal[key] = value
			}
			_ = json.NewEncoder(w).Encode(signal)
		case r.Method == http.MethodDelete && r.URL.Path == "/v1/signals/"+id:
			if signal == nil {
				http.NotFound(w, r)
				return
			}
			_ = json.NewEncoder(w).Encode(signal)
			signal = nil
		default:
			http.Error(w, "unexpected request", http.StatusNotFound)
		}
	}))
	defer server.Close()

	resource.Test(t, resource.TestCase{
		ProtoV6ProviderFactories: testAccProtoV6ProviderFactories,
		Steps: []resource.TestStep{
			{
				Config: signalConfig(server.URL, "Failure detector", true),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("laminar_signal.test", "id", id),
					resource.TestCheckResourceAttr("laminar_signal.test", "name", "Failure detector"),
					resource.TestCheckResourceAttr("laminar_signal.test", "mode", "realtime"),
					resource.TestCheckResourceAttr("laminar_signal.test", "disabled", "false"),
					resource.TestCheckResourceAttr("laminar_signal.test", "sample_rate", "50"),
				),
			},
			{
				Config: signalConfig(server.URL, "Failure detector updated", false),
				Check: resource.ComposeAggregateTestCheckFunc(
					resource.TestCheckResourceAttr("laminar_signal.test", "name", "Failure detector updated"),
					resource.TestCheckNoResourceAttr("laminar_signal.test", "sample_rate"),
					func(*terraform.State) error {
						value, ok := lastPatch["sampleRate"]
						if !ok || value != nil {
							return fmt.Errorf("sampleRate patch = %#v, want explicit null", lastPatch)
						}
						return nil
					},
				),
			},
			{
				ResourceName:      "laminar_signal.test",
				ImportState:       true,
				ImportStateId:     id,
				ImportStateVerify: true,
			},
		},
	})
}

func signalConfig(baseURL, name string, withSampleRate bool) string {
	sampleRate := ""
	if withSampleRate {
		sampleRate = "sample_rate = 50"
	}
	return fmt.Sprintf(`
provider "laminar" {
  project_api_key = "test-key"
  base_url = %q
}
resource "laminar_signal" "test" {
  name = %q
  prompt = "Identify failures"
  %s
  structured_output = jsonencode({
    type = "object"
    properties = { failed = { type = "boolean" } }
    required = ["failed"]
  })
}
`, baseURL, name, sampleRate)
}

func canonicalSignal(id string, input map[string]any, version int) map[string]any {
	sampleRate := input["sampleRate"]
	return map[string]any{
		"id": id, "projectId": "018f78a6-cedf-7a62-9f4a-3dcb2ae61011",
		"name": input["name"], "prompt": input["prompt"], "structuredOutput": input["structuredOutput"],
		"sampleRate": sampleRate, "disabled": false, "createdAt": "2026-09-07T10:00:00Z",
		"trigger": map[string]any{"type": "rootSpanFinished"},
		"filters": []any{map[string]any{"column": "total_token_count", "operator": "gt", "value": "1000"}},
		"mode":    "realtime", "currentVersion": version,
	}
}
