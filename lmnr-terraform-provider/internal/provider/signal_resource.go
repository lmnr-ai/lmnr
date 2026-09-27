package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework-jsontypes/jsontypes"
	"github.com/hashicorp/terraform-plugin-framework-validators/int64validator"
	"github.com/hashicorp/terraform-plugin-framework-validators/listvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/attr"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/booldefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/listdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/objectdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var (
	_ resource.Resource                   = &SignalResource{}
	_ resource.ResourceWithImportState    = &SignalResource{}
	_ resource.ResourceWithValidateConfig = &SignalResource{}
)

const (
	triggerRootSpanFinished = "rootSpanFinished"
	triggerSpanName         = "spanName"
)

// Operators and value shapes per filter column, mirroring the app-server's
// `FILTER_COLUMNS` so invalid filters fail at plan time.
var signalFilterColumns = map[string]struct {
	operators []string
	listValue bool
	oneOf     []string
}{
	"total_token_count": {operators: []string{"eq", "ne", "gt", "gte", "lt", "lte"}},
	"status":            {operators: []string{"eq", "ne"}, oneOf: []string{"error", "success"}},
	"span_names":        {operators: []string{"includes", "not_includes"}, listValue: true},
	"tags":              {operators: []string{"includes", "not_includes"}, listValue: true},
}

var signalTriggerAttrTypes = map[string]attr.Type{
	"type":       types.StringType,
	"span_names": types.ListType{ElemType: types.StringType},
}

var signalFilterAttrTypes = map[string]attr.Type{
	"column":   types.StringType,
	"operator": types.StringType,
	"value":    types.StringType,
	"values":   types.ListType{ElemType: types.StringType},
}

type SignalResource struct{ client *client.Client }

type signalModel struct {
	ID               types.String         `tfsdk:"id"`
	ProjectID        types.String         `tfsdk:"project_id"`
	Name             types.String         `tfsdk:"name"`
	Prompt           types.String         `tfsdk:"prompt"`
	StructuredOutput jsontypes.Normalized `tfsdk:"structured_output"`
	SampleRate       types.Int64          `tfsdk:"sample_rate"`
	Disabled         types.Bool           `tfsdk:"disabled"`
	Mode             types.String         `tfsdk:"mode"`
	Trigger          types.Object         `tfsdk:"trigger"`
	Filters          types.List           `tfsdk:"filters"`
	LlmProfileID     types.String         `tfsdk:"llm_profile_id"`
	Model            types.String         `tfsdk:"model"`
	LlmProfileName   types.String         `tfsdk:"llm_profile_name"`
	Version          types.Int64          `tfsdk:"version"`
	CreatedAt        types.String         `tfsdk:"created_at"`
}

type signalTriggerModel struct {
	Type      types.String `tfsdk:"type"`
	SpanNames types.List   `tfsdk:"span_names"`
}

type signalFilterModel struct {
	Column   types.String `tfsdk:"column"`
	Operator types.String `tfsdk:"operator"`
	Value    types.String `tfsdk:"value"`
	Values   types.List   `tfsdk:"values"`
}

func NewSignalResource() resource.Resource { return &SignalResource{} }

func (r *SignalResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_signal"
}

func defaultSignalTrigger() types.Object {
	return types.ObjectValueMust(signalTriggerAttrTypes, map[string]attr.Value{
		"type":       types.StringValue(triggerRootSpanFinished),
		"span_names": types.ListNull(types.StringType),
	})
}

// defaultSignalFilters matches the app-server default, which skips trivial traces.
func defaultSignalFilters() types.List {
	filter := types.ObjectValueMust(signalFilterAttrTypes, map[string]attr.Value{
		"column":   types.StringValue("total_token_count"),
		"operator": types.StringValue("gt"),
		"value":    types.StringValue("1000"),
		"values":   types.ListNull(types.StringType),
	})
	return types.ListValueMust(types.ObjectType{AttrTypes: signalFilterAttrTypes}, []attr.Value{filter})
}

