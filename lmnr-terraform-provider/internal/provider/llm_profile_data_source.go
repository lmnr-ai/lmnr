package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework-validators/datasourcevalidator"
	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var (
	_ datasource.DataSource                     = &LlmProfileDataSource{}
	_ datasource.DataSourceWithConfigValidators = &LlmProfileDataSource{}
)

type LlmProfileDataSource struct{ client *client.Client }

type llmProfileDataModel struct {
	ID             types.String `tfsdk:"id"`
	WorkspaceID    types.String `tfsdk:"workspace_id"`
	Name           types.String `tfsdk:"name"`
	Provider       types.String `tfsdk:"llm_provider"`
	Models         types.Set    `tfsdk:"models"`
	AuthType       types.String `tfsdk:"auth_type"`
	AwsAccessKeyID types.String `tfsdk:"aws_access_key_id"`
	Region         types.String `tfsdk:"region"`
	ResourceID     types.String `tfsdk:"resource_id"`
	BaseURL        types.String `tfsdk:"base_url"`
	APIVersion     types.String `tfsdk:"api_version"`
	HeaderNames    types.List   `tfsdk:"header_names"`
	CreatedAt      types.String `tfsdk:"created_at"`
	UpdatedAt      types.String `tfsdk:"updated_at"`
}

func NewLlmProfileDataSource() datasource.DataSource { return &LlmProfileDataSource{} }

func (d *LlmProfileDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_llm_profile"
}

func (d *LlmProfileDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	computed := func(description string) schema.StringAttribute {
		return schema.StringAttribute{Computed: true, MarkdownDescription: description}
	}
	resp.Schema = schema.Schema{
		MarkdownDescription: "Reads an existing LLM profile of the provider's workspace by `id` or exact `name`. Credentials are never returned.",
		Attributes: map[string]schema.Attribute{
			"id":                schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "LLM profile UUID. Exactly one of `id` and `name` is required."},
			"name":              schema.StringAttribute{Optional: true, Computed: true, MarkdownDescription: "Exact profile name. Names are unique within a workspace."},
			"workspace_id":      computed("UUID of the workspace that owns the profile."),
			"llm_provider":      computed("LLM provider."),
			"models":            schema.SetAttribute{Computed: true, ElementType: types.StringType, MarkdownDescription: "Model names this profile may use."},
			"auth_type":         computed("Authentication method."),
			"aws_access_key_id": computed("Bedrock `aws_keys` auth: AWS access key id."),
			"region":            computed("Bedrock: AWS region."),
			"resource_id":       computed("Azure: resource name."),
			"base_url":          computed("Azure or custom gateway: endpoint URL."),
			"api_version":       computed("Azure: API version."),
			"header_names":      schema.ListAttribute{Computed: true, ElementType: types.StringType, MarkdownDescription: "Custom gateway: names of the extra headers."},
			"created_at":        computed("Creation timestamp (RFC 3339)."),
			"updated_at":        computed("Last update timestamp (RFC 3339)."),
		},
	}
}

func (d *LlmProfileDataSource) ConfigValidators(context.Context) []datasource.ConfigValidator {
	return []datasource.ConfigValidator{datasourcevalidator.ExactlyOneOf(path.MatchRoot("id"), path.MatchRoot("name"))}
}

func (d *LlmProfileDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
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

func (d *LlmProfileDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var config llmProfileDataModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	var profile *client.LlmProfile
	if known(config.ID) {
		found, err := d.client.GetLlmProfile(ctx, config.ID.ValueString())
		if err != nil {
			resp.Diagnostics.AddError("Unable to read LLM profile", err.Error())
			return
		}
		profile = found
	} else {
		name := config.Name.ValueString()
		profiles, err := d.client.ListLlmProfiles(ctx)
		if err != nil {
			resp.Diagnostics.AddError("Unable to list LLM profiles", err.Error())
			return
		}
		for i := range profiles {
			if profiles[i].Name == name {
				profile = &profiles[i]
				break
			}
		}
		if profile == nil {
			resp.Diagnostics.AddError("LLM profile not found", fmt.Sprintf("No LLM profile named %q exists in this workspace.", name))
			return
		}
	}

	full := llmProfileToModel(ctx, profile, llmProfileModel{}, &resp.Diagnostics)
	state := llmProfileDataModel{
		ID: full.ID, WorkspaceID: full.WorkspaceID, Name: full.Name, Provider: full.Provider, Models: full.Models,
		AuthType: full.AuthType, AwsAccessKeyID: full.AwsAccessKeyID, Region: full.Region, ResourceID: full.ResourceID,
		BaseURL: full.BaseURL, APIVersion: full.APIVersion, CreatedAt: full.CreatedAt, UpdatedAt: full.UpdatedAt,
		HeaderNames: listOfStrings(profile.Config.HeaderNames),
	}
	if state.HeaderNames.IsNull() {
		state.HeaderNames = listOfStrings([]string{})
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
