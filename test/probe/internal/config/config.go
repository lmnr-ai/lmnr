package config

import (
	"os"
	"time"
)

// Config holds probe configuration.
type Config struct {
	TargetURL      string
	AuthToken      string
	CreateTimeout  time.Duration
	HealthTimeout  time.Duration
	ExecTimeout    time.Duration
	PollInterval   time.Duration
	CleanupTimeout time.Duration
}

// Load returns the probe configuration from environment variables with defaults.
func Load() *Config {
	cfg := &Config{
		TargetURL:      envOrDefault("PROBE_TARGET_URL", "http://localhost:8080"),
		AuthToken:      envOrDefault("PROBE_AUTH_TOKEN", ""),
		CreateTimeout:  5 * time.Second,
		HealthTimeout:  2 * time.Second,
		ExecTimeout:    30 * time.Second,
		PollInterval:   2 * time.Second,
		CleanupTimeout: 5 * time.Second,
	}
	return cfg
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
