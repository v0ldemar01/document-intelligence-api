import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LangFlowFlowSummary {
  id: string;
  name: string;
  description?: string;
  updated_at: string;
}

export interface LangFlowFlowDetail extends LangFlowFlowSummary {
  data: Record<string, unknown>;
}

export interface FlowDefinition {
  name: string;
  description?: string;
  data: Record<string, unknown>;
}

@Injectable()
export class LangFlowApiService {
  private readonly logger = new Logger(LangFlowApiService.name);
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

  async listFlows(): Promise<LangFlowFlowSummary[]> {
    const res = await this.request<LangFlowFlowSummary[]>('GET', '/flows/');
    return Array.isArray(res) ? res : [];
  }

  async findFlowByName(name: string): Promise<LangFlowFlowSummary | null> {
    const flows = await this.listFlows();
    return flows.find((f) => f.name === name) ?? null;
  }

  async createFlow(definition: FlowDefinition): Promise<LangFlowFlowSummary> {
    return this.request<LangFlowFlowSummary>('POST', '/flows/', definition);
  }

  async updateFlow(
    id: string,
    definition: Partial<FlowDefinition>,
  ): Promise<LangFlowFlowSummary> {
    return this.request<LangFlowFlowSummary>(
      'PATCH',
      `/flows/${id}`,
      definition,
    );
  }

  async findOrCreateFlow(
    definition: FlowDefinition,
  ): Promise<{ flowId: string; created: boolean }> {
    const existing = await this.findFlowByName(definition.name);
    if (existing) {
      this.logger.log(
        `Flow "${definition.name}" already exists (${existing.id}) — reusing`,
      );
      return { flowId: existing.id, created: false };
    }

    this.logger.log(
      `Flow "${definition.name}" not found — creating from definition file`,
    );
    const created = await this.createFlow(definition);
    return { flowId: created.id, created: true };
  }

  async isReachable(): Promise<boolean> {
    const rootUrl = this.baseUrl.replace(/\/api\/v\d+\/?$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`${rootUrl}/health`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `LangFlow API ${method} ${path} failed (${res.status}): ${text}`,
        );
      }

      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`LangFlow API request timed out: ${method} ${path}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
