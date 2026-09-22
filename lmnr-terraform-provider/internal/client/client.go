package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrNotFound = errors.New("resource not found")

type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("Laminar API returned HTTP %d", e.StatusCode)
	}
	return fmt.Sprintf("Laminar API returned HTTP %d: %s", e.StatusCode, e.Body)
}

type Client struct {
	baseURL    *url.URL
	apiKey     string
	httpClient *http.Client
}

func New(baseURL, apiKey string, httpClient *http.Client) (*Client, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid Laminar API endpoint %q", baseURL)
	}
	if apiKey == "" {
		return nil, errors.New("Laminar project API key is required")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &Client{baseURL: parsed, apiKey: apiKey, httpClient: httpClient}, nil
}

type Signal struct {
	ID               string          `json:"id"`
	ProjectID        string          `json:"projectId"`
	Name             string          `json:"name"`
	Prompt           string          `json:"prompt"`
	StructuredOutput json.RawMessage `json:"structuredOutput"`
	SampleRate       *int64          `json:"sampleRate"`
	Disabled         bool            `json:"disabled"`
	CreatedAt        string          `json:"createdAt"`
	Trigger          json.RawMessage `json:"trigger"`
	Filters          json.RawMessage `json:"filters"`
	Mode             string          `json:"mode"`
	CurrentVersion   int64           `json:"currentVersion"`
}

type CreateSignalRequest struct {
	Name             string          `json:"name"`
	Prompt           string          `json:"prompt"`
	StructuredOutput json.RawMessage `json:"structuredOutput"`
	SampleRate       *int64          `json:"sampleRate,omitempty"`
	Disabled         *bool           `json:"disabled,omitempty"`
	Trigger          json.RawMessage `json:"trigger,omitempty"`
	Filters          json.RawMessage `json:"filters,omitempty"`
	Mode             string          `json:"mode,omitempty"`
}

type UpdateSignalRequest struct {
	Name             *string          `json:"name,omitempty"`
	Prompt           *string          `json:"prompt,omitempty"`
	StructuredOutput *json.RawMessage `json:"structuredOutput,omitempty"`
	SampleRate       **int64          `json:"sampleRate,omitempty"`
	Disabled         *bool            `json:"disabled,omitempty"`
	Trigger          json.RawMessage  `json:"trigger,omitempty"`
	Filters          json.RawMessage  `json:"filters,omitempty"`
	Mode             *string          `json:"mode,omitempty"`
}

func (c *Client) CreateSignal(ctx context.Context, input CreateSignalRequest) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodPost, "/v1/signals", input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) GetSignal(ctx context.Context, id string) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodGet, "/v1/signals/"+url.PathEscape(id), nil, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) UpdateSignal(ctx context.Context, id string, input UpdateSignalRequest) (*Signal, error) {
	var output Signal
	if err := c.do(ctx, http.MethodPatch, "/v1/signals/"+url.PathEscape(id), input, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) DeleteSignal(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/signals/"+url.PathEscape(id), nil, nil)
}

func (c *Client) do(ctx context.Context, method, path string, input, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL.String()+path, body)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{StatusCode: resp.StatusCode, Body: strings.TrimSpace(string(responseBody))}
	}
	if output != nil && len(responseBody) != 0 {
		if err := json.Unmarshal(responseBody, output); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}
