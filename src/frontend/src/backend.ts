/* eslint-disable */

// @ts-nocheck

import { Actor, HttpAgent, type HttpAgentOptions, type ActorConfig, type Agent, type ActorSubclass } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";
import { idlFactory, type _SERVICE } from "./declarations/backend.did";

export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;

export class ExternalBlob {
    _blob?: Uint8Array<ArrayBuffer> | null;
    directURL: string;
    onProgress?: (percentage: number) => void = undefined;
    private constructor(directURL: string, blob: Uint8Array<ArrayBuffer> | null) {
        if (blob) { this._blob = blob; }
        this.directURL = directURL;
    }
    static fromURL(url: string): ExternalBlob {
        return new ExternalBlob(url, null);
    }
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob {
        const url = URL.createObjectURL(new Blob([new Uint8Array(blob)], { type: 'application/octet-stream' }));
        return new ExternalBlob(url, blob);
    }
    public async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
        if (this._blob) { return this._blob; }
        const response = await fetch(this.directURL);
        const blob = await response.blob();
        this._blob = new Uint8Array(await blob.arrayBuffer());
        return this._blob;
    }
    public getDirectURL(): string { return this.directURL; }
    public withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob {
        this.onProgress = onProgress;
        return this;
    }
}

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

export class Backend implements backendInterface {
    constructor(
      private actor: ActorSubclass<_SERVICE>,
      private _uploadFile: (file: any) => Promise<Uint8Array>,
      private _downloadFile: (file: Uint8Array) => Promise<any>,
      private processError?: (error: unknown) => never
    ) {}

    async generateDocument(docType: string, prompt: string, additionalContent: string, outputFormat: string): Promise<string> {
      return await this.actor.generateDocument(docType, prompt, additionalContent, outputFormat);
    }

    async saveDocument(docType: string, prompt: string, additionalContent: string, generatedContent: string): Promise<bigint> {
      return await this.actor.saveDocument(docType, prompt, additionalContent, generatedContent);
    }

    async getHistory(): Promise<HistoryEntry[]> {
      return await this.actor.getHistory();
    }

    async clearHistory(): Promise<void> {
      return await this.actor.clearHistory();
    }

    async deleteEntry(id: bigint): Promise<void> {
      return await this.actor.deleteEntry(id);
    }
}

export interface CreateActorOptions {
    agent?: Agent;
    agentOptions?: HttpAgentOptions;
    actorOptions?: ActorConfig;
    processError?: (error: unknown) => never;
}

export function createActor(
  canisterId: string,
  _uploadFile: (file: any) => Promise<Uint8Array>,
  _downloadFile: (file: Uint8Array) => Promise<any>,
  options: CreateActorOptions = {}
): Backend {
    const agent = options.agent || HttpAgent.createSync({
        ...options.agentOptions
    });
    if (options.agent && options.agentOptions) {
        console.warn("Detected both agent and agentOptions passed to createActor. Ignoring agentOptions and proceeding with the provided agent.");
    }
    const actor = Actor.createActor<_SERVICE>(idlFactory, {
        agent,
        canisterId: canisterId,
        ...options.actorOptions
    });
    return new Backend(actor, _uploadFile, _downloadFile, options.processError);
}
