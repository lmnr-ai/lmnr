package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework-validators/datasourcevalidator"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var (
	_ datasource.DataSource                     = &DatasetDataSource{}
	_ datasource.DataSourceWithConfigValidators = &DatasetDataSource{}
)

type DatasetDataSource struct{ client *client.Client }

func NewDatasetDataSource() datasource.DataSource { return &DatasetDataSource{} }

func (d *DatasetDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_dataset"
}

func (d *DatasetDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Reads an existing Laminar dataset by `id` or exact `name`. Lookup by name fails when several datasets share it.",
		Attributes: map[string]schema.Attribute{
			"id":         schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "Dataset UUID. Exactly one of `id` and `name` is required."},
			"name":       schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "Exact dataset name."},
			"project_id": schema.StringAttribute{Computed: true, MarkdownDescription: "UUID of the project that owns the dataset."},
			"created_at": schema.StringAttribute{Computed: true, MarkdownDescription: "Creation timestamp (RFC 3339)."},
		},
	}
}

func (d *DatasetDataSource) ConfigValidators(context.Context) []datasource.ConfigValidator {
	return []datasource.ConfigValidator{datasourcevalidator.ExactlyOneOf(path.MatchRoot("id"), path.MatchRoot("name"))}
}

func (d *DatasetDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
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

func (d *DatasetDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var config datasetModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	var dataset *client.Dataset
	if known(config.ID) {
		found, err := d.client.GetDataset(ctx, config.ID.ValueString())
		if err != nil {
			resp.Diagnostics.AddError("Unable to read dataset", err.Error())
			return
		}
		dataset = found
	} else {
		name := config.Name.ValueString()
		datasets, err := d.client.ListDatasets(ctx, name)
		if err != nil {
			resp.Diagnostics.AddError("Unable to list datasets", err.Error())
			return
		}
		switch len(datasets) {
		case 0:
			resp.Diagnostics.AddError("Dataset not found", fmt.Sprintf("No dataset named %q exists in this project.", name))
			return
		case 1:
			dataset = &datasets[0]
		default:
			resp.Diagnostics.AddError("Ambiguous dataset name", fmt.Sprintf("%d datasets are named %q; look the dataset up by id instead.", len(datasets), name))
			return
		}
	}

	state := datasetToModel(dataset)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
