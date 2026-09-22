package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework-jsontypes/jsontypes"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var _ datasource.DataSource = &SignalDataSource{}

type SignalDataSource struct{ client *client.Client }

type SignalDataSourceModel struct {
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

func NewSignalDataSource() datasource.DataSource { return &SignalDataSource{} }

func (d *SignalDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_signal"
}

func (d *SignalDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Read an existing Laminar Signal by UUID.",
		Attributes: map[string]schema.Attribute{
			"id":                schema.StringAttribute{Required: true, MarkdownDescription: "Signal UUID."},
			"project_id":        schema.StringAttribute{Computed: true},
			"name":              schema.StringAttribute{Computed: true},
			"prompt":            schema.StringAttribute{Computed: true},
			"structured_output": schema.StringAttribute{Computed: true, CustomType: jsontypes.NormalizedType{}},
			"sample_rate":       schema.Int64Attribute{Computed: true},
			"disabled":          schema.BoolAttribute{Computed: true},
			"trigger":           schema.StringAttribute{Computed: true, CustomType: jsontypes.NormalizedType{}},
			"filters":           schema.StringAttribute{Computed: true, CustomType: jsontypes.NormalizedType{}},
			"mode":              schema.StringAttribute{Computed: true},
			"created_at":        schema.StringAttribute{Computed: true},
			"current_version":   schema.Int64Attribute{Computed: true},
		},
	}
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
	var config SignalDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}
	signal, err := d.client.GetSignal(ctx, config.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Unable to read Signal", err.Error())
		return
	}
	resourceState, err := signalState(signal)
	if err != nil {
		resp.Diagnostics.AddError("Unable to store Signal state", err.Error())
		return
	}
	state := SignalDataSourceModel{
		ID: resourceState.ID, ProjectID: resourceState.ProjectID, Name: resourceState.Name,
		Prompt: resourceState.Prompt, StructuredOutput: resourceState.StructuredOutput,
		SampleRate: resourceState.SampleRate, Disabled: resourceState.Disabled,
		Trigger: resourceState.Trigger, Filters: resourceState.Filters, Mode: resourceState.Mode,
		CreatedAt: resourceState.CreatedAt, CurrentVersion: resourceState.CurrentVersion,
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
