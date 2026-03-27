// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

declare module '@foliojs-fork/linebreak' {
  export interface LineBreakOpportunity {
    readonly position: number;
    readonly required: boolean;
  }

  export default class LineBreaker {
    public constructor(value: string);
    public nextBreak(): LineBreakOpportunity | null;
  }
}
