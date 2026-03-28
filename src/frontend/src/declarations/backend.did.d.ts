/* eslint-disable */

// @ts-nocheck

import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';
import type { Principal } from '@icp-sdk/core/principal';

export interface HistoryEntry {
  id: bigint;
  docType: string;
  prompt: string;
  additionalContent: string;
  generatedContent: string;
  timestamp: bigint;
}

export interface HttpHeader { name: string; value: string; }

export interface _SERVICE {
  generateDocument: ActorMethod<[string, string, string, string], string>;
  saveDocument: ActorMethod<[string, string, string, string], bigint>;
  getHistory: ActorMethod<[], HistoryEntry[]>;
  clearHistory: ActorMethod<[], undefined>;
  deleteEntry: ActorMethod<[bigint], undefined>;
}

export declare const idlService: IDL.ServiceClass;
export declare const idlInitArgs: IDL.Type[];
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
