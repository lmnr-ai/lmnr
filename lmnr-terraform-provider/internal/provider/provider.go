package provider

import (
	"context"
	"os"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var _ provider.Provider = &LaminarProvider{}

type LaminarProvider struct{ version string }

type LaminarProviderModel struct {
	ProjectAPIKey types.String `tfsdk:"project_api_key"`
	BaseURL       types.String `tfsdk:"base_url"`
}

func (p *LaminarProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "laminar"
	resp.Version = p.version
}

func (p *LaminarProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Manage Laminar resources through the Laminar project API. A project API key scopes the provider to one project; " +
			"use one provider alias per project. LLM profiles belong to the project's workspace.",
		Attributes: map[string]schema.Attribute{
			"project_api_key": schema.StringAttribute{
				Optional: true, Sensitive: true,
				MarkdownDescription: "Laminar project API key. May also be set with `LMNR_PROJECT_API_KEY`.",
			},
			"base_url": schema.StringAttribute{
				Optional:            true,
				MarkdownDescription: "Laminar API base URL. Defaults to `https://api.lmnr.ai`; may also be set with `LMNR_BASE_URL`.",
			},
		},
	}
}

func (p *LaminarProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config LaminarProviderModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	apiKey := os.Getenv("LMNR_PROJECT_API_KEY")
	if !config.ProjectAPIKey.IsNull() && !config.ProjectAPIKey.IsUnknown() {
		apiKey = config.ProjectAPIKey.ValueString()
	}
	baseURL := os.Getenv("LMNR_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.lmnr.ai"
	}
	if !config.BaseURL.IsNull() && !config.BaseURL.IsUnknown() {
		baseURL = config.BaseURL.ValueString()
	}
	if config.ProjectAPIKey.IsUnknown() || config.BaseURL.IsUnknown() {
		return
	}
	if apiKey == "" {
		resp.Diagnostics.AddError("Missing Laminar project API key", "Set project_api_key in the provider configuration or LMNR_PROJECT_API_KEY in the environment.")
		return
	}

	api, err := client.New(baseURL, apiKey, "terraform-provider-laminar/"+p.version, nil)
	if err != nil {
		resp.Diagnostics.AddError("Unable to configure Laminar client", err.Error())
		return
	}
	resp.ResourceData = api
	resp.DataSourceData = api
}

func (p *LaminarProvider) Resources(context.Context) []func() resource.Resource {
	return []func() resource.Resource{NewSignalResource, NewDatasetResource, NewLlmProfileResource}
}

func (p *LaminarProvider) DataSources(context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		NewSignalDataSource, NewDatasetDataSource, NewLlmProfileDataSource, NewProjectDataSource,
	}
}

func New(version string) func() provider.Provider {
	return func() provider.Provider { return &LaminarProvider{version: version} }
}
