import { CatalogRepository } from './ports/catalog.repository';
import { DocumentRepository } from './ports/document.repository';
import { JobRepository } from './ports/job.repository';

interface DocumentIntelligenceRepository
  extends CatalogRepository,
    DocumentRepository,
    JobRepository {}

export { type DocumentIntelligenceRepository };
