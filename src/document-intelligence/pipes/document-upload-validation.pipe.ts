import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { extname } from 'path';
import { DEFAULT_MAX_UPLOAD_SIZE_BYTES } from '../../domain/tokens';
import { UploadedDocumentFile } from '../types/types';

const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.csv']);
const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/csv',
]);

@Injectable()
class DocumentUploadValidationPipe
  implements PipeTransform<UploadedDocumentFile, UploadedDocumentFile>
{
  transform(value: UploadedDocumentFile): UploadedDocumentFile {
    if (!value) {
      throw new BadRequestException('A document file is required');
    }

    const extension = extname(value.originalname).toLowerCase();
    const isAllowedType =
      allowedExtensions.has(extension) || allowedMimeTypes.has(value.mimetype);

    if (!isAllowedType) {
      throw new BadRequestException(
        `Unsupported file type: ${value.mimetype || extension}`,
      );
    }

    if (value.size > DEFAULT_MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException(
        `File too large. Maximum size is ${DEFAULT_MAX_UPLOAD_SIZE_BYTES} bytes`,
      );
    }

    return value;
  }
}

export { DocumentUploadValidationPipe };
