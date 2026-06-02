import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DEFAULT_MAX_UPLOAD_SIZE_BYTES } from '../domain/tokens';
import {
  DocumentRecordDto,
  ExtractionResultRecordDto,
  FlowRecordDto,
  JobRecordDto,
  ModelRecordDto,
  PromptRecordDto,
  ProviderRecordDto,
  UploadDocumentResponseDto,
} from './dtos/dtos';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentUploadValidationPipe } from './pipes/document-upload-validation.pipe';
import type { UploadedDocumentFile } from './types/types';

@ApiTags('document-intelligence')
@Controller()
class DocumentIntelligenceController {
  constructor(
    private readonly documentIntelligenceService: DocumentIntelligenceService,
  ) {}

  @Get('providers')
  @ApiOkResponse({ type: ProviderRecordDto, isArray: true })
  providers() {
    return this.documentIntelligenceService.listProviders();
  }

  @Get('models')
  @ApiOkResponse({ type: ModelRecordDto, isArray: true })
  models() {
    return this.documentIntelligenceService.listModels();
  }

  @Get('flows')
  @ApiOkResponse({ type: FlowRecordDto, isArray: true })
  flows() {
    return this.documentIntelligenceService.listFlows();
  }

  @Get('prompts')
  @ApiOkResponse({ type: PromptRecordDto, isArray: true })
  prompts() {
    return this.documentIntelligenceService.listPrompts();
  }

  @Get('documents')
  @ApiOkResponse({ type: DocumentRecordDto, isArray: true })
  documents() {
    return this.documentIntelligenceService.listDocuments();
  }

  @Get('documents/:id')
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: DocumentRecordDto })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async document(@Param('id') id: string): Promise<DocumentRecordDto> {
    const doc = await this.documentIntelligenceService.getDocument(id);
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse({ description: 'Document deleted' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async deleteDocument(@Param('id') id: string): Promise<void> {
    const doc = await this.documentIntelligenceService.getDocument(id);
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    await this.documentIntelligenceService.deleteDocument(id);
  }

  @Get('jobs')
  @ApiOkResponse({ type: JobRecordDto, isArray: true })
  jobs() {
    return this.documentIntelligenceService.listJobs();
  }

  @Get('jobs/:id')
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: JobRecordDto })
  @ApiNotFoundResponse({ description: 'Job not found' })
  async job(@Param('id') id: string): Promise<JobRecordDto> {
    const job = await this.documentIntelligenceService.getJob(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  @Get('jobs/:id/result')
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: ExtractionResultRecordDto })
  @ApiNotFoundResponse({
    description: 'Job not found or result not available yet',
  })
  async jobResult(@Param('id') id: string): Promise<ExtractionResultRecordDto> {
    const job = await this.documentIntelligenceService.getJob(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    if (!job.result)
      throw new NotFoundException(
        `Job ${id} has no result yet (status: ${job.status})`,
      );
    return job.result;
  }

  @Post('jobs/:id/retry')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id' })
  @ApiCreatedResponse({
    type: JobRecordDto,
    description: 'New retry job created',
  })
  @ApiNotFoundResponse({ description: 'Job not found' })
  async retryJob(@Param('id') id: string): Promise<JobRecordDto> {
    const job = await this.documentIntelligenceService.getJob(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return this.documentIntelligenceService.retryJob(id);
  }

  @Post('documents')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a document and trigger extraction' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        flowId: {
          type: 'string',
          description:
            'Optional flow ID override (leave empty to use default catalog flow)',
          example: '',
        },
        promptId: {
          type: 'string',
          description:
            'Optional prompt ID override (leave empty to use default catalog prompt)',
          example: '',
        },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: UploadDocumentResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DEFAULT_MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  uploadDocument(
    @UploadedFile(new DocumentUploadValidationPipe())
    file: UploadedDocumentFile,
    @Body('flowId') flowId?: string,
    @Body('promptId') promptId?: string,
  ): Promise<UploadDocumentResponseDto> {
    return this.documentIntelligenceService.uploadDocument(file, {
      flowId,
      promptId,
    });
  }
}

export { DocumentIntelligenceController };
