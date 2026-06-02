import { CatalogBundle } from './document-intelligence.types';

export interface ExtractionRequest {
  text: string;
  documentType: string;
  catalog: CatalogBundle;
}

export interface ExtractionResponse {
  payload: Record<string, unknown>;
  confidence: number;
}

export interface ExtractionEngine {
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
}
