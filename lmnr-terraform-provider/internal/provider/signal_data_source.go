package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework-jsontypes/jsontypes"
	"github.com/hashicorp/terraform-plugin-framework-validators/datasourcevalidator"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var (
	_ datasource.DataSource                     = &SignalDataSource{}
	_ datasource.DataSourceWithConfigValidators = &SignalDataSource{}
)

type SignalDataSource struct{ client *client.Client }

func NewSignalDataSource() datasource.DataSource { return &SignalDataSource{} }

func (d *SignalDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_signal"
}

func (d *SignalDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Reads an existing Laminar Signal by `id` or exact `name`.",
		Attributes: map[string]schema.Attribute{
			"id":                schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "Signal UUID. Exactly one of `id` and `name` is required."},
			"name":              schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "Exact Signal name. Signal names are unique within a project."},
			"project_id":        schema.StringAttribute{Computed: true, MarkdownDescription: "UUID of the project that owns the Signal."},
			"prompt":            schema.StringAttribute{Computed: true, MarkdownDescription: "Evaluation instructions."},
			"structured_output": schema.StringAttribute{Computed: true, CustomType: jsontypes.NormalizedType{}, MarkdownDescription: "JSON Schema of the Signal result."},
			"sample_rate":       schema.Int64Attribute{Computed: true, MarkdownDescription: "Percentage of matching traces evaluated; null when every trace is evaluated."},
			"disabled":          schema.BoolAttribute{Computed: true, MarkdownDescription: "Whether the Signal is paused."},
			"mode":              schema.StringAttribute{Computed: true, MarkdownDescription: "Processing mode."},
			"trigger": schema.SingleNestedAttribute{
				Computed: true, MarkdownDescription: "When the Signal is evaluated.",
				Attributes: map[string]schema.Attribute{
					"type":       schema.StringAttribute{Computed: true, MarkdownDescription: "Trigger type."},
					"span_names": schema.ListAttribute{Computed: true, ElementType: types.StringType, MarkdownDescription: "Span names for `spanName` triggers."},
				},
			},
			"filters": schema.ListNestedAttribute{
				Computed: true, MarkdownDescription: "Conditions a trace must match to be evaluated.",
				NestedObject: schema.NestedAttributeObject{
					Attributes: map[string]schema.Attribute{
						"column":   schema.StringAttribute{Computed: true, MarkdownDescription: "Trace column."},
						"operator": schema.StringAttribute{Computed: true, MarkdownDescription: "Comparison operator."},
						"value":    schema.StringAttribute{Computed: true, MarkdownDescription: "Scalar value."},
						"values":   schema.ListAttribute{Computed: true, ElementType: types.StringType, MarkdownDescription: "List value."},
					},
				},
			},
			"llm_profile_id":   schema.StringAttribute{Computed: true, MarkdownDescription: "Self-hosted only. LLM profile UUID."},
			"model":            schema.StringAttribute{Computed: true, MarkdownDescription: "Self-hosted only. Model name."},
			"llm_profile_name": schema.StringAttribute{Computed: true, MarkdownDescription: "LLM profile name."},
			"version":          schema.Int64Attribute{Computed: true, MarkdownDescription: "Server-managed configuration version."},
			"created_at":       schema.StringAttribute{Computed: true, MarkdownDescription: "Creation timestamp (RFC 3339)."},
		},
	}
}

func (d *SignalDataSource) ConfigValidators(context.Context) []datasource.ConfigValidator {
	return []datasource.ConfigValidator{datasourcevalidator.ExactlyOneOf(path.MatchRoot("id"), path.MatchRoot("name"))}
}

func (d *SignalDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	api, err := configureClient(req.ProviderData)
	if err != nil {
		resp.Diagnostics.AddError("Unexpected data source configuration", err.Error())
		return
	}
	d.client = api
}

func (d *SignalDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var config signalModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	var signal *client.Signal
	if known(config.ID) {
		found, err := d.client.GetSignal(ctx, config.ID.ValueString())
		if err != nil {
			resp.Diagnostics.AddError("Unable to read Signal", err.Error())
			return
		}
		signal = found
	} else {
		// The list endpoint matches a name substring; keep only the exact match.
		name := config.Name.ValueString()
		signals, err := d.client.ListSignals(ctx, name)
		if err != nil {
			resp.Diagnostics.AddError("Unable to list Signals", err.Error())
			return
		}
		for i := range signals {
			if signals[i].Name == name {
				signal = &signals[i]
				break
			}
		}
		if signal == nil {
			resp.Diagnostics.AddError("Signal not found", fmt.Sprintf("No Signal named %q exists in this project.", name))
			return
		}
	}

	state := signalToModel(ctx, signal, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
