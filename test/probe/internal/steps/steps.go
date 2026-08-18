package steps

import "context"

// StepResult represents the outcome of a probe step.
type StepResult struct {
	Status string // "pass" or "fail"
	Error  error
}

// RunState carries data between probe steps within a single run.
type RunState struct {
	RoutineID       string
	CreatedResource bool
	ExecutionID     string
}

// Step is the interface all probe steps implement.
type Step interface {
	Name() string
	Run(ctx context.Context, state *RunState) StepResult
}
