package provider

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
)

const (
	fakeProjectID   = "018f78a6-cedf-7a62-9f4a-3dcb2ae61011"
	fakeWorkspaceID = "018f78a6-cedf-7a62-9f4a-3dcb2ae61012"
)

// fakeAPI is an in-memory Laminar API that applies the server-side defaults,
// masking, and secret merging the provider depends on.
type fakeAPI struct {
	t        *testing.T
	mu       sync.Mutex
	nextID   int
	signals  map[string]map[string]any
	datasets map[string]map[string]any
	profiles map[string]map[string]any
	secrets  map[string]map[string]any
	requests []fakeRequest
}

type fakeRequest struct {
	Method, Path string
	Body         map[string]any
}

func newFakeAPI(t *testing.T) (*fakeAPI, string) {
	t.Helper()
	api := &fakeAPI{
		t:        t,
		signals:  map[string]map[string]any{},
		datasets: map[string]map[string]any{},
		profiles: map[string]map[string]any{},
		secrets:  map[string]map[string]any{},
	}
	server := httptest.NewServer(api)
	t.Cleanup(server.Close)
	return api, server.URL
}

// lastRequest returns the body of the most recent request matching method and path prefix.
func (f *fakeAPI) lastRequest(method, pathPrefix string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.requests) - 1; i >= 0; i-- {
		if r := f.requests[i]; r.Method == method && strings.HasPrefix(r.Path, pathPrefix) {
			return r.Body
		}
	}
	return nil
}

func (f *fakeAPI) storedSecrets(id string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.secrets[id]
}

func (f *fakeAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r.Header.Get("Authorization") != "Bearer test-key" {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return
	}
	var body map[string]any
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	f.requests = append(f.requests, fakeRequest{Method: r.Method, Path: r.URL.Path, Body: body})

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 2 || parts[0] != "v1" {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
		return
	}
	id := ""
	if len(parts) == 3 {
		id = parts[2]
	}
	switch parts[1] {
	case "project":
		writeJSON(w, http.StatusOK, map[string]any{"projectId": fakeProjectID})
	case "signals":
		f.serveCollection(w, r, id, body, f.signals, f.createSignal, f.updateSignal, func(items []any) any {
			name := r.URL.Query().Get("name")
			var matched []any
			for _, item := range items {
				if strings.Contains(strings.ToLower(item.(map[string]any)["name"].(string)), strings.ToLower(name)) {
					matched = append(matched, item)
				}
			}
			return map[string]any{"signals": nonNil(matched)}
		})
	case "datasets":
		f.serveCollection(w, r, id, body, f.datasets, f.createDataset, f.updateDataset, func(items []any) any {
			name := r.URL.Query().Get("name")
			var matched []any
			for _, item := range items {
				if name == "" || item.(map[string]any)["name"] == name {
					matched = append(matched, item)
				}
			}
			return nonNil(matched)
		})
	case "llm-profiles":
		f.serveCollection(w, r, id, body, f.profiles, f.createProfile, f.updateProfile, func(items []any) any {
			return map[string]any{"llmProfiles": nonNil(items)}
		})
	default:
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
	}
}

func (f *fakeAPI) serveCollection(
	w http.ResponseWriter, r *http.Request, id string, body map[string]any, items map[string]map[string]any,
	create func(string, map[string]any) map[string]any,
	update func(map[string]any, map[string]any),
	list func([]any) any,
) {
	switch {
	case id == "" && r.Method == http.MethodGet:
		keys := make([]string, 0, len(items))
		for key := range items {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		all := make([]any, 0, len(keys))
		for _, key := range keys {
			all = append(all, items[key])
		}
		writeJSON(w, http.StatusOK, list(all))
	case id == "" && r.Method == http.MethodPost:
		f.nextID++
		newID := fmt.Sprintf("00000000-0000-0000-0000-%012d", f.nextID)
		items[newID] = create(newID, body)
		writeJSON(w, http.StatusOK, items[newID])
	case items[id] == nil:
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "not found"})
	case r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, items[id])
	case r.Method == http.MethodPatch:
		update(items[id], body)
		writeJSON(w, http.StatusOK, items[id])
	case r.Method == http.MethodDelete:
		writeJSON(w, http.StatusOK, items[id])
		delete(items, id)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "method not allowed"})
	}
}

