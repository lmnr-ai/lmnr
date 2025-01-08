# Build stage with cargo chef for dependency caching
FROM rust:1.81-slim-bullseye AS chef
WORKDIR /app-server

# Install build dependencies and cargo-chef
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    libfontconfig1-dev \
    libfontconfig \
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

# Build application
COPY . .
RUN cargo build --release --all

# Final runtime stage
FROM debian:bullseye-slim AS runtime
WORKDIR /app-server

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    libssl1.1 \
    libfontconfig1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app-server/target/release/app-server .
# Copy data files for name generation
COPY data/ /app-server/data/

EXPOSE 8000
EXPOSE 8001

CMD ["./app-server"]
