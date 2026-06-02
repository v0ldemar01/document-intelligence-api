export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS ?? '*',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  storage: {
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET ?? 'document-intelligence',
      prefix: process.env.S3_PREFIX ?? 'documents',
      region: process.env.AWS_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  langflow: {
    baseUrl: process.env.LANGFLOW_BASE_URL ?? 'http://langflow:7860/api/v1',
    apiKey: process.env.LANGFLOW_API_KEY,
    flowId: process.env.LANGFLOW_FLOW_ID,
    timeoutMs: parseInt(process.env.LANGFLOW_TIMEOUT_MS ?? '30000', 10),
  },

  processing: {
    failedJobRetryBaseMs: parseInt(
      process.env.FAILED_JOB_RETRY_BASE_MS ?? String(5 * 60_000),
      10,
    ),
    maxSchedulerRetries: parseInt(process.env.MAX_SCHEDULER_RETRIES ?? '3', 10),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  },

  extraction: {
    engine: process.env.EXTRACTION_ENGINE ?? 'mock',
  },

  upload: {
    maxSizeBytes: parseInt(
      process.env.MAX_UPLOAD_SIZE_BYTES ?? String(5 * 1024 * 1024),
      10,
    ),
  },

  shutdown: {
    timeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '15000', 10),
  },
});
