/* eslint-disable */

// @ts-nocheck

import { IDL } from '@icp-sdk/core/candid';

const HistoryEntry = IDL.Record({
  id: IDL.Nat,
  docType: IDL.Text,
  prompt: IDL.Text,
  additionalContent: IDL.Text,
  generatedContent: IDL.Text,
  timestamp: IDL.Int,
});

const HttpHeader = IDL.Record({ name: IDL.Text, value: IDL.Text });

const TransformationInput = IDL.Record({
  context: IDL.Vec(IDL.Nat8),
  response: IDL.Record({
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(HttpHeader),
    status: IDL.Nat,
  }),
});

const TransformationOutput = IDL.Record({
  body: IDL.Vec(IDL.Nat8),
  headers: IDL.Vec(HttpHeader),
  status: IDL.Nat,
});

export const idlService = IDL.Service({
  generateDocument: IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
  saveDocument: IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [IDL.Nat], []),
  getHistory: IDL.Func([], [IDL.Vec(HistoryEntry)], ['query']),
  clearHistory: IDL.Func([], [], []),
  deleteEntry: IDL.Func([IDL.Nat], [], []),
  transform: IDL.Func([TransformationInput], [TransformationOutput], ['query']),
});

export const idlInitArgs = [];

export const idlFactory = ({ IDL }) => {
  const HistoryEntry = IDL.Record({
    id: IDL.Nat,
    docType: IDL.Text,
    prompt: IDL.Text,
    additionalContent: IDL.Text,
    generatedContent: IDL.Text,
    timestamp: IDL.Int,
  });

  const HttpHeader = IDL.Record({ name: IDL.Text, value: IDL.Text });

  const TransformationInput = IDL.Record({
    context: IDL.Vec(IDL.Nat8),
    response: IDL.Record({
      body: IDL.Vec(IDL.Nat8),
      headers: IDL.Vec(HttpHeader),
      status: IDL.Nat,
    }),
  });

  const TransformationOutput = IDL.Record({
    body: IDL.Vec(IDL.Nat8),
    headers: IDL.Vec(HttpHeader),
    status: IDL.Nat,
  });

  return IDL.Service({
    generateDocument: IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [IDL.Text], []),
    saveDocument: IDL.Func([IDL.Text, IDL.Text, IDL.Text, IDL.Text], [IDL.Nat], []),
    getHistory: IDL.Func([], [IDL.Vec(HistoryEntry)], ['query']),
    clearHistory: IDL.Func([], [], []),
    deleteEntry: IDL.Func([IDL.Nat], [], []),
    transform: IDL.Func([TransformationInput], [TransformationOutput], ['query']),
  });
};

export const init = ({ IDL }) => { return []; };
