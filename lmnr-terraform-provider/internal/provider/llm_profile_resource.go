package provider

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/hashicorp/terraform-plugin-framework-validators/mapvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/setvalidator"
	"github.com/hashicorp/terraform-plugin-framework-validators/stringvalidator"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/path"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/schema/validator"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/lmnr-ai/terraform-provider-laminar/internal/client"
)

var (
	_ resource.Resource                   = &LlmProfileResource{}
	_ resource.ResourceWithImportState    = &LlmProfileResource{}
	_ resource.ResourceWithValidateConfig = &LlmProfileResource{}
)

var llmProviders = []string{
	"openai_completions", "openai_responses", "anthropic", "gemini", "groq", "mistral",
	"bedrock", "azure_chat_completions", "azure_responses", "azure_anthropic", "custom", "custom_responses",
}

// Optional config attributes each provider accepts; the API rejects any other.
// Mirrors app-server/src/llm/profiles/service/provider_fields.rs.
var llmProviderFields = map[string][]string{
	"bedrock":                {"region", "aws_access_key_id"},
	"azure_chat_completions": {"resource_id", "base_url", "api_version"},
	"azure_responses":        {"resource_id", "base_url", "api_version"},
	"azure_anthropic":        {"resource_id", "base_url", "api_version"},
	"custom":                 {"base_url", "headers"},
	"custom_responses":       {"base_url", "headers"},
}

var headerNameRegexp = regexp.MustCompile("^[A-Za-z0-9!#$%&'*+.^_`|~-]+$")

type LlmProfileResource struct{ client *client.Client }

type llmProfileModel struct {
	ID              types.String `tfsdk:"id"`
	WorkspaceID     types.String `tfsdk:"workspace_id"`
	Name            types.String `tfsdk:"name"`
	Provider        types.String `tfsdk:"llm_provider"`
	Models          types.Set    `tfsdk:"models"`
	AuthType        types.String `tfsdk:"auth_type"`
	AwsAccessKeyID  types.String `tfsdk:"aws_access_key_id"`
	Region          types.String `tfsdk:"region"`
	ResourceID      types.String `tfsdk:"resource_id"`
	BaseURL         types.String `tfsdk:"base_url"`
	APIVersion      types.String `tfsdk:"api_version"`
	APIKey          types.String `tfsdk:"api_key"`
	SecretAccessKey types.String `tfsdk:"secret_access_key"`
	Token           types.String `tfsdk:"token"`
	Headers         types.Map    `tfsdk:"headers"`
	CreatedAt       types.String `tfsdk:"created_at"`
	UpdatedAt       types.String `tfsdk:"updated_at"`
}

func NewLlmProfileResource() resource.Resource { return &LlmProfileResource{} }

func (r *LlmProfileResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_llm_profile"
}