func (r *SignalResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	columns := make([]string, 0, len(signalFilterColumns))
	for column := range signalFilterColumns {
		columns = append(columns, column)
	}
	slices.Sort(columns)

	resp.Schema = schema.Schema{
		MarkdownDescription: "Manages a Laminar Signal: an LLM-evaluated question asked about each matching trace in the project.\n\n" +
			"~> **Warning:** Destroying a Signal permanently deletes its events and alerts. Prefer `disabled = true`, or protect the resource with `lifecycle { prevent_destroy = true }`.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true, MarkdownDescription: "Signal UUID.",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"project_id": schema.StringAttribute{
				Computed: true, MarkdownDescription: "UUID of the project that owns the Signal.",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"name": schema.StringAttribute{
				Required: true, MarkdownDescription: "Signal name, unique within the project.",
				Validators: []validator.String{stringvalidator.UTF8LengthAtMost(255), trimmedValidator{}},
			},
			"prompt": schema.StringAttribute{
				Required: true, MarkdownDescription: "Instructions the LLM follows when evaluating a trace.",
				Validators: []validator.String{stringvalidator.LengthAtLeast(1)},
			},
			"structured_output": schema.StringAttribute{
				Required: true, CustomType: jsontypes.NormalizedType{},
				MarkdownDescription: "JSON Schema of the Signal result, usually written with `jsonencode()`. " +
					"It must be an object schema whose `properties` are `string`, `number`, or `boolean` and whose `required` lists every property.",
			},
			"sample_rate": schema.Int64Attribute{
				Optional: true, MarkdownDescription: "Percentage of matching traces to evaluate (1-95). Omit to evaluate every matching trace.",
				Validators: []validator.Int64{int64validator.Between(1, 95)},
			},
			"disabled": schema.BoolAttribute{
				Optional: true, Computed: true, Default: booldefault.StaticBool(false),
				MarkdownDescription: "Whether the Signal is paused. Defaults to `false`.",
			},
			"mode": schema.StringAttribute{
				Optional: true, Computed: true, Default: stringdefault.StaticString("realtime"),
				MarkdownDescription: "Processing mode: `realtime` or `batch`. Defaults to `realtime`.",
				Validators:          []validator.String{stringvalidator.OneOf("batch", "realtime")},
			},
			"trigger": schema.SingleNestedAttribute{
				Optional: true, Computed: true, Default: objectdefault.StaticValue(defaultSignalTrigger()),
				MarkdownDescription: "When the Signal is evaluated. Defaults to `{ type = \"rootSpanFinished\" }`.",
				Attributes: map[string]schema.Attribute{
					"type": schema.StringAttribute{
						Required:            true,
						MarkdownDescription: "`rootSpanFinished` evaluates when the trace's root span ends; `spanName` evaluates when a span named in `span_names` ends.",
						Validators:          []validator.String{stringvalidator.OneOf(triggerRootSpanFinished, triggerSpanName)},
					},
					"span_names": schema.ListAttribute{
						Optional: true, ElementType: types.StringType,
						MarkdownDescription: "Span names that trigger evaluation. Required when `type` is `spanName`.",
						Validators: []validator.List{
							listvalidator.SizeAtLeast(1),
							listvalidator.ValueStringsAre(trimmedValidator{}),
						},
					},
				},
			},
			"filters": schema.ListNestedAttribute{
				Optional: true, Computed: true, Default: listdefault.StaticValue(defaultSignalFilters()),
				MarkdownDescription: "Conditions a trace must match to be evaluated; all must hold. " +
					"Defaults to `total_token_count gt 1000`. Set `filters = []` to evaluate every trace.",
				NestedObject: schema.NestedAttributeObject{
					Attributes: map[string]schema.Attribute{
						"column": schema.StringAttribute{
							Required:            true,
							MarkdownDescription: "Trace column: " + strings.Join(backtick(columns), ", ") + ".",
							Validators:          []validator.String{stringvalidator.OneOf(columns...)},
						},
						"operator": schema.StringAttribute{
							Required:            true,
							MarkdownDescription: "`eq`, `ne`, `gt`, `gte`, `lt`, `lte` for `total_token_count`; `eq`, `ne` for `status`; `includes`, `not_includes` for `span_names` and `tags`.",
						},
						"value": schema.StringAttribute{
							Optional:            true,
							MarkdownDescription: "Scalar value for `total_token_count` (a number) and `status` (`error` or `success`). Exactly one of `value` and `values` is required.",
							Validators: []validator.String{
								trimmedValidator{},
								stringvalidator.ExactlyOneOf(path.MatchRelative().AtParent().AtName("values")),
							},
						},
						"values": schema.ListAttribute{
							Optional: true, ElementType: types.StringType,
							MarkdownDescription: "List value for `span_names` and `tags`.",
							Validators: []validator.List{
								listvalidator.SizeAtLeast(1),
								listvalidator.ValueStringsAre(trimmedValidator{}),
							},
						},
					},
				},
			},
			"llm_profile_id": schema.StringAttribute{
				Optional: true, Computed: true,
				MarkdownDescription: "Self-hosted only. UUID of the workspace LLM profile that evaluates the Signal. Required together with `model` on self-hosted deployments; Laminar Cloud rejects it.",
				PlanModifiers:       []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
				Validators:          []validator.String{stringvalidator.AlsoRequires(path.MatchRoot("model"))},
			},
			"model": schema.StringAttribute{
				Optional: true, Computed: true,
				MarkdownDescription: "Self-hosted only. Model from `llm_profile_id` that evaluates the Signal.",
				PlanModifiers:       []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
				Validators:          []validator.String{trimmedValidator{}, stringvalidator.AlsoRequires(path.MatchRoot("llm_profile_id"))},
			},
			"llm_profile_name": schema.StringAttribute{Computed: true, MarkdownDescription: "Name of the selected LLM profile."},
			"version": schema.Int64Attribute{
				Computed:            true,
				MarkdownDescription: "Server-managed configuration version. It increments when the effective Signal configuration changes.",
			},
			"created_at": schema.StringAttribute{
				Computed: true, MarkdownDescription: "Creation timestamp (RFC 3339).",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
		},
	}
}

