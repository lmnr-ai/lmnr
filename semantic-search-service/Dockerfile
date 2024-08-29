# This dockerfile is used to build the semantic-search-service binary

# Uses the bullseye-slim debian image per the rust recommendation.
FROM rust:1.76-slim-bullseye AS builder

# Install g++ and other build essentials for compiling openssl/tls dependencies
RUN apt update
RUN apt install -y build-essential

# Install other openssl / native tls dependencies
RUN apt-get update
RUN apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler

# Clean up some unnecessary apt artifacts that are not necessary
RUN rm -rf /var/lib/apt/lists/*

# Build the repo-query binary
WORKDIR /semantic-search-service
COPY . .

EXPOSE 8080

RUN cargo build --release --all

ENV ORT_DYLIB_PATH=./target/release/libonnxruntime.so
CMD ["./target/release/semantic-search-service"]