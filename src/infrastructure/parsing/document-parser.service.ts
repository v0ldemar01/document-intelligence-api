import { BadRequestException, Injectable } from '@nestjs/common';
import { parse as parseCsv } from 'csv-parse/sync';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { recognize } from 'tesseract.js';
import { DocumentParser, ParsedDocument } from '../../domain/document-parser';

@Injectable()
class DocumentParserService implements DocumentParser {
  async parse(
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<ParsedDocument> {
    const extension = this.getExtension(fileName);

    if (extension === '.pdf' || mimeType === 'application/pdf') {
      const parsed = await pdfParse(buffer);
      return {
        documentType: 'invoice',
        text: parsed.text.trim(),
      };
    }

    if (
      extension === '.docx' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const parsed = await mammoth.extractRawText({ buffer });
      return {
        documentType: 'invoice',
        text: parsed.value.trim(),
      };
    }

    if (
      extension === '.csv' ||
      mimeType === 'text/csv' ||
      mimeType === 'application/csv'
    ) {
      const records = parseCsv(buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;

      const text = records
        .map(
          (record, index) =>
            `Row ${index + 1}: ${Object.entries(record)
              .map(([key, value]) => `${key}=${value}`)
              .join(', ')}`,
        )
        .join('\n');

      return {
        documentType: 'invoice',
        text: text.trim() || buffer.toString('utf8').trim(),
      };
    }

    if (extension === '.txt' || mimeType === 'text/plain') {
      return {
        documentType: 'invoice',
        text: buffer.toString('utf8').trim(),
      };
    }

    if (
      ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ||
      ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeType)
    ) {
      const recognized = await recognize(buffer, 'eng');
      return {
        documentType: 'invoice',
        text: recognized.data.text.trim(),
      };
    }

    throw new BadRequestException(
      `Unsupported file type: ${mimeType || extension}`,
    );
  }

  private getExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1) {
      return '';
    }

    return fileName.slice(dotIndex).toLowerCase();
  }
}

export { DocumentParserService };
