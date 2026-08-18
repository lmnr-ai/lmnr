package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/lmnr-ai/lmnr/test/probe/internal/config"
	"github.com/lmnr-ai/lmnr/test/probe/internal/runner"
)

func main() {
	cfg := config.Load()

	// Signal handling: SIGTERM/SIGINT cancel the run context.
	// Previously, this cancellation propagated into the cleanup step,
	// causing DeleteRoutine to fail with "context canceled" and leaking
	// the test routine. The runner now uses a detached context for cleanup.
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()

	slog.Info("probe starting", "target_url", cfg.TargetURL)

	result := runner.Run(ctx, cfg)
	if !result.Success {
		fmt.Fprintf(os.Stderr, "probe run failed: %s\n", result.Error)
		os.Exit(1)
	}

	slog.Info("probe run completed successfully")
}
