# Document Intelligence API

NestJS service for the SpheraX Document Intelligence challenge. The system uploads documents, extracts structured data from them using LangFlow as the LLM orchestration layer, and exposes the workflow through a clean REST API with a PostgreSQL-backed domain model.

## Stack

| Layer             | Technology                                              |
| ----------------- | ------------------------------------------------------- |
| Runtime           | Node.js 22, NestJS                                      |
| Database          | PostgreSQL 16, Prisma ORM                               |
| Migrations        | Prisma Migrate                                          |
| Queue             | BullMQ + Redis 7                                        |
| Object Storage    | AWS S3 / LocalStack                                     |
| LLM Orchestration | LangFlow                                                |
| Parsing           | `pdf-parse`, `mammoth`, `csv-parse`, `tesseract.js`     |
| Config            | `@nestjs/config` + Joi validation                       |
| Health            | `@nestjs/terminus`                                      |
| Rate Limiting     | `@nestjs/throttler`                                     |
| Logging           | `nestjs-pino` (structured JSON, request-id propagation) |
| API Docs          | `@nestjs/swagger` at `/docs`                            |

## Architecture Overview

```
src/
  config/               configuration.ts + Joi validation schema
  common/filters/       AllExceptionsFilter (maps Prisma errors → HTTP codes)
  health/               HealthController, PrismaHealthIndicator, RedisHealthIndicator
  domain/
    ports/              CatalogRepository, DocumentRepository, JobRepository
                        ExtractionEngine, DocumentStorage, DocumentJobDispatcher
    tokens.ts           DI Symbol tokens
    document-intelligence.types.ts  all domain record types
  document-intelligence/
    catalog/            CatalogService  (seeding + catalog reads)
    use-cases/          UploadDocumentUseCase, ProcessDocumentJobUseCase
    document-intelligence.service.ts   thin facade over use cases
    document-intelligence.controller.ts
    dto/                request + response DTOs with class-validator decorators
    pipes/              DocumentUploadValidationPipe
  infrastructure/
    persistence/        PrismaDocumentIntelligenceRepository (implements all 3 repo ports)
    extraction/         LangFlowExtractionEngine, MockExtractionEngine
    parsing/            DocumentParserService
    storage/            AwsS3Service, S3DocumentStorageService
    queue/              BullMqDocumentJobDispatcherService, BullMqDocumentJobWorkerService
```

The domain layer has zero infrastructure imports. Every infrastructure class is wired at module level via DI tokens, making each adapter replaceable without touching business logic.

## Domain Model

```
Provider → AiModel → Flow → Prompt
                              ↓
Document ─────────────────→ Job → ExtractionResult
```

| Entity               | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| **Provider**         | LLM provider configuration (OpenAI, Anthropic, etc.)                     |
| **AiModel**          | Specific model within a provider                                         |
| **Flow**             | LangFlow flow definition; references provider + model                    |
| **Prompt**           | Extraction prompt template; references a flow                            |
| **Document**         | Uploaded file metadata + extracted plain text                            |
| **Job**              | Extraction task — links document to catalog (provider/model/flow/prompt) |
| **ExtractionResult** | Structured JSON payload + confidence score from the LLM                  |

## REST API

| Method   | Path               | Description                                    |
| -------- | ------------------ | ---------------------------------------------- |
| `GET`    | `/health`          | Liveness/readiness — checks DB and Redis       |
| `GET`    | `/providers`       | List all LLM providers                         |
| `GET`    | `/models`          | List all AI models                             |
| `GET`    | `/flows`           | List all LangFlow flows                        |
| `GET`    | `/prompts`         | List all prompt templates                      |
| `GET`    | `/documents`       | List all uploaded documents                    |
| `GET`    | `/documents/:id`   | Get a single document by ID                    |
| `DELETE` | `/documents/:id`   | Delete a document and cascade its jobs/results |
| `GET`    | `/jobs`            | List all extraction jobs                       |
| `GET`    | `/jobs/:id`        | Get a job with its full catalog snapshot       |
| `GET`    | `/jobs/:id/result` | Get the extraction result for a completed job  |
| `POST`   | `/jobs/:id/retry`  | Re-run extraction for a failed job             |
| `POST`   | `/documents`       | Upload a document and trigger extraction       |

Interactive Swagger UI: **`http://localhost:3000/docs`**

### Upload request

```bash
# Minimal upload (uses default flow + prompt)
curl -F "file=@invoice.pdf" http://localhost:3000/documents

# Specify a custom flow and prompt
curl -F "file=@invoice.pdf" \
     -F "flowId=<flow-cuid>" \
     -F "promptId=<prompt-cuid>" \
     http://localhost:3000/documents
```

### Example extraction response

```json
{
  "document": {
    "id": "clx...",
    "fileName": "invoice.pdf",
    "documentType": "invoice",
    "mimeType": "application/pdf",
    "size": 14832,
    "storagePath": "s3://document-intelligence/documents/1748000000-uuid-invoice.pdf"
  },
  "job": {
    "id": "clx...",
    "status": "completed",
    "result": {
      "payload": {
        "documentType": "invoice",
        "fields": {
          "invoiceNumber": "INV-2026-001",
          "date": "2026-04-03",
          "vendor": "Example Ltd",
          "amount": 1250.75,
          "currency": "EUR"
        }
      },
      "confidence": 0.91
    }
  }
}
```

## Supported File Types

| Format                  | Parser             |
| ----------------------- | ------------------ |
| `.pdf`                  | `pdf-parse`        |
| `.docx`                 | `mammoth`          |
| `.txt`                  | UTF-8 decode       |
| `.csv`                  | `csv-parse`        |
| `.png`, `.jpg`, `.jpeg` | `tesseract.js` OCR |

