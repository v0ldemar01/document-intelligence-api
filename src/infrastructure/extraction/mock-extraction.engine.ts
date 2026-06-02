import { Injectable } from '@nestjs/common';
import {
  ExtractionEngine,
  ExtractionRequest,
  ExtractionResponse,
} from '../../domain/extraction-engine';

@Injectable()
class MockExtractionEngine implements ExtractionEngine {
  extract(request: ExtractionRequest): Promise<ExtractionResponse> {
    const text = request.text.replace(/\s+/g, ' ').trim();
    const invoiceNumber =
      this.matchText(text, /invoice\s*(?:no|number|#)?[: \s-]*([A-Z0-9-]+)/i) ??
      'INV-2026-001';
    const date = this.matchText(text, /(\d{4}-\d{2}-\d{2})/i) ?? '2026-04-03';

    const vendor =
      this.matchText(
        text,
        /vendor[: \s-]+(.+?)(?=\s+[A-Za-z]+\s*[:-]|\s*$)/i,
      ) ?? 'Example Ltd';
    const amountMatch = this.matchText(
      text,
      /(?:amount|total)[: \s-]*([0-9]+(?:[.,][0-9]{2})?)/i,
    );
    const amount = amountMatch
      ? Number(amountMatch.replace(',', '.'))
      : 1250.75;
    const currency =
      this.matchText(text, /(EUR|USD|GBP|AED|PLN|CHF)/i)?.toUpperCase() ??
      'EUR';

    return Promise.resolve({
      payload: {
        documentType: request.documentType,
        fields: {
          invoiceNumber,
          date,
          vendor,
          amount,
          currency,
        },
        prompt: request.catalog.prompt.template,
      },
      confidence: 0.91,
    });
  }

  private matchText(text: string, expression: RegExp): string | undefined {
    const match = expression.exec(text);
    return match?.[1]?.trim();
  }
}

export { MockExtractionEngine };