func (f *fakeAPI) createSignal(id string, body map[string]any) map[string]any {
	signal := map[string]any{
		"id": id, "projectId": fakeProjectID, "createdAt": "2026-09-07T10:00:00Z", "version": float64(1),
		"sampleRate": nil, "disabled": false, "mode": "realtime",
		"trigger":      map[string]any{"type": "rootSpanFinished"},
		"filters":      []any{map[string]any{"column": "total_token_count", "operator": "gt", "value": "1000"}},
		"llmProfileId": nil, "llmProfileName": nil, "model": nil,
	}
	for key, value := range body {
		signal[key] = value
	}
	f.resolveProfileName(signal)
	return signal
}

func (f *fakeAPI) updateSignal(signal, body map[string]any) {
	for key, value := range body {
		signal[key] = value
	}
	signal["version"] = signal["version"].(float64) + 1
	f.resolveProfileName(signal)
}

func (f *fakeAPI) resolveProfileName(signal map[string]any) {
	if id, ok := signal["llmProfileId"].(string); ok && f.profiles[id] != nil {
		signal["llmProfileName"] = f.profiles[id]["name"]
	}
}

func (f *fakeAPI) createDataset(id string, body map[string]any) map[string]any {
	return map[string]any{"id": id, "name": body["name"], "projectId": fakeProjectID, "createdAt": "2026-09-07T10:00:00Z"}
}

func (f *fakeAPI) updateDataset(dataset, body map[string]any) { dataset["name"] = body["name"] }

func (f *fakeAPI) createProfile(id string, body map[string]any) map[string]any {
	profile := map[string]any{"id": id, "workspaceId": fakeWorkspaceID, "createdAt": "2026-09-07T10:00:00Z"}
	f.secrets[id] = map[string]any{}
	f.updateProfile(profile, body)
	return profile
}

func (f *fakeAPI) updateProfile(profile, body map[string]any) {
	for _, key := range []string{"name", "provider", "config", "models"} {
		if value, ok := body[key]; ok {
			profile[key] = value
		}
	}
	stored := f.secrets[profile["id"].(string)]
	incoming, _ := body["secrets"].(map[string]any)
	for key, value := range incoming {
		if key == "headers" {
			headers, _ := stored["headers"].(map[string]any)
			if headers == nil {
				headers = map[string]any{}
			}
			for name, v := range value.(map[string]any) {
				headers[name] = v
			}
			stored["headers"] = headers
			continue
		}
		stored[key] = value
	}
	// Keep only the header values listed in headerNames, like prune_secrets.
	config, _ := profile["config"].(map[string]any)
	names, _ := config["headerNames"].([]any)
	headers, _ := stored["headers"].(map[string]any)
	kept := map[string]any{}
	masked := []any{}
	for _, name := range names {
		if v, ok := headers[name.(string)]; ok {
			kept[name.(string)] = v
			masked = append(masked, name)
		}
	}
	stored["headers"] = kept
	mask := func(key string) any {
		if v, ok := stored[key].(string); ok && v != "" {
			return "***"
		}
		return nil
	}
	profile["secrets"] = map[string]any{
		"apiKey": mask("apiKey"), "secretAccessKey": mask("secretAccessKey"), "token": mask("token"), "headers": masked,
	}
	profile["updatedAt"] = "2026-09-07T11:00:00Z"
}

func nonNil(items []any) []any {
	if items == nil {
		return []any{}
	}
	return items
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func providerConfig(baseURL string) string {
	return fmt.Sprintf(`
provider "laminar" {
  project_api_key = "test-key"
  base_url        = %q
}
`, baseURL)
}
