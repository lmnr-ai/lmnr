package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/hashicorp/terraform-plugin-framework/types/basetypes"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

func configureClient(data any) (*client.Client, error) {
	api, ok := data.(*client.Client)
	if !ok {
		return nil, fmt.Errorf("expected *client.Client, got %T", data)
	}
	return api, nil
}

var objectAsOptions = basetypes.ObjectAsOptions{}

func isNotFound(err error) bool { return errors.Is(err, client.ErrNotFound) }

func known(value interface {
	IsNull() bool
	IsUnknown() bool
}) bool {
	return !value.IsNull() && !value.IsUnknown()
}

func optionalString(value types.String) *string {
	if !known(value) {
		return nil
	}
	v := value.ValueString()
	return &v
}

func optionalInt(value types.Int64) *int64 {
	if !known(value) {
		return nil
	}
	v := value.ValueInt64()
	return &v
}

func optionalBool(value types.Bool) *bool {
	if !known(value) {
		return nil
	}
	v := value.ValueBool()
	return &v
}

func stringOrNull(value *string) types.String {
	if value == nil {
		return types.StringNull()
	}
	return types.StringValue(*value)
}

func stringList(ctx context.Context, value types.List, diags *diag.Diagnostics) []string {
	if !known(value) {
		return nil
	}
	var out []string
	diags.Append(value.ElementsAs(ctx, &out, false)...)
	return out
}

func stringSet(ctx context.Context, value types.Set, diags *diag.Diagnostics) []string {
	if !known(value) {
		return nil
	}
	var out []string
	diags.Append(value.ElementsAs(ctx, &out, false)...)
	return out
}

func listOfStrings(values []string) types.List {
	if values == nil {
		return types.ListNull(types.StringType)
	}
	elems := make([]string, len(values))
	copy(elems, values)
	list, _ := types.ListValueFrom(context.Background(), types.StringType, elems)
	return list
}

// trimmedValidator rejects values the API would trim, which would otherwise
// surface as a perpetual diff between configuration and state.
type trimmedValidator struct{}

func (trimmedValidator) Description(context.Context) string {
	return "value must be non-blank and must not contain leading or trailing whitespace"
}

func (v trimmedValidator) MarkdownDescription(ctx context.Context) string { return v.Description(ctx) }

func (trimmedValidator) ValidateString(_ context.Context, req validator.StringRequest, resp *validator.StringResponse) {
	if !known(req.ConfigValue) {
		return
	}
	value := req.ConfigValue.ValueString()
	if strings.TrimSpace(value) == "" {
		resp.Diagnostics.AddAttributeError(req.Path, "Invalid value", "Value must not be blank.")
		return
	}
	if value != strings.TrimSpace(value) {
		resp.Diagnostics.AddAttributeError(req.Path, "Invalid whitespace", "Value must not contain leading or trailing whitespace.")
	}
}

// canonicalJSON sorts object keys like Terraform's jsonencode, so imported
// state matches configuration byte for byte; the API does not preserve key order.
func canonicalJSON(raw json.RawMessage) string {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return string(raw)
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return string(raw)
	}
	return string(encoded)
}
