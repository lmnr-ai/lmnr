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
	Message    string
}

func (e *APIError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("Laminar API returned HTTP %d", e.StatusCode)
	}
	return fmt.Sprintf("Laminar API returned HTTP %d: %s", e.StatusCode, e.Message)
}

type Client struct {
	baseURL    *url.URL
	apiKey     string
	userAgent  string
	httpClient *http.Client
}

func New(baseURL, apiKey, userAgent string, httpClient *http.Client) (*Client, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("invalid Laminar API endpoint %q", baseURL)
	}
	if apiKey == "" {
		return nil, errors.New("Laminar project API key is required")
	}
	if httpClient == nil {
		// Signal and dataset deletes purge events and datapoints synchronously; a
		// minute is common on large projects.
		httpClient = &http.Client{Timeout: 5 * time.Minute}
	}
	return &Client{baseURL: parsed, apiKey: apiKey, userAgent: userAgent, httpClient: httpClient}, nil
}

type Project struct {
	ProjectID string `json:"projectId"`
}

func (c *Client) GetProject(ctx context.Context) (*Project, error) {
	var output Project
	if err := c.do(ctx, http.MethodGet, "/v1/project", nil, &output); err != nil {
		return nil, err
	}
	return &output, nil
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
	if c.userAgent != "" {
		req.Header.Set("User-Agent", c.userAgent)
	}
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{StatusCode: resp.StatusCode, Message: errorMessage(responseBody)}
	}
	if output != nil && len(responseBody) != 0 {
		if err := json.Unmarshal(responseBody, output); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

// errorMessage prefers the `{"error": "..."}` body every CRUD route returns.
func errorMessage(body []byte) string {
	var parsed struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(body, &parsed) == nil && parsed.Error != "" {
		return parsed.Error
	}
	return strings.TrimSpace(string(body))
}

func escape(id string) string { return url.PathEscape(id) }
