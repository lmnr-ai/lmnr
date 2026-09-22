package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework-jsontypes/jsontypes"
	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var _ resource.Resource = &SignalResource{}
var _ resource.ResourceWithImportState = &SignalResource{}

type SignalResource struct{ client *client.Client }

type SignalResourceModel struct {
	ID               types.String         `tfsdk:"id"`
	ProjectID        types.String         `tfsdk:"project_id"`
	Name             types.String         `tfsdk:"name"`
	Prompt           types.String         `tfsdk:"prompt"`
	StructuredOutput jsontypes.Normalized `tfsdk:"structured_output"`
	SampleRate       types.Int64          `tfsdk:"sample_rate"`
	Disabled         types.Bool           `tfsdk:"disabled"`
	Trigger          jsontypes.Normalized `tfsdk:"trigger"`
	Filters          jsontypes.Normalized `tfsdk:"filters"`
	Mode             types.String         `tfsdk:"mode"`
	CreatedAt        types.String         `tfsdk:"created_at"`
	CurrentVersion   types.Int64          `tfsdk:"current_version"`
}

func NewSignalResource() resource.Resource { return &SignalResource{} }

func (r *SignalResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_signal"
}

func signalSchema(configurableID bool) schema.Schema {
	id := schema.StringAttribute{Computed: true, MarkdownDescription: "Signal UUID.", PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}}
	if configurableID {
		id = schema.StringAttribute{Required: true, MarkdownDescription: "Signal UUID."}
	}
	return schema.Schema{
		MarkdownDescription: "A Laminar Signal.",
		Attributes: map[string]schema.Attribute{
			"id":                id,
			"project_id":        schema.StringAttribute{Computed: true, MarkdownDescription: "Owning Laminar project UUID."},
			"name":              schema.StringAttribute{Required: !configurableID, Computed: configurableID, MarkdownDescription: "Signal name. Leading and trailing whitespace is not allowed.", Validators: []validator.String{stringvalidator.UTF8LengthBetween(1, 255), noSurroundingWhitespaceValidator{}}},
			"prompt":            schema.StringAttribute{Required: !configurableID, Computed: configurableID, MarkdownDescription: "Instructions used to analyze matching traces.", Validators: []validator.String{stringvalidator.UTF8LengthAtLeast(1)}},
			"structured_output": schema.StringAttribute{Required: !configurableID, Computed: configurableID, CustomType: jsontypes.NormalizedType{}, MarkdownDescription: "JSON-encoded JSON Schema for the Signal result."},
			"sample_rate":       schema.Int64Attribute{Optional: !configurableID, Computed: configurableID, MarkdownDescription: "Percentage of matching traces to sample.", Validators: []validator.Int64{int64validator.Between(1, 95)}},
			"disabled":          schema.BoolAttribute{Optional: !configurableID, Computed: true, MarkdownDescription: "Whether the Signal is paused."},
			"trigger":           schema.StringAttribute{Optional: !configurableID, Computed: true, CustomType: jsontypes.NormalizedType{}, MarkdownDescription: "JSON-encoded trigger. The API defaults to rootSpanFinished."},
			"filters":           schema.StringAttribute{Optional: !configurableID, Computed: true, CustomType: jsontypes.NormalizedType{}, MarkdownDescription: "JSON-encoded Signal filters. The API supplies the default when omitted."},
			"mode":              schema.StringAttribute{Optional: !configurableID, Computed: true, MarkdownDescription: "Processing mode.", Validators: []validator.String{stringvalidator.OneOf("batch", "realtime")}},
			"created_at":        schema.StringAttribute{Computed: true, MarkdownDescription: "Creation timestamp."},
			"current_version":   schema.Int64Attribute{Computed: true, MarkdownDescription: "Server-managed prompt and output-schema version."},
		},
	}
}

func (r *SignalResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = signalSchema(false)
}

func (r *SignalResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	api, err := configureClient(req.ProviderData)
	if err != nil {
		resp.Diagnostics.AddError("Unexpected resource configuration", err.Error())
		return
	}
	r.client = api
}

