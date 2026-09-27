package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var _ datasource.DataSource = &ProjectDataSource{}

type ProjectDataSource struct{ client *client.Client }

type projectModel struct {
	ID types.String `tfsdk:"id"`
}

func NewProjectDataSource() datasource.DataSource { return &ProjectDataSource{} }

func (d *ProjectDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_project"
}

func (d *ProjectDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Reads the Laminar project that the provider's project API key belongs to.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{Computed: true, MarkdownDescription: "Project UUID."},
		},
	}
}

func (d *ProjectDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
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

func (d *ProjectDataSource) Read(ctx context.Context, _ datasource.ReadRequest, resp *datasource.ReadResponse) {
	project, err := d.client.GetProject(ctx)
	if err != nil {
		resp.Diagnostics.AddError("Unable to read project", err.Error())
		return
	}
	state := projectModel{ID: types.StringValue(project.ProjectID)}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
