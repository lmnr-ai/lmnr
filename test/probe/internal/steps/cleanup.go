package steps

import (
	"context"
	"fmt"
	"net/http"
)

// CleanupStep deletes the test routine created during the probe run.
type CleanupStep struct {
	BaseURL   string
	AuthToken string
	Client    *http.Client
}

func (s *CleanupStep) Name() string { return "cleanup" }

// Run deletes the routine. The context controls the HTTP request timeout.
// If the context is already cancelled (e.g., from SIGTERM), the DELETE request
// will fail immediately with "context canceled" — this is the bug we fixed by
// giving cleanup a detached context in the runner.
func (s *CleanupStep) Run(ctx context.Context, state *RunState) StepResult {
	if state.RoutineID == "" {
		return StepResult{Status: "pass"}
	}

	url := fmt.Sprintf("%s/routines/%s", s.BaseURL, state.RoutineID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return StepResult{Status: "fail", Error: fmt.Errorf("create request: %w", err)}
	}
	req.Header.Set("Authorization", "Bearer "+s.AuthToken)

	client := s.Client
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		return StepResult{Status: "fail", Error: fmt.Errorf("delete routine: %w", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		return StepResult{Status: "fail", Error: fmt.Errorf("unexpected status: %d", resp.StatusCode)}
	}

	return StepResult{Status: "pass"}
}
