import { BadRequestException } from '@nestjs/common';
import { DocumentUploadValidationPipe } from './document-upload-validation.pipe';
import { DEFAULT_MAX_UPLOAD_SIZE_BYTES } from '../../domain/tokens';
import { UploadedDocumentFile } from '../types/types';

const makeFile = (
  overrides: Partial<{
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }>,
) => ({
  originalname: 'invoice.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  buffer: Buffer.from('test'),
  ...overrides,
});

describe('DocumentUploadValidationPipe', () => {
  let pipe: DocumentUploadValidationPipe;

  beforeEach(() => {
    pipe = new DocumentUploadValidationPipe();
  });

  it('passes a valid PDF', () => {
    const file = makeFile({});
    expect(pipe.transform(file)).toBe(file);
  });

  it('passes a valid DOCX', () => {
    const file = makeFile({
      originalname: 'contract.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(pipe.transform(file)).toBe(file);
  });

  it('passes a valid TXT', () => {
    const file = makeFile({
      originalname: 'notes.txt',
      mimetype: 'text/plain',
    });
    expect(pipe.transform(file)).toBe(file);
  });

  it('passes a valid CSV', () => {
    const file = makeFile({ originalname: 'data.csv', mimetype: 'text/csv' });
    expect(pipe.transform(file)).toBe(file);
  });

  it('throws on unsupported extension', () => {
    const file = makeFile({
      originalname: 'script.exe',
      mimetype: 'application/octet-stream',
    });
    expect(() => pipe.transform(file)).toThrow(BadRequestException);
  });

  it('throws on unsupported MIME type', () => {
    const file = makeFile({ originalname: 'image.png', mimetype: 'image/png' });
    expect(() => pipe.transform(file)).toThrow(BadRequestException);
  });

  it('throws when file exceeds size limit', () => {
    const file = makeFile({ size: DEFAULT_MAX_UPLOAD_SIZE_BYTES + 1 });
    expect(() => pipe.transform(file)).toThrow(BadRequestException);
  });

  it('passes a file exactly at the size limit', () => {
    const file = makeFile({ size: DEFAULT_MAX_UPLOAD_SIZE_BYTES });
    expect(pipe.transform(file)).toBe(file);
  });

  it('throws when no file is provided', () => {
    expect(() =>
      pipe.transform(undefined as unknown as UploadedDocumentFile),
    ).toThrow(BadRequestException);
  });
});
