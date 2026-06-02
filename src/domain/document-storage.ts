import { UploadedDocumentFile } from '../document-intelligence/types/uploaded-document-file';

interface DocumentStorage {
  save(file: UploadedDocumentFile): Promise<string>;
}

export { type DocumentStorage };
