package client

import (
	"context"
	"net/http"
	"net/url"
)

type Dataset struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ProjectID string `json:"projectId"`
	CreatedAt string `json:"createdAt"`
}

type DatasetNameRequest struct {
	Name string `json:"name"`
}

func (c *Client) CreateDataset(ctx context.Context, name string) (*Dataset, error) {
	var output Dataset
	if err := c.do(ctx, http.MethodPost, "/v1/datasets", DatasetNameRequest{Name: name}, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

// ListDatasets filters by exact name when name is non-empty. Names are not unique.
func (c *Client) ListDatasets(ctx context.Context, name string) ([]Dataset, error) {
	path := "/v1/datasets"
	if name != "" {
		path += "?" + url.Values{"name": {name}}.Encode()
	}
	var output []Dataset
	if err := c.do(ctx, http.MethodGet, path, nil, &output); err != nil {
		return nil, err
	}
	return output, nil
}

func (c *Client) GetDataset(ctx context.Context, id string) (*Dataset, error) {
	var output Dataset
	if err := c.do(ctx, http.MethodGet, "/v1/datasets/"+escape(id), nil, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) UpdateDataset(ctx context.Context, id, name string) (*Dataset, error) {
	var output Dataset
	if err := c.do(ctx, http.MethodPatch, "/v1/datasets/"+escape(id), DatasetNameRequest{Name: name}, &output); err != nil {
		return nil, err
	}
	return &output, nil
}

func (c *Client) DeleteDataset(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/datasets/"+escape(id), nil, nil)
}
