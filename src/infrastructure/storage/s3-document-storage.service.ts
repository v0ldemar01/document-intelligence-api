import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DocumentStorage } from '../../domain/document-storage';
import { UploadedDocumentFile } from '../../document-intelligence/types/uploaded-document-file';
import { AwsS3Service } from './aws-s3.service';

@Injectable()
class S3DocumentStorageService implements DocumentStorage {
  private readonly prefix: string;

  constructor(
    private readonly config: ConfigService,
    private readonly s3: AwsS3Service,
  ) {
    this.prefix = this.config.get<string>('storage.s3.prefix') ?? 'documents';
  }

  async save(file: UploadedDocumentFile): Promise<string> {
    const key = `${this.prefix}/${this.buildKey(file.originalname)}`;
    await this.s3.putObject(key, file.buffer, file.mimetype);
    return this.s3.objectUri(key);
  }

  private buildKey(originalName: string): string {
    const normalized = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${Date.now()}-${randomUUID()}-${normalized}`;
  }
}

export { S3DocumentStorageService };
