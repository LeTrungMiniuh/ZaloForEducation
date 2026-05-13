import { Injectable, Logger } from '@nestjs/common';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Document } from '@langchain/core/documents';

export interface ProcessedDocument {
  /** Full extracted text (truncated) */
  fullText: string;
  /** Number of chunks produced */
  chunkCount: number;
  /** Top-N chunks for prompt injection */
  chunks: string[];
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  /**
   * Download a PDF from URL, load with LangChain PDFLoader,
   * split into chunks with RecursiveCharacterTextSplitter.
   * Returns structured data for prompt injection.
   */
  async processPdf(url: string, fileName: string): Promise<ProcessedDocument> {
    try {
      this.logger.log(`Processing PDF via LangChain: ${fileName}`);

      // 1. Download PDF
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Limit: skip PDFs larger than 10MB
      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error('PDF exceeds 10MB limit');
      }

      // 2. Load with LangChain PDFLoader
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const loader = new PDFLoader(blob);
      const docs = await loader.load();

      if (!docs || docs.length === 0) {
        throw new Error('PDFLoader returned no documents');
      }

      // 3. Merge all pages into single text
      const fullText = docs.map((d) => d.pageContent).join('\n\n');

      if (!fullText || fullText.trim().length < 20) {
        throw new Error('PDF text is empty or too short (likely a scanned image)');
      }

      // 4. Split into chunks
      const splitDocs = await this.splitter.splitDocuments(docs);
      const chunks = splitDocs.map((d) => d.pageContent);

      // Truncate full text for logging/fallback (keep ~4000 chars)
      const maxLen = 4000;
      const truncated = fullText.length > maxLen
        ? fullText.substring(0, maxLen) + '\n\n[... truncated ...]'
        : fullText;

      this.logger.log(`PDF processed: ${docs.length} pages → ${chunks.length} chunks`);

      return {
        fullText: truncated,
        chunkCount: chunks.length,
        chunks,
      };
    } catch (error) {
      this.logger.warn(`LangChain PDF processing failed for ${fileName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Format processed PDF chunks for prompt injection.
   * Returns a formatted text block ready to append to a chat message.
   */
  formatForPrompt(fileName: string, result: ProcessedDocument): string {
    const header = `[Nội dung PDF: ${fileName}]`;
    const chunksToShow = result.chunks.slice(0, 5);

    if (chunksToShow.length === 0) {
      return `${header}\n(Không thể trích xuất nội dung)`;
    }

    const chunksText = chunksToShow
      .map((c, i) => `--- Đoạn ${i + 1} ---\n${c}`)
      .join('\n\n');

    let output = `${header}\n${chunksText}`;

    if (result.chunks.length > 5) {
      output += `\n\n[... còn ${result.chunks.length - 5} đoạn nữa — yêu cầu người dùng hỏi chi tiết hơn để xem thêm ...]`;
    }

    return output;
  }
}
