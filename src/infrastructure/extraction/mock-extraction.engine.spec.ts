import { MockExtractionEngine } from './mock-extraction.engine';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';
import { CatalogBundle } from '../../domain/document-intelligence.types';

const catalog: CatalogBundle = {
  provider: {
    ...DEFAULT_CATALOG.provider,
    id: 'p1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  model: {
    ...DEFAULT_CATALOG.model,
    id: 'm1',
    providerId: 'p1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  flow: {
    ...DEFAULT_CATALOG.flow,
    id: 'f1',
    providerId: 'p1',
    modelId: 'm1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  prompt: {
    ...DEFAULT_CATALOG.prompt,
    id: 'pr1',
    flowId: 'f1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const request = (text: string) => ({ text, documentType: 'invoice', catalog });

describe('MockExtractionEngine', () => {
  let engine: MockExtractionEngine;

  beforeEach(() => {
    engine = new MockExtractionEngine();
  });

  it('extracts invoice number', async () => {
    const result = await engine.extract(
      request('Invoice Number: INV-2026-001\nVendor: ACME'),
    );
    expect(result.payload.fields).toMatchObject({
      invoiceNumber: 'INV-2026-001',
    });
  });

  it('extracts date in YYYY-MM-DD format', async () => {
    const result = await engine.extract(
      request('Date: 2026-04-03\nVendor: ACME'),
    );
    expect(result.payload.fields).toMatchObject({ date: '2026-04-03' });
  });

  it('extracts vendor name', async () => {
    const result = await engine.extract(
      request('Vendor: SpheraX Ltd\nAmount: 100 EUR'),
    );
    expect(result.payload.fields).toMatchObject({ vendor: 'SpheraX Ltd' });
  });

  it('extracts amount as a number', async () => {
    const result = await engine.extract(request('Total: 1250.75 EUR'));
    expect(result.payload.fields).toMatchObject({ amount: 1250.75 });
  });

  it('extracts EUR currency', async () => {
    const result = await engine.extract(request('Amount: 99.00 EUR'));
    expect(result.payload.fields).toMatchObject({ currency: 'EUR' });
  });

  it('extracts USD currency', async () => {
    const result = await engine.extract(request('Total: 499.90 USD'));
    expect(result.payload.fields).toMatchObject({ currency: 'USD' });
  });

  it('falls back to defaults when fields are missing', async () => {
    const result = await engine.extract(request('Some random document text'));
    expect(result.payload.fields).toMatchObject({
      invoiceNumber: 'INV-2026-001',
      date: '2026-04-03',
      vendor: 'Example Ltd',
      amount: 1250.75,
      currency: 'EUR',
    });
  });

  it('returns confidence of 0.91', async () => {
    const result = await engine.extract(request('Invoice Number: INV-001'));
    expect(result.confidence).toBe(0.91);
  });

  it('includes documentType in payload', async () => {
    const result = await engine.extract(request('Invoice Number: INV-001'));
    expect(result.payload.documentType).toBe('invoice');
  });

  it('parses full invoice text end-to-end', async () => {
    const text = [
      'Invoice Number: INV-2026-001',
      'Date: 2026-05-31',
      'Vendor: SpheraX Ltd',
      'Amount: 499.90 USD',
    ].join('\n');

    const result = await engine.extract(request(text));

    expect(result.payload.fields).toMatchObject({
      invoiceNumber: 'INV-2026-001',
      date: '2026-05-31',
      vendor: 'SpheraX Ltd',
      amount: 499.9,
      currency: 'USD',
    });
    expect(result.confidence).toBe(0.91);
  });
});
