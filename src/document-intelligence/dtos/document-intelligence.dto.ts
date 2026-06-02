import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'document-intelligence-api' })
  service!: string;
}

class DocumentRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  storagePath!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  checksum!: string;

  @ApiProperty()
  documentType!: string;

  @ApiProperty()
  extractedText!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class JobResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  jobId!: string;

  @ApiProperty({ type: Object })
  payload!: Record<string, unknown>;

  @ApiProperty()
  confidence!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class ProviderRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ type: Object })
  configuration!: Record<string, unknown>;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class ModelRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty({ type: Object })
  configuration!: Record<string, unknown>;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class FlowRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  modelId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  langflowFlowId!: string;

  @ApiProperty({ type: Object })
  configuration!: Record<string, unknown>;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class PromptRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  flowId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  template!: string;

  @ApiProperty({ type: Object })
  outputSchema!: Record<string, unknown>;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

class JobRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  providerId!: string;

  @ApiProperty()
  modelId!: string;

  @ApiProperty()
  flowId!: string;

  @ApiProperty()
  promptId!: string;

  @ApiProperty({ enum: ['created', 'running', 'completed', 'failed'] })
  status!: 'created' | 'running' | 'completed' | 'failed';

  @ApiPropertyOptional()
  errorMessage!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: () => DocumentRecordDto })
  document?: DocumentRecordDto;

  @ApiPropertyOptional({ type: () => ProviderRecordDto })
  provider?: ProviderRecordDto;

  @ApiPropertyOptional({ type: () => ModelRecordDto })
  model?: ModelRecordDto;

  @ApiPropertyOptional({ type: () => FlowRecordDto })
  flow?: FlowRecordDto;

  @ApiPropertyOptional({ type: () => PromptRecordDto })
  prompt?: PromptRecordDto;

  @ApiPropertyOptional({ type: () => JobResultDto, nullable: true })
  result?: JobResultDto | null;
}

class UploadDocumentResponseDto {
  @ApiProperty({ type: () => DocumentRecordDto })
  document!: DocumentRecordDto;

  @ApiProperty({ type: () => JobRecordDto })
  job!: JobRecordDto;
}

class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

class JobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['created', 'running', 'completed', 'failed'] })
  @IsOptional()
  @IsString()
  status?: 'created' | 'running' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'Filter by document ID' })
  @IsOptional()
  @IsUUID()
  documentId?: string;
}

class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data!: T[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

class ExtractionResultRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  jobId!: string;

  @ApiProperty({ type: Object })
  payload!: Record<string, unknown>;

  @ApiProperty()
  confidence!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export {
  HealthResponseDto,
  DocumentRecordDto,
  JobResultDto,
  ProviderRecordDto,
  ModelRecordDto,
  FlowRecordDto,
  PromptRecordDto,
  JobRecordDto,
  UploadDocumentResponseDto,
  PaginationQueryDto,
  JobsQueryDto,
  PaginatedResponseDto,
  ExtractionResultRecordDto,
};
