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
    protobuf-compiler \
    libfontconfig1-dev \
    libfontconfig \ 
    libclang-dev

# Clean up some unnecessary apt artifacts
RUN rm -rf /var/lib/apt/lists/*

WORKDIR /app-server
COPY . .

EXPOSE 8000
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}
RUN cargo build --release --all

CMD ["./target/release/app-server"]