type noSurroundingWhitespaceValidator struct{}

func (noSurroundingWhitespaceValidator) Description(context.Context) string {
	return "value must not contain leading or trailing whitespace"
}
func (v noSurroundingWhitespaceValidator) MarkdownDescription(ctx context.Context) string {
	return v.Description(ctx)
}
func (noSurroundingWhitespaceValidator) ValidateString(_ context.Context, req validator.StringRequest, resp *validator.StringResponse) {
	if req.ConfigValue.IsNull() || req.ConfigValue.IsUnknown() {
		return
	}
	if value := req.ConfigValue.ValueString(); value != strings.TrimSpace(value) {
		resp.Diagnostics.AddAttributeError(req.Path, "Invalid whitespace", "Value must not contain leading or trailing whitespace.")
	}
}

func rawJSON(value jsontypes.Normalized) (json.RawMessage, error) {
	if value.IsNull() || value.IsUnknown() {
		return nil, nil
	}
	raw := json.RawMessage(value.ValueString())
	if !json.Valid(raw) {
		return nil, fmt.Errorf("invalid JSON")
	}
	return raw, nil
}

func validatedTrigger(value jsontypes.Normalized) (json.RawMessage, error) {
	raw, err := rawJSON(value)
	if err != nil || raw == nil {
		return raw, err
	}
	var trigger struct {
		Type      string   `json:"type"`
		SpanNames []string `json:"spanNames"`
	}
	if err := json.Unmarshal(raw, &trigger); err != nil {
		return nil, err
	}
	if trigger.Type == "spanName" {
		for _, name := range trigger.SpanNames {
			if name == "" || name != strings.TrimSpace(name) {
				return nil, fmt.Errorf("trigger spanNames must be non-empty and contain no surrounding whitespace")
			}
		}
	}
	return raw, nil
}

func validatedFilters(value jsontypes.Normalized) (json.RawMessage, error) {
	raw, err := rawJSON(value)
	if err != nil || raw == nil {
		return raw, err
	}
	var filters []struct {
		Value any `json:"value"`
	}
	if err := json.Unmarshal(raw, &filters); err != nil {
		return nil, fmt.Errorf("filters must be a JSON array: %w", err)
	}
	for _, filter := range filters {
		switch value := filter.Value.(type) {
		case string:
			if value != strings.TrimSpace(value) {
				return nil, fmt.Errorf("filter string values must contain no surrounding whitespace")
			}
		case []any:
			for _, item := range value {
				text, ok := item.(string)
				if !ok || text == "" || text != strings.TrimSpace(text) {
					return nil, fmt.Errorf("filter list values must be non-empty strings with no surrounding whitespace")
				}
			}
		}
	}
	return raw, nil
}

func optionalInt(value types.Int64) *int64 {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	v := value.ValueInt64()
	return &v
}
func optionalBool(value types.Bool) *bool {
	if value.IsNull() || value.IsUnknown() {
		return nil
	}
	v := value.ValueBool()
	return &v
}