func (r *LlmProfileResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		MarkdownDescription: "Manages a Laminar LLM profile: a provider connection with credentials and the models it may use. " +
			"Self-hosted Signals run on an LLM profile model.\n\n" +
			"LLM profiles belong to the workspace of the provider's project, so every project in that workspace can use them.\n\n" +
			"Credentials are write-only on the Laminar side: the API only returns masked values, so Terraform keeps the configured " +
			"values in state (marked sensitive). Protect your state accordingly. Deleting a profile that a Signal or feature still uses fails.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true, MarkdownDescription: "LLM profile UUID.",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"workspace_id": schema.StringAttribute{
				Computed: true, MarkdownDescription: "UUID of the workspace that owns the profile.",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"name": schema.StringAttribute{
				Required: true, MarkdownDescription: "Profile name, unique within the workspace.",
				Validators: []validator.String{trimmedValidator{}, stringvalidator.UTF8LengthAtMost(255)},
			},
			"llm_provider": schema.StringAttribute{
				Required: true, MarkdownDescription: "LLM provider. One of " + strings.Join(backtick(llmProviders), ", ") + ".",
				Validators: []validator.String{stringvalidator.OneOf(llmProviders...)},
			},
			"models": schema.SetAttribute{
				Required: true, ElementType: types.StringType,
				MarkdownDescription: "Model names this profile may use (1-64).",
				Validators: []validator.Set{
					setvalidator.SizeBetween(1, 64),
					setvalidator.ValueStringsAre(trimmedValidator{}, stringvalidator.UTF8LengthAtMost(256)),
				},
			},
			"auth_type": schema.StringAttribute{
				Optional: true, Computed: true, Default: stringdefault.StaticString("api_key"),
				MarkdownDescription: "Authentication method: `api_key` (default), or for `bedrock` `aws_keys` or `bearer_token`.",
				Validators:          []validator.String{stringvalidator.OneOf("api_key", "aws_keys", "bearer_token")},
			},
			"aws_access_key_id": schema.StringAttribute{
				Optional: true, MarkdownDescription: "Bedrock with `aws_keys` auth: AWS access key id.",
				Validators: []validator.String{trimmedValidator{}, stringvalidator.UTF8LengthAtMost(256)},
			},
			"region": schema.StringAttribute{
				Optional: true, MarkdownDescription: "Bedrock only, required: AWS region.",
				Validators: []validator.String{trimmedValidator{}, stringvalidator.UTF8LengthAtMost(64)},
			},
			"resource_id": schema.StringAttribute{
				Optional: true, MarkdownDescription: "Azure only: Azure resource name. Exactly one of `resource_id` and `base_url` is required for Azure.",
				Validators: []validator.String{trimmedValidator{}, stringvalidator.UTF8LengthAtMost(256)},
			},
			"base_url": schema.StringAttribute{
				Optional: true, MarkdownDescription: "Azure or custom gateway: endpoint URL (`http://` or `https://`, no trailing `/`). Required for `custom` and `custom_responses`.",
				Validators: []validator.String{
					trimmedValidator{},
					stringvalidator.RegexMatches(regexp.MustCompile(`^https?://[^/\s]+(/.*[^/])?$`), "must be an http(s) URL without a trailing slash"),
				},
			},
			"api_version": schema.StringAttribute{
				Optional: true, MarkdownDescription: "Azure only: API version.",
				Validators: []validator.String{trimmedValidator{}, stringvalidator.UTF8LengthAtMost(64)},
			},
			"api_key": schema.StringAttribute{
				Optional: true, Sensitive: true,
				MarkdownDescription: "API key. Required unless `llm_provider` is `bedrock`.",
				Validators:          secretValidators(),
			},
			"secret_access_key": schema.StringAttribute{
				Optional: true, Sensitive: true,
				MarkdownDescription: "Bedrock with `aws_keys` auth, required: AWS secret access key.",
				Validators:          secretValidators(),
			},
			"token": schema.StringAttribute{
				Optional: true, Sensitive: true,
				MarkdownDescription: "Bedrock with `bearer_token` auth, required: bearer token.",
				Validators:          secretValidators(),
			},
			"headers": schema.MapAttribute{
				Optional: true, Sensitive: true, ElementType: types.StringType,
				MarkdownDescription: "Custom gateways only: extra HTTP headers sent with every request (name to value, at most 32).",
				Validators: []validator.Map{
					mapvalidator.SizeBetween(1, 32),
					mapvalidator.KeysAre(stringvalidator.RegexMatches(headerNameRegexp, "must be a valid HTTP header name")),
					mapvalidator.ValueStringsAre(secretValidators()...),
				},
			},
			"created_at": schema.StringAttribute{
				Computed: true, MarkdownDescription: "Creation timestamp (RFC 3339).",
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"updated_at": schema.StringAttribute{Computed: true, MarkdownDescription: "Last update timestamp (RFC 3339)."},
		},
	}
}

func secretValidators() []validator.String {
	return []validator.String{
		stringvalidator.LengthBetween(1, 8192),
		stringvalidator.RegexMatches(regexp.MustCompile(`^[^\r\n]*$`), "must not contain line breaks"),
	}
}

