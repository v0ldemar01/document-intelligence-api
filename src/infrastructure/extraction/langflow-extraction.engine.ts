import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExtractionEngine,
  ExtractionRequest,
  ExtractionResponse,
} from '../../domain/extraction-engine';

type JsonObject = Record<string, unknown>;

@Injectable()
class LangFlowExtractionEngine implements ExtractionEngine {
  private readonly logger = new Logger(LangFlowExtractionEngine.name);
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .getOrThrow<string>('langflow.baseUrl')
      .replace(/\/$/, '');
    this.apiKey = this.config.get<string>('langflow.apiKey');
    this.timeoutMs = this.config.getOrThrow<number>('langflow.timeoutMs');
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResponse> {
    const { langflowFlowId: flowId, name: flowName } = request.catalog.flow;

    if (!flowId) {
      throw new Error(`Flow "${flowName}" has no langflowFlowId configured`);
    }

    const response = await this.run(flowId, this.buildPayload(request));
    return this.parseResponse(await response.json());
  }

  private async run(flowId: string, payload: JsonObject): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/run/${flowId}`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`LangFlow request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(
        `LangFlow request failed with ${response.status}: ${await response.text()}`,
      );
    }

    return response;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    return headers;
  }

  private buildPayload(request: ExtractionRequest): JsonObject {
    const config = request.catalog.flow.configuration as JsonObject;
    const promptNodeId = config?.promptNodeId as string | undefined;
    const modelNodeId = config?.modelNodeId as string | undefined;

    return {
      input_value: request.text,
      input_type: 'text',
      output_type: 'text',
      tweaks: {
        ...(promptNodeId
          ? { [promptNodeId]: { template: request.catalog.prompt.template } }
          : {}),
        ...(modelNodeId
          ? {
              [modelNodeId]: {
                api_key: this.config.get<string>('openai.apiKey') ?? '',
              },
            }
          : {}),
      },
    };
  }

  private parseResponse(raw: unknown): ExtractionResponse {
    const candidate = this.findDeepValue(raw);

    if (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
    ) {
      return this.toResponse(candidate as JsonObject);
    }

    const text = this.stripCodeFences(
      typeof candidate === 'string'
        ? candidate
        : (this.findFirstString(raw) ?? ''),
    );

    const parsed = this.tryParseJson(text);
    if (parsed) return this.toResponse(parsed);

    throw new Error(
      `LangFlow returned unparseable output: ${text.slice(0, 300)}`,
    );
  }

  private toResponse(payload: JsonObject): ExtractionResponse {
    return {
      payload,
      confidence:
        typeof (payload.fields as JsonObject)?.confidence === 'number'
          ? ((payload.fields as JsonObject).confidence as number)
          : 0,
    };
  }

  private stripCodeFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json|javascript|js)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }

  private tryParseJson(text: string): JsonObject | null {
    if (!text.startsWith('{') && !text.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed))
        return parsed.length > 0 ? (parsed[0] as JsonObject) : null;
      if (typeof parsed === 'object' && parsed !== null)
        return parsed as JsonObject;
    } catch (err) {
      this.logger.warn(
        `Failed to parse LangFlow response as JSON: ${(err as Error).message}`,
      );
    }
    return null;
  }

  private findDeepValue(value: unknown): unknown {
    if (!value || typeof value !== 'object') return undefined;

    const record = value as JsonObject;
    const keys = ['output', 'result', 'message', 'text', 'data', 'payload'];

    for (const key of keys) {
      const found = record[key];
      if (found === undefined) continue;
      if (found && typeof found === 'object' && !Array.isArray(found)) {
        return this.findDeepValue(found) ?? found;
      }
      return found;
    }

    for (const nested of Object.values(record)) {
      const found = this.findDeepValue(nested);
      if (found !== undefined) return found;
    }

    return undefined;
  }

  private findFirstString(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return undefined;
    for (const nested of Object.values(value as JsonObject)) {
      const found = this.findFirstString(nested);
      if (found !== undefined) return found;
    }
    return undefined;
  }
}

export { LangFlowExtractionEngine };
