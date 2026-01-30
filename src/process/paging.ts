// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import type { FunCityVariables } from 'funcity';

//////////////////////////////////////////////////////////////////////////////

export const resolvePrerenderCount = (
  variables: FunCityVariables
): number | undefined => {
  const raw = variables.get('prerenderCount');
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const normalized = Math.floor(raw);
    return normalized > 0 ? normalized : undefined;
  }
  if (typeof raw === 'string') {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
};
