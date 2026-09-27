package client_test

import (
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

// The provider is hand-written because tfplugingen-openapi cannot map the
// allOf/oneOf schemas the API uses. This test keeps the client's wire types in
// step with the vendored spec (`make sync-openapi` refreshes it).

type specSchema struct {
	Ref        string                 `yaml:"$ref"`
	Properties map[string]*specSchema `yaml:"properties"`
	AllOf      []*specSchema          `yaml:"allOf"`
	OneOf      []*specSchema          `yaml:"oneOf"`
}

type spec struct {
	Paths      map[string]map[string]any `yaml:"paths"`
	Components struct {
		Schemas map[string]*specSchema `yaml:"schemas"`
	} `yaml:"components"`
}

func loadSpec(t *testing.T) *spec {
	t.Helper()
	data, err := os.ReadFile("../../openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var s spec
	if err := yaml.Unmarshal(data, &s); err != nil {
		t.Fatal(err)
	}
	return &s
}

func (s *spec) resolve(t *testing.T, schema *specSchema) *specSchema {
	t.Helper()
	for schema.Ref != "" {
		name := strings.TrimPrefix(schema.Ref, "#/components/schemas/")
		next, ok := s.Components.Schemas[name]
		if !ok {
			t.Fatalf("unresolved $ref %s", schema.Ref)
		}
		schema = next
	}
	return schema
}

// properties returns the property names of a schema, merging allOf branches
// and taking the union of oneOf branches.
func (s *spec) properties(t *testing.T, name string) map[string]bool {
	t.Helper()
	root, ok := s.Components.Schemas[name]
	if !ok {
		t.Fatalf("schema %s missing from spec", name)
	}
	props := map[string]bool{}
	var walk func(*specSchema)
	walk = func(schema *specSchema) {
		schema = s.resolve(t, schema)
		for prop := range schema.Properties {
			props[prop] = true
		}
		for _, sub := range append(append([]*specSchema{}, schema.AllOf...), schema.OneOf...) {
			walk(sub)
		}
	}
	walk(root)
	return props
}

func jsonFields(value any) map[string]bool {
	fields := map[string]bool{}
	typ := reflect.TypeOf(value)
	for i := range typ.NumField() {
		tag := strings.Split(typ.Field(i).Tag.Get("json"), ",")[0]
		if tag != "" && tag != "-" {
			fields[tag] = true
		}
	}
	return fields
}

func sortedNames(set map[string]bool) []string {
	names := make([]string, 0, len(set))
	for name := range set {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func TestClientTypesMatchOpenAPISpec(t *testing.T) {
	t.Parallel()
	s := loadSpec(t)

	cases := []struct {
		schema string
		value  any
	}{
		{"Signal", client.Signal{}},
		{"SignalTrigger", client.SignalTrigger{}},
		{"SignalFilter", client.SignalFilter{}},
		{"CreateSignalRequest", client.CreateSignalRequest{}},
		{"UpdateSignalRequest", client.UpdateSignalRequest{}},
		{"SignalList", struct {
			Signals []client.Signal `json:"signals"`
		}{}},
		{"Dataset", client.Dataset{}},
		{"DatasetNameRequest", client.DatasetNameRequest{}},
		{"LlmProfile", client.LlmProfile{}},
		{"LlmProfileConfig", client.LlmProfileConfig{}},
		{"LlmProfileAuth", client.LlmProfileAuth{}},
		{"LlmProfileSecretsInput", client.LlmProfileSecrets{}},
		{"LlmProfileSecrets", client.LlmProfileSecretsMask{}},
		{"CreateLlmProfileRequest", client.CreateLlmProfileRequest{}},
		{"UpdateLlmProfileRequest", client.UpdateLlmProfileRequest{}},
		{"LlmProfileList", struct {
			LlmProfiles []client.LlmProfile `json:"llmProfiles"`
		}{}},
	}
	for _, tc := range cases {
		t.Run(tc.schema, func(t *testing.T) {
			want := s.properties(t, tc.schema)
			got := jsonFields(tc.value)
			if !reflect.DeepEqual(got, want) {
				t.Errorf("%s fields = %v, spec properties = %v", tc.schema, sortedNames(got), sortedNames(want))
			}
		})
	}
}

func TestClientPathsExistInOpenAPISpec(t *testing.T) {
	t.Parallel()
	s := loadSpec(t)
	operations := map[string][]string{
		"/v1/project":                   {"get"},
		"/v1/signals":                   {"get", "post"},
		"/v1/signals/{signal_id}":       {"get", "patch", "delete"},
		"/v1/datasets":                  {"get", "post"},
		"/v1/datasets/{dataset_id}":     {"get", "patch", "delete"},
		"/v1/llm-profiles":              {"get", "post"},
		"/v1/llm-profiles/{profile_id}": {"get", "patch", "delete"},
	}
	for path, methods := range operations {
		item, ok := s.Paths[path]
		if !ok {
			t.Errorf("path %s missing from spec", path)
			continue
		}
		for _, method := range methods {
			if _, ok := item[method]; !ok {
				t.Errorf("operation %s %s missing from spec", strings.ToUpper(method), path)
			}
		}
	}
}
