package runner

import (
	"context"
	"log/slog"

	"github.com/lmnr-ai/lmnr/test/probe/internal/config"
	"github.com/lmnr-ai/lmnr/test/probe/internal/steps"
)

// Result is the outcome of a complete probe run.
type Result struct {
	Success bool
	Error   string
}

// Run orchestrates the probe steps in sequence. If a step fails after a resource
// has been created, we jump to cleanup. The cleanup step always uses a detached
// context derived from context.Background() to ensure it completes even when the
// parent context has been cancelled (e.g., by SIGTERM).
func Run(ctx context.Context, cfg *config.Config) Result {
	return RunWithSteps(ctx, cfg, nil, nil, nil, nil, nil)
}

// RunWithSteps allows injecting step implementations for testing.
func RunWithSteps(
	ctx context.Context,
	cfg *config.Config,
	healthStep steps.Step,
	createStep steps.Step,
	triggerStep steps.Step,
	verifyStep steps.Step,
	cleanupStep steps.Step,
) Result {
	state := &steps.RunState{}

	// Step 1: Health Check
	if healthStep != nil {
		if res := healthStep.Run(ctx, state); res.Status != "pass" {
			return Result{Success: false, Error: "health check failed"}
		}
	}

	// Step 2: Create Routine
	if createStep != nil {
		if res := createStep.Run(ctx, state); res.Status != "pass" {
			// If creation failed but resource might exist, still cleanup
			if state.CreatedResource {
				runCleanup(cfg, cleanupStep, state)
			}
			return Result{Success: false, Error: "create routine failed"}
		}
	}

	// Step 3: Trigger Execution
	if triggerStep != nil {
		if res := triggerStep.Run(ctx, state); res.Status != "pass" {
			runCleanup(cfg, cleanupStep, state)
			return Result{Success: false, Error: "trigger execution failed"}
		}
	}

	// Step 4: Verify Execution
	if verifyStep != nil {
		if res := verifyStep.Run(ctx, state); res.Status != "pass" {
			runCleanup(cfg, cleanupStep, state)
			return Result{Success: false, Error: "verify execution failed"}
		}
	}

	// Step 5: Cleanup
	// FIX(TEAM-2616): Use a detached context so that SIGTERM/SIGINT cancellation
	// of the parent context does not prevent the cleanup HTTP call from completing.
	// Previously, the cancelled parent context was passed directly, causing
	// DeleteRoutine to fail immediately with "context canceled" and leaking
	// the test routine in the production system.
	runCleanup(cfg, cleanupStep, state)

	return Result{Success: true}
}

// runCleanup executes the cleanup step with a detached context.
// This ensures the DELETE call completes even if the parent run context
// was cancelled by SIGTERM/SIGINT.
func runCleanup(cfg *config.Config, cleanupStep steps.Step, state *steps.RunState) {
	if !state.CreatedResource || cleanupStep == nil {
		return
	}

	cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), cfg.CleanupTimeout)
	defer cleanupCancel()

	slog.Info("running cleanup with detached context", "routine_id", state.RoutineID)
	result := cleanupStep.Run(cleanupCtx, state)
	if result.Status != "pass" {
		slog.Warn("cleanup failed", "error", result.Error)
	}
}