func (r *SignalResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan SignalResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	structured, err := rawJSON(plan.StructuredOutput)
	if err != nil {
		resp.Diagnostics.AddError("Invalid structured_output", err.Error())
		return
	}
	trigger, err := validatedTrigger(plan.Trigger)
	if err != nil {
		resp.Diagnostics.AddError("Invalid trigger", err.Error())
		return
	}
	filters, err := validatedFilters(plan.Filters)
	if err != nil {
		resp.Diagnostics.AddError("Invalid filters", err.Error())
		return
	}
	input := client.CreateSignalRequest{Name: plan.Name.ValueString(), Prompt: plan.Prompt.ValueString(), StructuredOutput: structured, SampleRate: optionalInt(plan.SampleRate), Disabled: optionalBool(plan.Disabled), Trigger: trigger, Filters: filters}
	if !plan.Mode.IsNull() && !plan.Mode.IsUnknown() {
		input.Mode = plan.Mode.ValueString()
	}
	signal, err := r.client.CreateSignal(ctx, input)
	if err != nil {
		resp.Diagnostics.AddError("Unable to create Signal", err.Error())
		return
	}
	state, err := signalState(signal)
	if err != nil {
		resp.Diagnostics.AddError("Unable to store Signal state", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state SignalResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	signal, err := r.client.GetSignal(ctx, state.ID.ValueString())
	if errors.Is(err, client.ErrNotFound) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Signal", err.Error())
		return
	}
	state, err = signalState(signal)
	if err != nil {
		resp.Diagnostics.AddError("Unable to store Signal state", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan SignalResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	structured, err := rawJSON(plan.StructuredOutput)
	if err != nil {
		resp.Diagnostics.AddError("Invalid structured_output", err.Error())
		return
	}
	trigger, err := validatedTrigger(plan.Trigger)
	if err != nil {
		resp.Diagnostics.AddError("Invalid trigger", err.Error())
		return
	}
	filters, err := validatedFilters(plan.Filters)
	if err != nil {
		resp.Diagnostics.AddError("Invalid filters", err.Error())
		return
	}
	var prior SignalResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &prior)...)
	if resp.Diagnostics.HasError() {
		return
	}
	name, prompt := plan.Name.ValueString(), plan.Prompt.ValueString()
	input := client.UpdateSignalRequest{Name: &name, Prompt: &prompt, StructuredOutput: &structured, Disabled: optionalBool(plan.Disabled), Trigger: trigger, Filters: filters}
	if plan.SampleRate.IsNull() && !prior.SampleRate.IsNull() {
		var cleared *int64
		input.SampleRate = &cleared
	}
	if !plan.Mode.IsNull() && !plan.Mode.IsUnknown() {
		mode := plan.Mode.ValueString()
		input.Mode = &mode
	}
	if rate := optionalInt(plan.SampleRate); rate != nil {
		input.SampleRate = &rate
	}
	signal, err := r.client.UpdateSignal(ctx, plan.ID.ValueString(), input)
	if err != nil {
		resp.Diagnostics.AddError("Unable to update Signal", err.Error())
		return
	}
	state, err := signalState(signal)
	if err != nil {
		resp.Diagnostics.AddError("Unable to store Signal state", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state SignalResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.DeleteSignal(ctx, state.ID.ValueString()); err != nil && !errors.Is(err, client.ErrNotFound) {
		resp.Diagnostics.AddError("Unable to delete Signal", err.Error())
	}
}

func (r *SignalResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

func signalState(signal *client.Signal) (SignalResourceModel, error) {
	structured, err := canonicalJSON(signal.StructuredOutput)
	if err != nil {
		return SignalResourceModel{}, err
	}
	trigger, err := canonicalJSON(signal.Trigger)
	if err != nil {
		return SignalResourceModel{}, err
	}
	filters, err := canonicalJSON(signal.Filters)
	if err != nil {
		return SignalResourceModel{}, err
	}
	state := SignalResourceModel{ID: types.StringValue(signal.ID), ProjectID: types.StringValue(signal.ProjectID), Name: types.StringValue(signal.Name), Prompt: types.StringValue(signal.Prompt), StructuredOutput: jsontypes.NewNormalizedValue(structured), Disabled: types.BoolValue(signal.Disabled), Trigger: jsontypes.NewNormalizedValue(trigger), Filters: jsontypes.NewNormalizedValue(filters), Mode: types.StringValue(signal.Mode), CreatedAt: types.StringValue(signal.CreatedAt), CurrentVersion: types.Int64Value(signal.CurrentVersion)}
	if signal.SampleRate == nil {
		state.SampleRate = types.Int64Null()
	} else {
		state.SampleRate = types.Int64Value(*signal.SampleRate)
	}
	return state, nil
}

func canonicalJSON(raw json.RawMessage) (string, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	encoded, err := json.Marshal(value)
	return string(encoded), err
}