func backtick(values []string) []string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = "`" + v + "`"
	}
	return out
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

func (r *SignalResource) ValidateConfig(ctx context.Context, req resource.ValidateConfigRequest, resp *resource.ValidateConfigResponse) {
	var config signalModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	if known(config.Trigger) {
		var trigger signalTriggerModel
		resp.Diagnostics.Append(config.Trigger.As(ctx, &trigger, objectAsOptions)...)
		if known(trigger.Type) {
			switch {
			case trigger.Type.ValueString() == triggerSpanName && trigger.SpanNames.IsNull():
				resp.Diagnostics.AddAttributeError(path.Root("trigger").AtName("span_names"), "Missing span_names", "A `spanName` trigger needs at least one span name.")
			case trigger.Type.ValueString() == triggerRootSpanFinished && !trigger.SpanNames.IsNull():
				resp.Diagnostics.AddAttributeError(path.Root("trigger").AtName("span_names"), "Unexpected span_names", "`span_names` is only used by `spanName` triggers.")
			}
		}
	}

	if !known(config.Filters) {
		return
	}
	var filters []signalFilterModel
	resp.Diagnostics.Append(config.Filters.ElementsAs(ctx, &filters, false)...)
	for i, filter := range filters {
		if !known(filter.Column) {
			continue
		}
		at := path.Root("filters").AtListIndex(i)
		spec, ok := signalFilterColumns[filter.Column.ValueString()]
		if !ok {
			continue
		}
		if known(filter.Operator) && !slices.Contains(spec.operators, filter.Operator.ValueString()) {
			resp.Diagnostics.AddAttributeError(at.AtName("operator"), "Invalid filter operator",
				fmt.Sprintf("Column %q supports operators: %s.", filter.Column.ValueString(), strings.Join(spec.operators, ", ")))
		}
		if spec.listValue && !filter.Value.IsNull() {
			resp.Diagnostics.AddAttributeError(at.AtName("value"), "Use values", fmt.Sprintf("Column %q takes a list: set `values` instead of `value`.", filter.Column.ValueString()))
		}
		if !spec.listValue && !filter.Values.IsNull() {
			resp.Diagnostics.AddAttributeError(at.AtName("values"), "Use value", fmt.Sprintf("Column %q takes a scalar: set `value` instead of `values`.", filter.Column.ValueString()))
		}
		if !known(filter.Value) {
			continue
		}
		value := filter.Value.ValueString()
		if spec.oneOf != nil && !slices.Contains(spec.oneOf, value) {
			resp.Diagnostics.AddAttributeError(at.AtName("value"), "Invalid filter value", fmt.Sprintf("Column %q value must be one of: %s.", filter.Column.ValueString(), strings.Join(spec.oneOf, ", ")))
		}
		if filter.Column.ValueString() == "total_token_count" {
			if n, err := strconv.ParseFloat(value, 64); err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
				resp.Diagnostics.AddAttributeError(at.AtName("value"), "Invalid filter value", "total_token_count value must be a finite number.")
			}
		}
	}
}