Unsupported types receive a `400 Bad Request` with a clear error message. Maximum upload size defaults to 5 MB (configurable via `MAX_UPLOAD_SIZE_BYTES`).

## Processing Modes

| Mode    | Behaviour                                                                                                          | When to use               |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `sync`  | Extraction runs inline; the upload request blocks until complete. Response contains the finished job.              | Local development, demos  |
| `queue` | Upload returns immediately with `status: running`. BullMQ worker processes the job asynchronously. Redis required. | Production / Docker stack |

Set via `PROCESSING_MODE` environment variable.

## Extraction Engines

| Engine     | Behaviour                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mock`     | Deterministic regex-based extractor. Extracts invoice number, date, vendor, amount, currency from plain text. No external dependencies.  |
| `langflow` | Calls the LangFlow `/run/{flowId}` API with the parsed document text, prompt template, and model configuration. Returns structured JSON. |

Set via `EXTRACTION_ENGINE` environment variable.

## Local Development

Requires a running PostgreSQL, Redis (if `PROCESSING_MODE=queue`), and LocalStack (for S3 storage).

```bash
# 1. Start backing services only
docker compose up postgres redis localstack -d

# 2. Copy and configure environment
cp .env.example .env
# Edit .env: set PROCESSING_MODE=sync, EXTRACTION_ENGINE=mock for fastest feedback

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client
pnpm db:generate

# 5. Run migrations
pnpm db:migrate

# 6. Start the API
pnpm start:dev
```

> **Note:** All storage goes through S3. For local development, LocalStack provides an S3-compatible endpoint at `http://localhost:4566`. The `S3_ENDPOINT` env var points the SDK to LocalStack; omit it for real AWS.

## Docker Compose (Full Stack)

```bash
docker compose up --build
```

Starts: **PostgreSQL** → **Redis** → **LocalStack** → **LangFlow** → **API** (in dependency order with health checks).

The API container automatically runs `prisma migrate deploy` before starting. No manual migration step needed.

| Service      | Default Port | Purpose                      |
| ------------ | ------------ | ---------------------------- |
| `postgres`   | 5432         | Primary database             |
| `redis`      | 6379         | BullMQ queue broker          |
| `localstack` | 4566         | S3-compatible object storage |
| `langflow`   | 7860         | LLM flow orchestration       |
| `api`        | 3000         | This service                 |

After startup, configure LangFlow: open `http://localhost:7860` and follow [docs/langflow-flow.md](docs/langflow-flow.md).

## Database Migrations

Migrations live in `prisma/migrations/` and are version-controlled.

```bash
# Create a new migration (dev only)
pnpm db:migrate

# Apply all pending migrations (production / Docker)
pnpm db:migrate:deploy

# Regenerate Prisma client after schema changes
pnpm db:generate
```

## Environment Variables

| Variable                | Required      | Default                 | Description                                         |
| ----------------------- | ------------- | ----------------------- | --------------------------------------------------- |
| `DATABASE_URL`          | ✅            | —                       | PostgreSQL connection string                        |
| `PROCESSING_MODE`       |               | `sync`                  | `sync` or `queue`                                   |
| `EXTRACTION_ENGINE`     |               | `mock`                  | `mock` or `langflow`                                |
| `REDIS_URL`             | when queue    | —                       | Redis connection URL                                |
| `LANGFLOW_BASE_URL`     | when langflow | —                       | LangFlow API base URL                               |
| `LANGFLOW_FLOW_ID`      | when langflow | —                       | ID of the flow to run                               |
| `LANGFLOW_API_KEY`      |               | —                       | Optional LangFlow API key                           |
| `LANGFLOW_TIMEOUT_MS`   |               | `30000`                 | LangFlow request timeout                            |
| `S3_ENDPOINT`           |               | —                       | Custom S3 endpoint (LocalStack). Omit for real AWS. |
| `AWS_REGION`            |               | `us-east-1`             | AWS region                                          |
| `AWS_ACCESS_KEY_ID`     |               | —                       | AWS / LocalStack key                                |
| `AWS_SECRET_ACCESS_KEY` |               | —                       | AWS / LocalStack secret                             |
| `S3_BUCKET`             |               | `document-intelligence` | S3 bucket name                                      |
| `S3_PREFIX`             |               | `documents`             | Key prefix within the bucket                        |
| `S3_FORCE_PATH_STYLE`   |               | `false`                 | Set `true` for LocalStack                           |
| `MAX_UPLOAD_SIZE_BYTES` |               | `5242880` (5 MB)        | Upload size limit                                   |
| `THROTTLE_TTL`          |               | `60000`                 | Rate limit window (ms)                              |
| `THROTTLE_LIMIT`        |               | `60`                    | Max requests per window (upload: 10/min)            |
| `CORS_ORIGINS`          |               | `*`                     | Comma-separated allowed origins                     |
| `PORT`                  |               | `3000`                  | HTTP port                                           |

See `.env.example` for a complete reference with all Docker Compose port overrides.

## Tests

```bash
# Unit tests
pnpm test

# Unit tests in watch mode
pnpm test:watch

# E2e tests
pnpm test:e2e --runInBand

# Coverage report
pnpm test:cov
```

The test suite uses `InMemoryDocumentIntelligenceRepository`, `MockExtractionEngine`, and in-memory stubs for storage and queue dispatch — no live external services required.

## Further Reading

- [docs/under-the-hood.md](docs/under-the-hood.md) — Internal architecture and request lifecycle
- [docs/database-concurrency.md](docs/database-concurrency.md) — Transactions, isolation levels, and advisory locks
- [docs/langflow-flow.md](docs/langflow-flow.md) — How to build the LangFlow extraction flow
- [docs/setup-guide.md](docs/setup-guide.md) — Step-by-step setup for all environments
