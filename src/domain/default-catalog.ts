import { CatalogSeed } from './document-intelligence.types';

export const DEFAULT_CATALOG: CatalogSeed = {
  provider: {
    name: 'openai',
    displayName: 'OpenAI',
    type: 'openai',
    configuration: {},
    isDefault: true,
  },
  model: {
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    version: '2024-07-18',
    configuration: { temperature: 0.1 },
    isDefault: true,
  },
  flow: {
    name: 'invoice-flow',
    displayName: 'Invoice Extraction Flow',
    version: '1.0.0',
    langflowFlowId: 'mock-invoice-flow',
    configuration: {
      // Node IDs from langflow/flows/invoice-extraction.json.
      // Used as tweak keys when injecting values at extraction time.
      // Update these if you recreate the flow from scratch (IDs change on recreation).
      promptNodeId: 'Prompt-bN1Am', // Prompt component — injects the template
      inputNodeId: 'TextInput-q6fh9', // Text Input component — receives document text
      modelNodeId: 'OpenAIModel-RKqQH', // OpenAI model node
    },
    isDefault: true,
  },
  prompt: {
    name: 'invoice-extraction-prompt',
    displayName: 'Invoice Extraction Prompt',
    version: '1.0.0',
    template: [
      'You are a document extraction assistant.',
      '',
      'Extract invoice data from the document below and return ONLY raw JSON.',
      'No markdown, no code fences, no arrays, no explanation.',
      '',
      'Required fields (use null when not found):',
      '  invoiceNumber — invoice ID string',
      '  date          — date in YYYY-MM-DD format',
      '  vendor        — supplier/seller name',
      '  amount        — total amount as a number, not a string',
      '  currency      — ISO 4217 code: EUR, USD, GBP, etc.',
      '  confidence    — score 1.0 if all 5 fields are clearly present; subtract 0.1 for each field that is missing or inferred rather than explicitly stated; minimum 0.1',
      '',
      'Return a single JSON object with keys: documentType, fields, confidence.',
      'documentType is always "invoice".',
      'fields contains the six keys above.',
      '',
      'Document:',
      '{text}',
    ].join('\n'),
    outputSchema: {
      documentType: 'invoice',
      fields: {
        invoiceNumber: 'string',
        date: 'YYYY-MM-DD',
        vendor: 'string',
        amount: 'number',
        currency: 'string',
      },
      confidence: 'number',
    },
    isDefault: true,
  },
};
