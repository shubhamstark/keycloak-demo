FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o admin-service .

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/admin-service /
EXPOSE 8082
ENTRYPOINT ["/admin-service"]
