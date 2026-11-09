# Build stage with cargo chef for dependency caching
FROM rust:1.98-slim-trixie AS chef
WORKDIR /app-server

# Install build dependencies and cargo-chef
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    protobuf-compiler \
    libclang-dev \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef

# Prepare recipe for dependency caching
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Build dependencies - this layer is cached
FROM chef AS builder
COPY --from=planner /app-server/recipe.json recipe.json
# Build dependencies
RUN cargo chef cook --release --recipe-path recipe.json
# Cooked twice on purpose: `[dev-dependencies]` activates tokio's `test-util`,
# which the binary's resolution does not, so `cargo test` needs a second set of
# dependency fingerprints (73 of the 533 crates — tokio and everything
# downstream of it; the rest are reused from the cook above). Without this layer
# every CI run rebuilds those 73 before it can start the tests. Keep the plain
# cook first: it is what the binary links, and dropping it moves the rebuild
# into the uncached application layer. See docs/internal/backend-ci.md.
RUN cargo chef cook --release --tests --recipe-path recipe.json

# Build application
COPY . .
RUN cargo build --release --all

# Final runtime stage
FROM debian:trixie-slim AS runtime
WORKDIR /app-server

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app-server/target/release/app-server .
# Copy data files for name generation
COPY data/ /app-server/data/

EXPOSE 8000
EXPOSE 8001

CMD ["./app-server"]
