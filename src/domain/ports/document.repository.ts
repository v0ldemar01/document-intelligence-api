import {
  CreateDocumentInput,
  CreateJobInput,
  DocumentRecord,
  JobRecord,
} from '../document-intelligence.types';

interface DocumentRepository {
  createDocument(input: CreateDocumentInput): Promise<DocumentRecord>;
  findDocument(id: string): Promise<DocumentRecord | null>;
  listDocuments(): Promise<DocumentRecord[]>;
  deleteDocument(id: string): Promise<void>;
  atomicCreateDocumentAndJob(
    documentInput: CreateDocumentInput,
    jobInput: Omit<CreateJobInput, 'documentId'>,
    checksumLockKey: string,
  ): Promise<{ document: DocumentRecord; job: JobRecord }>;
}

export { type DocumentRepository };
