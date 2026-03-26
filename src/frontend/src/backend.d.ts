export interface HistoryEntry {
  id: bigint;
  docType: string;
  prompt: string;
  additionalContent: string;
  generatedContent: string;
  timestamp: bigint;
}

export interface backendInterface {
  generateDocument(docType: string, prompt: string, additionalContent: string, outputFormat: string): Promise<string>;
  saveDocument(docType: string, prompt: string, additionalContent: string, generatedContent: string): Promise<bigint>;
  getHistory(): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  deleteEntry(id: bigint): Promise<void>;
}
