package runner

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/lmnr-ai/lmnr/test/probe/internal/config"
	"github.com/lmnr-ai/lmnr/test/probe/internal/steps"
)

// mockStep is a test double for probe steps.
type mockStep struct {
	name    string
	runFunc func(ctx context.Context, state *steps.RunState) steps.StepResult
}

func (m *mockStep) Name() string { return m.name }
func (m *mockStep) Run(ctx context.Context, state *steps.RunState) steps.StepResult {
	return m.runFunc(ctx, state)
}

// TestCleanupRunsWhenContextCancelled verifies that the cleanup step receives
// a non-cancelled context even when the parent run context has been cancelled
// (simulating SIGTERM during a probe run). This is the core fix for TEAM-2616.
func TestCleanupRunsWhenContextCancelled(t *testing.T) {
	var cleanupCalled atomic.Bool
	var cleanupCtxWasActive atomic.Bool

	cfg := &config.Config{
		CleanupTimeout: 5 * time.Second,
	}

	// Parent context is already cancelled (simulates SIGTERM)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately — simulating SIGTERM arriving

	createStep := &mockStep{
		name: "create",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			state.CreatedResource = true
			state.RoutineID = "rtn_test_123"
			return steps.StepResult{Status: "pass"}
		},
	}

	cleanupStep := &mockStep{
		name: "cleanup",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			cleanupCalled.Store(true)
			// The critical assertion: cleanup's context must NOT be cancelled
			if ctx.Err() == nil {
				cleanupCtxWasActive.Store(true)
			}
			return steps.StepResult{Status: "pass"}
		},
	}

	// Run with cancelled parent context
	RunWithSteps(ctx, cfg, nil, createStep, nil, nil, cleanupStep)

	if !cleanupCalled.Load() {
		t.Fatal("cleanup step was not called")
	}
	if !cleanupCtxWasActive.Load() {
		t.Fatal("cleanup step received a cancelled context — the fix is not working")
	}
}

// TestCleanupSkippedWhenNoResourceCreated verifies that cleanup is not
// invoked when no routine was created (e.g., health check failed before creation).
func TestCleanupSkippedWhenNoResourceCreated(t *testing.T) {
	var cleanupCalled atomic.Bool

	cfg := &config.Config{
		CleanupTimeout: 5 * time.Second,
	}

	createStep := &mockStep{
		name: "create",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			// Fails without creating a resource
			return steps.StepResult{Status: "fail"}
		},
	}

	cleanupStep := &mockStep{
		name: "cleanup",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			cleanupCalled.Store(true)
			return steps.StepResult{Status: "pass"}
		},
	}

	RunWithSteps(context.Background(), cfg, nil, createStep, nil, nil, cleanupStep)

	if cleanupCalled.Load() {
		t.Fatal("cleanup should not be called when no resource was created")
	}
}

// TestCleanupCalledOnTriggerFailure verifies cleanup runs if trigger fails
// after a resource was successfully created.
func TestCleanupCalledOnTriggerFailure(t *testing.T) {
	var cleanupCalled atomic.Bool

	cfg := &config.Config{
		CleanupTimeout: 5 * time.Second,
	}

	createStep := &mockStep{
		name: "create",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			state.CreatedResource = true
			state.RoutineID = "rtn_trigger_fail"
			return steps.StepResult{Status: "pass"}
		},
	}

	triggerStep := &mockStep{
		name: "trigger",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			return steps.StepResult{Status: "fail"}
		},
	}

	cleanupStep := &mockStep{
		name: "cleanup",
		runFunc: func(ctx context.Context, state *steps.RunState) steps.StepResult {
			cleanupCalled.Store(true)
			// Verify context is NOT cancelled
			if ctx.Err() != nil {
				t.Error("cleanup context should not be cancelled")
			}
			return steps.StepResult{Status: "pass"}
		},
	}

	RunWithSteps(context.Background(), cfg, nil, createStep, triggerStep, nil, cleanupStep)

	if !cleanupCalled.Load() {
		t.Fatal("cleanup should be called when trigger fails and resource exists")
	}
}
