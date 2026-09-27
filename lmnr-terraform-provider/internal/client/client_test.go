package client_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

const signalID = "018f78a6-cedf-7a62-9f4a-3dcb2ae61010"

type recorded struct {
	method, path, query string
	body                map[string]any
}

// fakeAPI answers every request with the next canned response and records it.
func fakeAPI(t *testing.T, responses ...string) (*client.Client, *[]recorded) {
	t.Helper()
	var requests []recorded
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("authorization = %q", got)
		}
		if got := r.Header.Get("User-Agent"); got != "terraform-provider-laminar/test" {
			t.Errorf("user agent = %q", got)
		}
		req := recorded{method: r.Method, path: r.URL.Path, query: r.URL.RawQuery}
		if data, _ := io.ReadAll(r.Body); len(data) > 0 {
			if err := json.Unmarshal(data, &req.body); err != nil {
				t.Errorf("request body is not JSON: %s", data)
			}
		}
		requests = append(requests, req)
		if len(requests) > len(responses) {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(responses[len(requests)-1]))
	}))
	t.Cleanup(server.Close)
	api, err := client.New(server.URL, "test-key", "terraform-provider-laminar/test", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	return api, &requests
}

func TestSignalCRUD(t *testing.T) {
	t.Parallel()
	signal := signalJSON("Failures")
	api, requests := fakeAPI(t, signal, `{"signals":[`+signal+`]}`, signal, signalJSON("Failures v2"), "")
	ctx := context.Background()

	created, err := api.CreateSignal(ctx, client.CreateSignalRequest{
		Name: "Failures", Prompt: "Find failures", StructuredOutput: json.RawMessage(`{"type":"object"}`),
		Filters: []client.SignalFilter{},
	})
	if err != nil || created.ID != signalID || created.Version != 3 || created.LlmProfileID != nil {
		t.Fatalf("create = %#v, %v", created, err)
	}
	listed, err := api.ListSignals(ctx, "Fail ures")
	if err != nil || len(listed) != 1 {
		t.Fatalf("list = %#v, %v", listed, err)
	}
	if _, err = api.GetSignal(ctx, signalID); err != nil {
		t.Fatal(err)
	}
	name := "Failures v2"
	if _, err = api.UpdateSignal(ctx, signalID, client.UpdateSignalRequest{Name: &name, SampleRate: json.RawMessage("null")}); err != nil {
		t.Fatal(err)
	}
	if err = api.DeleteSignal(ctx, signalID); err != nil {
		t.Fatal(err)
	}

	want := []struct{ method, path string }{
		{http.MethodPost, "/v1/signals"},
		{http.MethodGet, "/v1/signals"},
		{http.MethodGet, "/v1/signals/" + signalID},
		{http.MethodPatch, "/v1/signals/" + signalID},
		{http.MethodDelete, "/v1/signals/" + signalID},
	}
	for i, w := range want {
		if got := (*requests)[i]; got.method != w.method || got.path != w.path {
			t.Errorf("request %d = %s %s, want %s %s", i, got.method, got.path, w.method, w.path)
		}
	}
	create := (*requests)[0].body
	if filters, ok := create["filters"].([]any); !ok || len(filters) != 0 {
		t.Errorf("create must send an explicit empty filters list, got %#v", create["filters"])
	}
	if _, ok := create["llmProfileId"]; ok {
		t.Errorf("create must omit llmProfileId when unset: %#v", create)
	}
	if got := (*requests)[1].query; got != "name=Fail+ures" {
		t.Errorf("list query = %q", got)
	}
	update := (*requests)[3].body
	if v, ok := update["sampleRate"]; !ok || v != nil {
		t.Errorf("update must send sampleRate: null, got %#v", update)
	}
	if _, ok := update["prompt"]; ok {
		t.Errorf("update must omit unset fields: %#v", update)
	}
}

func TestDatasetCRUD(t *testing.T) {
	t.Parallel()
	dataset := `{"id":"d1","name":"golden","projectId":"p1","createdAt":"2026-09-07T10:00:00Z"}`
	api, requests := fakeAPI(t, dataset, "["+dataset+"]", dataset, dataset, "")
	ctx := context.Background()

	if got, err := api.CreateDataset(ctx, "golden"); err != nil || got.ID != "d1" {
		t.Fatalf("create = %#v, %v", got, err)
	}
	if got, err := api.ListDatasets(ctx, "golden"); err != nil || len(got) != 1 {
		t.Fatalf("list = %#v, %v", got, err)
	}
	if _, err := api.GetDataset(ctx, "d1"); err != nil {
		t.Fatal(err)
	}
	if _, err := api.UpdateDataset(ctx, "d1", "silver"); err != nil {
		t.Fatal(err)
	}
	if err := api.DeleteDataset(ctx, "d1"); err != nil {
		t.Fatal(err)
	}
	if got := (*requests)[3]; got.method != http.MethodPatch || got.path != "/v1/datasets/d1" || got.body["name"] != "silver" {
		t.Errorf("update request = %#v", got)
	}
	if got := (*requests)[1].query; got != "name=golden" {
		t.Errorf("list query = %q", got)
	}
}