func (r *SignalResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan signalModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	trigger := plan.triggerRequest(ctx, &resp.Diagnostics)
	filters := plan.filtersRequest(ctx, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	input := client.CreateSignalRequest{
		Name:             plan.Name.ValueString(),
		Prompt:           plan.Prompt.ValueString(),
		StructuredOutput: json.RawMessage(plan.StructuredOutput.ValueString()),
		SampleRate:       optionalInt(plan.SampleRate),
		Disabled:         optionalBool(plan.Disabled),
		Trigger:          trigger,
		Filters:          filters,
		Mode:             plan.Mode.ValueString(),
		LlmProfileID:     optionalString(plan.LlmProfileID),
		Model:            optionalString(plan.Model),
	}
	signal, err := r.client.CreateSignal(ctx, input)
	if err != nil {
		resp.Diagnostics.AddError("Unable to create Signal", err.Error())
		return
	}
	state := signalToModel(ctx, signal, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state signalModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	signal, err := r.client.GetSignal(ctx, state.ID.ValueString())
	if isNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Signal", err.Error())
		return
	}
	state = signalToModel(ctx, signal, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan signalModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	trigger := plan.triggerRequest(ctx, &resp.Diagnostics)
	filters := plan.filtersRequest(ctx, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	sampleRate := json.RawMessage("null")
	if rate := optionalInt(plan.SampleRate); rate != nil {
		sampleRate = json.RawMessage(strconv.FormatInt(*rate, 10))
	}
	name, prompt, mode := plan.Name.ValueString(), plan.Prompt.ValueString(), plan.Mode.ValueString()
	input := client.UpdateSignalRequest{
		Name:             &name,
		Prompt:           &prompt,
		StructuredOutput: json.RawMessage(plan.StructuredOutput.ValueString()),
		SampleRate:       sampleRate,
		Disabled:         optionalBool(plan.Disabled),
		Trigger:          trigger,
		Filters:          filters,
		Mode:             &mode,
		LlmProfileID:     optionalString(plan.LlmProfileID),
		Model:            optionalString(plan.Model),
	}
	signal, err := r.client.UpdateSignal(ctx, plan.ID.ValueString(), input)
	if err != nil {
		resp.Diagnostics.AddError("Unable to update Signal", err.Error())
		return
	}
	state := signalToModel(ctx, signal, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *SignalResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state signalModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.DeleteSignal(ctx, state.ID.ValueString()); err != nil && !isNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete Signal", err.Error())
	}
}

func (r *SignalResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

func (m signalModel) triggerRequest(ctx context.Context, diags *diag.Diagnostics) *client.SignalTrigger {
	if !known(m.Trigger) {
		return nil
	}
	var trigger signalTriggerModel
	diags.Append(m.Trigger.As(ctx, &trigger, objectAsOptions)...)
	return &client.SignalTrigger{
		Type:      trigger.Type.ValueString(),
		SpanNames: stringList(ctx, trigger.SpanNames, diags),
	}
}

// filtersRequest never returns nil: an omitted `filters` field would make the
// API apply its default, while Terraform always plans an explicit list.
func (m signalModel) filtersRequest(ctx context.Context, diags *diag.Diagnostics) []client.SignalFilter {
	out := []client.SignalFilter{}
	if !known(m.Filters) {
		return out
	}
	var filters []signalFilterModel
	diags.Append(m.Filters.ElementsAs(ctx, &filters, false)...)
	for _, filter := range filters {
		var value any
		if known(filter.Value) {
			value = filter.Value.ValueString()
		} else {
			value = stringList(ctx, filter.Values, diags)
		}
		raw, err := json.Marshal(value)
		if err != nil {
			diags.AddError("Unable to encode filter value", err.Error())
			return out
		}
		out = append(out, client.SignalFilter{Column: filter.Column.ValueString(), Operator: filter.Operator.ValueString(), Value: raw})
	}
	return out
}

func signalToModel(ctx context.Context, signal *client.Signal, diags *diag.Diagnostics) signalModel {
	model := signalModel{
		ID:               types.StringValue(signal.ID),
		ProjectID:        types.StringValue(signal.ProjectID),
		Name:             types.StringValue(signal.Name),
		Prompt:           types.StringValue(signal.Prompt),
		StructuredOutput: jsontypes.NewNormalizedValue(canonicalJSON(signal.StructuredOutput)),
		SampleRate:       types.Int64Null(),
		Disabled:         types.BoolValue(signal.Disabled),
		Mode:             types.StringValue(signal.Mode),
		LlmProfileID:     stringOrNull(signal.LlmProfileID),
		Model:            stringOrNull(signal.Model),
		LlmProfileName:   stringOrNull(signal.LlmProfileName),
		Version:          types.Int64Value(signal.Version),
		CreatedAt:        types.StringValue(signal.CreatedAt),
	}
	if signal.SampleRate != nil {
		model.SampleRate = types.Int64Value(*signal.SampleRate)
	}

	trigger, d := types.ObjectValueFrom(ctx, signalTriggerAttrTypes, signalTriggerModel{
		Type:      types.StringValue(signal.Trigger.Type),
		SpanNames: listOfStrings(signal.Trigger.SpanNames),
	})
	diags.Append(d...)
	model.Trigger = trigger

	filters := make([]signalFilterModel, 0, len(signal.Filters))
	for _, filter := range signal.Filters {
		item := signalFilterModel{
			Column:   types.StringValue(filter.Column),
			Operator: types.StringValue(filter.Operator),
			Value:    types.StringNull(),
			Values:   types.ListNull(types.StringType),
		}
		switch raw := strings.TrimSpace(string(filter.Value)); {
		case raw == "" || raw == "null":
		case strings.HasPrefix(raw, "["):
			var values []string
			if err := json.Unmarshal(filter.Value, &values); err != nil {
				diags.AddError("Unexpected filter value", fmt.Sprintf("column %q: %s", filter.Column, err))
			}
			item.Values = listOfStrings(values)
		case strings.HasPrefix(raw, `"`):
			var value string
			if err := json.Unmarshal(filter.Value, &value); err != nil {
				diags.AddError("Unexpected filter value", fmt.Sprintf("column %q: %s", filter.Column, err))
			}
			item.Value = types.StringValue(value)
		default:
			// Numbers written by the UI; configuration always holds them as strings.
			item.Value = types.StringValue(raw)
		}
		filters = append(filters, item)
	}
	list, d := types.ListValueFrom(ctx, types.ObjectType{AttrTypes: signalFilterAttrTypes}, filters)
	diags.Append(d...)
	model.Filters = list
	return model
}
