export interface ParsedDocument {
  documentType: string;
  text: string;
}

export interface DocumentParser {
  parse(
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<ParsedDocument>;
}
