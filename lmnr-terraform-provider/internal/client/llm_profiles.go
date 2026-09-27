package client

import (
	"context"
	"net/http"
)

type LlmProfile struct {
	ID          string                `json:"id"`
	WorkspaceID string                `json:"workspaceId"`
	Name        string                `json:"name"`
	Provider    string                `json:"provider"`
	Config      LlmProfileConfig      `json:"config"`
	Models      []string              `json:"models"`
	Secrets     LlmProfileSecretsMask `json:"secrets"`
	CreatedAt   string                `json:"createdAt"`
	UpdatedAt   string                `json:"updatedAt"`
}

// LlmProfileConfig fields a provider does not use must be omitted: the API
// rejects them instead of dropping them.
type LlmProfileConfig struct {
	Auth        LlmProfileAuth `json:"auth"`
	Region      string         `json:"region,omitempty"`
	ResourceID  string         `json:"resourceId,omitempty"`
	BaseURL     string         `json:"baseUrl,omitempty"`
	APIVersion  string         `json:"apiVersion,omitempty"`
	HeaderNames []string       `json:"headerNames,omitempty"`
}

type LlmProfileAuth struct {
	Type        string `json:"type"`
	AccessKeyID string `json:"accessKeyId,omitempty"`
}

type LlmProfileSecrets struct {
	APIKey          string            `json:"apiKey,omitempty"`
	SecretAccessKey string            `json:"secretAccessKey,omitempty"`
	Token           string            `json:"token,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
}

// LlmProfileSecretsMask is what the API returns: masked values and header names only.
type LlmProfileSecretsMask struct {
	APIKey          *string  `json:"apiKey"`
	SecretAccessKey *string  `json:"secretAccessKey"`
	Token           *string  `json:"token"`
	Headers         []string `json:"headers"`
}

type CreateLlmProfileRequest struct {
	Name     string            `json:"name"`
	Provider string            `json:"provider"`
	Config   LlmProfileConfig  `json:"config"`
	Secrets  LlmProfileSecrets `json:"secrets"`
	Models   []string          `json:"models"`
}

// UpdateLlmProfileRequest: supplied secrets are merged into the stored ones.
type UpdateLlmProfileRequest struct {
	Name     *string           `json:"name,omitempty"`
	Provider *string           `json:"provider,omitempty"`
	Config   *LlmProfileConfig `json:"config,omitempty"`
	Secrets  LlmProfileSecrets `json:"secrets"`
	Models   []string          `json:"models,omitempty"`
}

type llmProfileList struct {
	LlmProfiles []LlmProfile `json:"llmProfiles"`
}

func (c *Client) CreateLlmProfile(ctx context.Context, input CreateLlmProfileRequest) (*LlmProfile, error) {
	var output LlmProfile
	if err := c.do(ctx, http.MethodPost, "/v1/llm-profiles", input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) ListLlmProfiles(ctx context.Context) ([]LlmProfile, error) {
	var output llmProfileList
	if err := c.do(ctx, http.MethodGet, "/v1/llm-profiles", nil, &output); err != nil {
		return nil, err
	}
	return output.LlmProfiles, nil
}

func (c *Client) GetLlmProfile(ctx context.Context, id string) (*LlmProfile, error) {
	var output LlmProfile
	if err := c.do(ctx, http.MethodGet, "/v1/llm-profiles/"+escape(id), nil, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) UpdateLlmProfile(ctx context.Context, id string, input UpdateLlmProfileRequest) (*LlmProfile, error) {
	var output LlmProfile
	if err := c.do(ctx, http.MethodPatch, "/v1/llm-profiles/"+escape(id), input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) DeleteLlmProfile(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/llm-profiles/"+escape(id), nil, nil)
}
