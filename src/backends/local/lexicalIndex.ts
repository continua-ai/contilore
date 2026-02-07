import type { TraceIndex } from "../../core/interfaces.js";
import type { IndexedDocument, SearchQuery, SearchResult } from "../../core/types.js";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_./:-]+/)
    .filter((token) => token.length > 1);
}

function metadataMatches(
  metadata: Record<string, string | number | boolean | null> | undefined,
  filters: Record<string, string | number | boolean> | undefined,
): boolean {
  if (!filters) {
    return true;
  }
  if (!metadata) {
    return false;
  }

  for (const [key, value] of Object.entries(filters)) {
    if (metadata[key] !== value) {
      return false;
    }
  }

  return true;
}

export class InMemoryLexicalIndex implements TraceIndex {
  private readonly documents = new Map<string, IndexedDocument>();
  private readonly postings = new Map<string, Map<string, number>>();

  async upsert(document: IndexedDocument): Promise<void> {
    const existing = this.documents.get(document.id);
    if (existing) {
      this.removePostings(existing);
    }

    this.documents.set(document.id, document);
    this.addPostings(document);
  }

  async upsertMany(documents: IndexedDocument[]): Promise<void> {
    for (const document of documents) {
      await this.upsert(document);
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const limit = query.limit ?? 10;
    const queryTerms = tokenize(query.text);
    if (queryTerms.length === 0) {
      return [];
    }

    const scores = new Map<string, number>();
    const totalDocs = Math.max(this.documents.size, 1);

    for (const term of queryTerms) {
      const docsForTerm = this.postings.get(term);
      if (!docsForTerm) {
        continue;
      }

      const docFrequency = docsForTerm.size;
      const inverseDocFrequency = Math.log((1 + totalDocs) / (1 + docFrequency)) + 1;

      for (const [docId, termFrequency] of docsForTerm) {
        const document = this.documents.get(docId);
        if (!document) {
          continue;
        }

        if (!metadataMatches(document.metadata, query.filters)) {
          continue;
        }

        const previous = scores.get(docId) ?? 0;
        scores.set(docId, previous + termFrequency * inverseDocFrequency);
      }
    }

    const results: SearchResult[] = [];
    for (const [docId, score] of scores) {
      const document = this.documents.get(docId);
      if (!document) {
        continue;
      }
      results.push({
        document,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private addPostings(document: IndexedDocument): void {
    const termCounts = new Map<string, number>();
    for (const term of tokenize(document.text)) {
      termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
    }

    for (const [term, frequency] of termCounts) {
      const docsForTerm = this.postings.get(term) ?? new Map<string, number>();
      docsForTerm.set(document.id, frequency);
      this.postings.set(term, docsForTerm);
    }
  }

  private removePostings(document: IndexedDocument): void {
    for (const term of tokenize(document.text)) {
      const docsForTerm = this.postings.get(term);
      if (!docsForTerm) {
        continue;
      }
      docsForTerm.delete(document.id);
      if (docsForTerm.size === 0) {
        this.postings.delete(term);
      }
    }
  }
}
