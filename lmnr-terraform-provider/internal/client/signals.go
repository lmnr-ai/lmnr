package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
)

type Signal struct {
	ID               string          `json:"id"`
	ProjectID        string          `json:"projectId"`
	Name             string          `json:"name"`
	Prompt           string          `json:"prompt"`
	StructuredOutput json.RawMessage `json:"structuredOutput"`
	SampleRate       *int64          `json:"sampleRate"`
	Disabled         bool            `json:"disabled"`
	CreatedAt        string          `json:"createdAt"`
	Trigger          SignalTrigger   `json:"trigger"`
	Filters          []SignalFilter  `json:"filters"`
	Mode             string          `json:"mode"`
	Version          int64           `json:"version"`
	LlmProfileID     *string         `json:"llmProfileId"`
	LlmProfileName   *string         `json:"llmProfileName"`
	Model            *string         `json:"model"`
}

type SignalTrigger struct {
	Type      string   `json:"type"`
	SpanNames []string `json:"spanNames,omitempty"`
}

// SignalFilter.Value is a string, number, or string list depending on the column.
type SignalFilter struct {
	Column   string          `json:"column"`
	Operator string          `json:"operator"`
	Value    json.RawMessage `json:"value"`
}

type CreateSignalRequest struct {
	Name             string          `json:"name"`
	Prompt           string          `json:"prompt"`
	StructuredOutput json.RawMessage `json:"structuredOutput"`
	SampleRate       *int64          `json:"sampleRate,omitempty"`
	Disabled         *bool           `json:"disabled,omitempty"`
	Trigger          *SignalTrigger  `json:"trigger,omitempty"`
	Filters          []SignalFilter  `json:"filters"`
	Mode             string          `json:"mode,omitempty"`
	LlmProfileID     *string         `json:"llmProfileId,omitempty"`
	Model            *string         `json:"model,omitempty"`
}

// UpdateSignalRequest.SampleRate is raw so that an explicit `null` (clear
// sampling) can be told apart from an omitted field (keep sampling).
type UpdateSignalRequest struct {
	Name             *string         `json:"name,omitempty"`
	Prompt           *string         `json:"prompt,omitempty"`
	StructuredOutput json.RawMessage `json:"structuredOutput,omitempty"`
	SampleRate       json.RawMessage `json:"sampleRate,omitempty"`
	Disabled         *bool           `json:"disabled,omitempty"`
	Trigger          *SignalTrigger  `json:"trigger,omitempty"`
	Filters          []SignalFilter  `json:"filters"`
	Mode             *string         `json:"mode,omitempty"`
	LlmProfileID     *string         `json:"llmProfileId,omitempty"`
	Model            *string         `json:"model,omitempty"`
}

type signalList struct {
	Signals []Signal `json:"signals"`
}

func (c *Client) CreateSignal(ctx context.Context, input CreateSignalRequest) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodPost, "/v1/signals", input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

// ListSignals filters by a case-insensitive name substring when name is non-empty.
func (c *Client) ListSignals(ctx context.Context, name string) ([]Signal, error) {
	path := "/v1/signals"
	if name != "" {
		path += "?" + url.Values{"name": {name}}.Encode()
	}
	var output signalList
	if err := c.do(ctx, http.MethodGet, path, nil, &output); err != nil {
		return nil, err
	}
	return output.Signals, nil
}

func (c *Client) GetSignal(ctx context.Context, id string) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodGet, "/v1/signals/"+escape(id), nil, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) UpdateSignal(ctx context.Context, id string, input UpdateSignalRequest) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodPatch, "/v1/signals/"+escape(id), input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) DeleteSignal(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/signals/"+escape(id), nil, nil)
}
