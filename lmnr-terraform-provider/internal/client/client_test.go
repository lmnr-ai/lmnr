package client_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

func TestSignalCRUDUsesExpectedHTTPContract(t *testing.T) {
	t.Parallel()

	const id = "018f78a6-cedf-7a62-9f4a-3dcb2ae61010"
	step := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		step++
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		switch step {
		case 1:
			if r.Method != http.MethodPost || r.URL.Path != "/v1/signals" {
				t.Fatalf("create request = %s %s", r.Method, r.URL.Path)
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["name"] != "Failures" || body["prompt"] != "Find failures" {
				t.Fatalf("unexpected create body: %#v", body)
			}
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(signalJSON(id, "Failures", "Find failures", 1)))
		case 2:
			if r.Method != http.MethodGet || r.URL.Path != "/v1/signals/"+id {
				t.Fatalf("read request = %s %s", r.Method, r.URL.Path)
			}
			_, _ = w.Write([]byte(signalJSON(id, "Failures", "Find failures", 1)))
		case 3:
			if r.Method != http.MethodPatch || r.URL.Path != "/v1/signals/"+id {
				t.Fatalf("update request = %s %s", r.Method, r.URL.Path)
			}
			_, _ = w.Write([]byte(signalJSON(id, "Failures v2", "Find failures", 1)))
		case 4:
			if r.Method != http.MethodDelete || r.URL.Path != "/v1/signals/"+id {
				t.Fatalf("delete request = %s %s", r.Method, r.URL.Path)
			}
			_, _ = w.Write([]byte(signalJSON(id, "Failures v2", "Find failures", 1)))
		default:
			t.Fatalf("unexpected request %d", step)
		}
	}))
	defer server.Close()

	api, err := client.New(server.URL, "test-key", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	created, err := api.CreateSignal(ctx, client.CreateSignalRequest{Name: "Failures", Prompt: "Find failures", StructuredOutput: json.RawMessage(`{"type":"object"}`)})
	if err != nil || created.ID != id {
		t.Fatalf("create = %#v, %v", created, err)
	}
	if _, err = api.GetSignal(ctx, id); err != nil {
		t.Fatal(err)
	}
	name := "Failures v2"
	if _, err = api.UpdateSignal(ctx, id, client.UpdateSignalRequest{Name: &name}); err != nil {
		t.Fatal(err)
	}
	if err = api.DeleteSignal(ctx, id); err != nil {
		t.Fatal(err)
	}
}

func TestGetSignalMaps404(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	api, err := client.New(server.URL, "test-key", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = api.GetSignal(context.Background(), "missing")
	if !errors.Is(err, client.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

func signalJSON(id, name, prompt string, version int) string {
	return `{"id":"` + id + `","projectId":"018f78a6-cedf-7a62-9f4a-3dcb2ae61011","name":"` + name + `","prompt":"` + prompt + `","structuredOutput":{"type":"object"},"sampleRate":null,"disabled":false,"createdAt":"2026-09-07T10:00:00Z","trigger":{"type":"rootSpanFinished"},"filters":[{"column":"total_token_count","operator":"gt","value":"1000"}],"mode":"realtime","currentVersion":` + string(rune('0'+version)) + `}`
}