func (r *LlmProfileResource) ValidateConfig(ctx context.Context, req resource.ValidateConfigRequest, resp *resource.ValidateConfigResponse) {
	var config llmProfileModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() || !known(config.Provider) {
		return
	}
	provider := config.Provider.ValueString()
	allowed := map[string]bool{}
	for _, field := range llmProviderFields[provider] {
		allowed[field] = true
	}
	set := map[string]bool{
		"region":            !config.Region.IsNull(),
		"aws_access_key_id": !config.AwsAccessKeyID.IsNull(),
		"resource_id":       !config.ResourceID.IsNull(),
		"base_url":          !config.BaseURL.IsNull(),
		"api_version":       !config.APIVersion.IsNull(),
		"headers":           !config.Headers.IsNull(),
	}
	for _, field := range []string{"region", "aws_access_key_id", "resource_id", "base_url", "api_version", "headers"} {
		if set[field] && !allowed[field] {
			resp.Diagnostics.AddAttributeError(path.Root(field), "Attribute not used by provider",
				fmt.Sprintf("Provider %q does not use %s.", provider, field))
		}
	}
	require := func(field string, isSet bool, detail string) {
		if !isSet {
			resp.Diagnostics.AddAttributeError(path.Root(field), "Missing required attribute", detail)
		}
	}
	forbid := func(field string, isSet bool, detail string) {
		if isSet {
			resp.Diagnostics.AddAttributeError(path.Root(field), "Attribute not used", detail)
		}
	}

	authType := config.AuthType.ValueString()
	authKnown := known(config.AuthType) || config.AuthType.IsNull()
	if config.AuthType.IsNull() {
		authType = "api_key"
	}
	switch {
	case provider == "bedrock":
		require("region", set["region"], "Bedrock profiles require region.")
		forbid("api_key", !config.APIKey.IsNull(), "Bedrock authenticates with AWS keys or a bearer token, not api_key.")
		if !authKnown {
			return
		}
		switch authType {
		case "aws_keys":
			require("aws_access_key_id", set["aws_access_key_id"], "auth_type \"aws_keys\" requires aws_access_key_id.")
			require("secret_access_key", !config.SecretAccessKey.IsNull(), "auth_type \"aws_keys\" requires secret_access_key.")
			forbid("token", !config.Token.IsNull(), "token is only used with auth_type \"bearer_token\".")
		case "bearer_token":
			require("token", !config.Token.IsNull(), "auth_type \"bearer_token\" requires token.")
			forbid("aws_access_key_id", set["aws_access_key_id"], "aws_access_key_id is only used with auth_type \"aws_keys\".")
			forbid("secret_access_key", !config.SecretAccessKey.IsNull(), "secret_access_key is only used with auth_type \"aws_keys\".")
		default:
			resp.Diagnostics.AddAttributeError(path.Root("auth_type"), "Invalid auth_type", "Bedrock requires auth_type \"aws_keys\" or \"bearer_token\".")
		}
	default:
		if authKnown && authType != "api_key" {
			resp.Diagnostics.AddAttributeError(path.Root("auth_type"), "Invalid auth_type", fmt.Sprintf("Provider %q authenticates with auth_type \"api_key\".", provider))
		}
		require("api_key", !config.APIKey.IsNull(), fmt.Sprintf("Provider %q requires api_key.", provider))
		forbid("secret_access_key", !config.SecretAccessKey.IsNull(), "secret_access_key is only used by bedrock.")
		forbid("token", !config.Token.IsNull(), "token is only used by bedrock.")
	}
	if strings.HasPrefix(provider, "azure_") && !config.ResourceID.IsUnknown() && !config.BaseURL.IsUnknown() && set["resource_id"] == set["base_url"] {
		resp.Diagnostics.AddAttributeError(path.Root("resource_id"), "Invalid Azure endpoint", "Set exactly one of resource_id and base_url.")
	}
	if strings.HasPrefix(provider, "custom") {
		require("base_url", set["base_url"], fmt.Sprintf("Provider %q requires base_url.", provider))
	}
	if known(config.Headers) {
		seen := map[string]bool{}
		for name := range config.Headers.Elements() {
			lower := strings.ToLower(name)
			if seen[lower] {
				resp.Diagnostics.AddAttributeError(path.Root("headers"), "Duplicate header", fmt.Sprintf("Header names must be unique ignoring case; %q is repeated.", name))
			}
			seen[lower] = true
		}
	}
}