func TestLlmProfileCRUD(t *testing.T) {
	t.Parallel()
	profile := `{"id":"l1","workspaceId":"w1","name":"gateway","provider":"custom","config":{"auth":{"type":"api_key"},"baseUrl":"https://gw.example.com","headerNames":["X-Team"]},"models":["m1"],"secrets":{"apiKey":"sk-***123","secretAccessKey":null,"token":null,"headers":["X-Team"]},"createdAt":"t","updatedAt":"t"}`
	api, requests := fakeAPI(t, profile, `{"llmProfiles":[`+profile+`]}`, profile, profile, "")
	ctx := context.Background()

	created, err := api.CreateLlmProfile(ctx, client.CreateLlmProfileRequest{
		Name: "gateway", Provider: "custom", Models: []string{"m1"},
		Config:  client.LlmProfileConfig{Auth: client.LlmProfileAuth{Type: "api_key"}, BaseURL: "https://gw.example.com", HeaderNames: []string{"X-Team"}},
		Secrets: client.LlmProfileSecrets{APIKey: "sk-abc123", Headers: map[string]string{"X-Team": "ml"}},
	})
	if err != nil || created.Secrets.APIKey == nil || created.Secrets.Token != nil || created.Config.HeaderNames[0] != "X-Team" {
		t.Fatalf("create = %#v, %v", created, err)
	}
	if got, err := api.ListLlmProfiles(ctx); err != nil || len(got) != 1 {
		t.Fatalf("list = %#v, %v", got, err)
	}
	if _, err := api.GetLlmProfile(ctx, "l1"); err != nil {
		t.Fatal(err)
	}
	name := "gateway-2"
	if _, err := api.UpdateLlmProfile(ctx, "l1", client.UpdateLlmProfileRequest{Name: &name}); err != nil {
		t.Fatal(err)
	}
	if err := api.DeleteLlmProfile(ctx, "l1"); err != nil {
		t.Fatal(err)
	}

	config := (*requests)[0].body["config"].(map[string]any)
	for _, unused := range []string{"region", "resourceId", "apiVersion"} {
		if _, ok := config[unused]; ok {
			t.Errorf("create must omit unused config field %s: %#v", unused, config)
		}
	}
	if auth := config["auth"].(map[string]any); len(auth) != 1 {
		t.Errorf("api_key auth must not carry accessKeyId: %#v", auth)
	}
	update := (*requests)[3].body
	for _, unset := range []string{"provider", "config", "models"} {
		if _, ok := update[unset]; ok {
			t.Errorf("update must omit unset %s: %#v", unset, update)
		}
	}
}

func TestErrors(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/signals/missing":
			http.NotFound(w, r)
		default:
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{"error":"A signal with this name already exists"}`))
		}
	}))
	defer server.Close()
	api, err := client.New(server.URL, "test-key", "test", server.Client())
	if err != nil {
		t.Fatal(err)
	}

	if _, err = api.GetSignal(context.Background(), "missing"); !errors.Is(err, client.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
	_, err = api.CreateSignal(context.Background(), client.CreateSignalRequest{Filters: []client.SignalFilter{}})
	var apiErr *client.APIError
	if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusConflict || apiErr.Message != "A signal with this name already exists" {
		t.Fatalf("error = %#v", err)
	}
}

func signalJSON(name string) string {
	return `{"id":"` + signalID + `","projectId":"018f78a6-cedf-7a62-9f4a-3dcb2ae61011","name":"` + name + `","prompt":"Find failures",` +
		`"structuredOutput":{"type":"object"},"sampleRate":null,"disabled":false,"createdAt":"2026-09-07T10:00:00Z",` +
		`"trigger":{"type":"rootSpanFinished"},"filters":[{"column":"total_token_count","operator":"gt","value":"1000"}],` +
		`"mode":"realtime","version":3,"llmProfileId":null,"llmProfileName":null,"model":null}`
}
