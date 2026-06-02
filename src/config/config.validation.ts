import * as Joi from 'joi';

const configValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  EXTRACTION_ENGINE: Joi.string().valid('mock', 'langflow').default('mock'),
  REDIS_URL: Joi.string().required(),
  LANGFLOW_BASE_URL: Joi.when('EXTRACTION_ENGINE', {
    is: 'langflow',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().optional(),
  }),
  LANGFLOW_FLOW_ID: Joi.string().optional().allow(''),
  LANGFLOW_API_KEY: Joi.string().optional().allow(''),
  LANGFLOW_TIMEOUT_MS: Joi.number().default(30000),
  OPENAI_API_KEY: Joi.when('EXTRACTION_ENGINE', {
    is: 'langflow',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_BUCKET: Joi.string().default('document-intelligence'),
  S3_PREFIX: Joi.string().default('documents'),
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false),
  MAX_UPLOAD_SIZE_BYTES: Joi.number().default(5 * 1024 * 1024),
  THROTTLE_TTL: Joi.number().default(60_000),
  THROTTLE_LIMIT: Joi.number().default(60),
  FAILED_JOB_RETRY_BASE_MS: Joi.number().default(5 * 60_000),
  MAX_SCHEDULER_RETRIES: Joi.number().integer().min(1).default(3),
  CORS_ORIGINS: Joi.string().default('*'),
  SHUTDOWN_TIMEOUT_MS: Joi.number().default(8_000),
});

export { configValidationSchema };
