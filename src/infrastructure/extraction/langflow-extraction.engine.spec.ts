import { ConfigService } from '@nestjs/config';
import { LangFlowExtractionEngine } from './langflow-extraction.engine';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';

const now = new Date();

const catalog = {
  provider: {
    id: 'p1',
    ...DEFAULT_CATALOG.provider,
    createdAt: now,
    updatedAt: now,
  },
  model: {
    id: 'm1',
    providerId: 'p1',
    ...DEFAULT_CATALOG.model,
    createdAt: now,
    updatedAt: now,
  },
  flow: {
    id: 'f1',
    providerId: 'p1',
    modelId: 'm1',
    ...DEFAULT_CATALOG.flow,
    langflowFlowId: 'flow-uuid-abc',
    createdAt: now,
    updatedAt: now,
  },
  prompt: {
    id: 'pr1',
    flowId: 'f1',
    ...DEFAULT_CATALOG.prompt,
    createdAt: now,
    updatedAt: now,
  },
};

const request = (text = 'Invoice Number: INV-001') => ({
  text,
  documentType: 'invoice',
  catalog,
});

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const map: Record<string, unknown> = {
    'langflow.baseUrl': 'http://localhost:7860/api/v1',
    'langflow.apiKey': undefined,
    'langflow.timeoutMs': 5_000,
    'openai.apiKey': '',
    ...overrides,
  };
  return {
    get: jest.fn().mockImplementation((key: string) => map[key]),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      const v = map[key];
      if (v === undefined) throw new Error(`Config key "${key}" not found`);
      return v;
    }),
  } as unknown as ConfigService;
}

function makeEngine(config = makeConfig()): LangFlowExtractionEngine {
  return new LangFlowExtractionEngine(config);
}

function mockFetch(body: unknown, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response);
}

describe('LangFlowExtractionEngine', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('extract — successful responses', () => {
    it('uses catalog.flow.langflowFlowId as the flow ID in the request URL', async () => {
      const fetchSpy = mockFetch({
        result: { invoiceNumber: 'INV-001', confidence: 0.9 },
      });
      const engine = makeEngine();

      await engine.extract(request());

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/run/flow-uuid-abc'),
        expect.any(Object),
      );
    });

    it('sends the document text as input_value', async () => {
      const fetchSpy = mockFetch({ result: { confidence: 0.9 } });
      await makeEngine().extract(
        request('Invoice Number: INV-001\nVendor: ACME'),
      );

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(body.input_value).toBe('Invoice Number: INV-001\nVendor: ACME');
    });

    it('injects the prompt template from the catalog via tweaks', async () => {
      const fetchSpy = mockFetch({ result: { confidence: 0.9 } });
      await makeEngine().extract(request());

      const body = JSON.parse(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      ) as {
        input_value: string;
        tweaks: Record<string, Record<string, unknown>>;
      };
      const promptNodeId =
        ((catalog.flow.configuration as Record<string, unknown>)
          .promptNodeId as string) ?? 'Prompt-bN1Am';
      expect(body.tweaks[promptNodeId]?.template).toBe(
        DEFAULT_CATALOG.prompt.template,
      );
    });

    it('parses a JSON object from the response', async () => {
      mockFetch({
        result: { fields: { invoiceNumber: 'INV-001', confidence: 0.95 } },
      });
      const result = await makeEngine().extract(request());

      expect(result.payload.fields).toMatchObject({ invoiceNumber: 'INV-001' });
      expect(result.confidence).toBe(0.95);
    });

    it('parses a JSON string embedded in the response text field', async () => {
      mockFetch({
        text: '{"fields":{"invoiceNumber":"INV-042","confidence":0.88}}',
      });
      const result = await makeEngine().extract(request());

      expect(result.payload.fields).toMatchObject({ invoiceNumber: 'INV-042' });
      expect(result.confidence).toBe(0.88);
    });

    it('adds x-api-key header when apiKey is configured', async () => {
      const fetchSpy = mockFetch({ result: { confidence: 0.9 } });
      await makeEngine(makeConfig({ 'langflow.apiKey': 'lf-secret' })).extract(
        request(),
      );

      const headers = (fetchSpy.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('lf-secret');
    });

    it('omits x-api-key header when apiKey is not configured', async () => {
      const fetchSpy = mockFetch({ result: { confidence: 0.9 } });
      await makeEngine().extract(request());

      const headers = (fetchSpy.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers['x-api-key']).toBeUndefined();
    });
  });

  describe('extract — error handling', () => {
    it('throws when flow.langflowFlowId is not set', async () => {
      const noFlowCatalog = {
        ...catalog,
        flow: { ...catalog.flow, langflowFlowId: '' },
      };
      await expect(
        makeEngine().extract({
          text: 'test',
          documentType: 'invoice',
          catalog: noFlowCatalog,
        }),
      ).rejects.toThrow('has no langflowFlowId configured');
    });

    it('throws when LangFlow returns a non-OK HTTP status', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
      } as unknown as Response);

      await expect(makeEngine().extract(request())).rejects.toThrow(
        'LangFlow request failed with 500',
      );
    });

    it('throws a timeout error when fetch is aborted', async () => {
      jest.spyOn(global, 'fetch').mockImplementationOnce((_url, opts) => {
        return new Promise((_resolve, reject) => {
          (opts!.signal as AbortSignal).addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(
        makeEngine(makeConfig({ 'langflow.timeoutMs': 1 })).extract(request()),
      ).rejects.toThrow(/timed out/i);
    });
  });
});