func (r *LlmProfileResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
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

func (r *LlmProfileResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan llmProfileModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	config, secrets := llmProfileRequest(ctx, plan, &resp.Diagnostics)
	models := stringSet(ctx, plan.Models, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	profile, err := r.client.CreateLlmProfile(ctx, client.CreateLlmProfileRequest{
		Name: plan.Name.ValueString(), Provider: plan.Provider.ValueString(),
		Config: config, Secrets: secrets, Models: models,
	})
	if err != nil {
		resp.Diagnostics.AddError("Unable to create LLM profile", err.Error())
		return
	}
	state := llmProfileToModel(ctx, profile, plan, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *LlmProfileResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state llmProfileModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	profile, err := r.client.GetLlmProfile(ctx, state.ID.ValueString())
	if isNotFound(err) {
		resp.State.RemoveResource(ctx)
		return
	}
	if err != nil {
		resp.Diagnostics.AddError("Unable to read LLM profile", err.Error())
		return
	}
	state = llmProfileToModel(ctx, profile, state, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *LlmProfileResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan llmProfileModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	// Config is always sent so a provider change carries its matching config.
	config, secrets := llmProfileRequest(ctx, plan, &resp.Diagnostics)
	models := stringSet(ctx, plan.Models, &resp.Diagnostics)
	if resp.Diagnostics.HasError() {
		return
	}
	name, provider := plan.Name.ValueString(), plan.Provider.ValueString()
	profile, err := r.client.UpdateLlmProfile(ctx, plan.ID.ValueString(), client.UpdateLlmProfileRequest{
		Name: &name, Provider: &provider, Config: &config, Secrets: secrets, Models: models,
	})
	if err != nil {
		resp.Diagnostics.AddError("Unable to update LLM profile", err.Error())
		return
	}
	state := llmProfileToModel(ctx, profile, plan, &resp.Diagnostics)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *LlmProfileResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state llmProfileModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.DeleteLlmProfile(ctx, state.ID.ValueString()); err != nil && !isNotFound(err) {
		resp.Diagnostics.AddError("Unable to delete LLM profile", err.Error())
	}
}

func (r *LlmProfileResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	resource.ImportStatePassthroughID(ctx, path.Root("id"), req, resp)
}

func llmProfileRequest(ctx context.Context, plan llmProfileModel, diags *diag.Diagnostics) (client.LlmProfileConfig, client.LlmProfileSecrets) {
	config := client.LlmProfileConfig{
		Auth:       client.LlmProfileAuth{Type: plan.AuthType.ValueString(), AccessKeyID: plan.AwsAccessKeyID.ValueString()},
		Region:     plan.Region.ValueString(),
		ResourceID: plan.ResourceID.ValueString(),
		BaseURL:    plan.BaseURL.ValueString(),
		APIVersion: plan.APIVersion.ValueString(),
	}
	secrets := client.LlmProfileSecrets{
		APIKey:          plan.APIKey.ValueString(),
		SecretAccessKey: plan.SecretAccessKey.ValueString(),
		Token:           plan.Token.ValueString(),
	}
	if known(plan.Headers) {
		diags.Append(plan.Headers.ElementsAs(ctx, &secrets.Headers, false)...)
		config.HeaderNames = sortedKeys(secrets.Headers)
	}
	if config.Auth.Type == "" {
		config.Auth.Type = "api_key"
	}
	return config, secrets
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// llmProfileToModel takes secrets from prior (plan or state) because the API
// only returns masks. A secret the API reports as absent is dropped so the
// next plan restores it.
func llmProfileToModel(ctx context.Context, profile *client.LlmProfile, prior llmProfileModel, diags *diag.Diagnostics) llmProfileModel {
	models, d := types.SetValueFrom(ctx, types.StringType, profile.Models)
	diags.Append(d...)
	model := llmProfileModel{
		ID:              types.StringValue(profile.ID),
		WorkspaceID:     types.StringValue(profile.WorkspaceID),
		Name:            types.StringValue(profile.Name),
		Provider:        types.StringValue(profile.Provider),
		Models:          models,
		AuthType:        types.StringValue(profile.Config.Auth.Type),
		AwsAccessKeyID:  emptyAsNull(profile.Config.Auth.AccessKeyID),
		Region:          emptyAsNull(profile.Config.Region),
		ResourceID:      emptyAsNull(profile.Config.ResourceID),
		BaseURL:         emptyAsNull(profile.Config.BaseURL),
		APIVersion:      emptyAsNull(profile.Config.APIVersion),
		APIKey:          keepSecret(prior.APIKey, profile.Secrets.APIKey),
		SecretAccessKey: keepSecret(prior.SecretAccessKey, profile.Secrets.SecretAccessKey),
		Token:           keepSecret(prior.Token, profile.Secrets.Token),
		Headers:         types.MapNull(types.StringType),
		CreatedAt:       types.StringValue(profile.CreatedAt),
		UpdatedAt:       types.StringValue(profile.UpdatedAt),
	}

	if known(prior.Headers) && len(profile.Secrets.Headers) > 0 {
		var priorHeaders map[string]string
		diags.Append(prior.Headers.ElementsAs(ctx, &priorHeaders, false)...)
		headers := map[string]string{}
		for _, name := range profile.Secrets.Headers {
			if value, ok := priorHeaders[name]; ok {
				headers[name] = value
			}
		}
		if len(headers) > 0 {
			model.Headers, d = types.MapValueFrom(ctx, types.StringType, headers)
			diags.Append(d...)
		}
	}
	return model
}

func keepSecret(prior types.String, mask *string) types.String {
	if mask == nil || !known(prior) {
		return types.StringNull()
	}
	return prior
}

func emptyAsNull(value string) types.String {
	if value == "" {
		return types.StringNull()
	}
	return types.StringValue(value)
}
