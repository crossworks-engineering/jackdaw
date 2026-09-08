'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@mantle/web-ui/api-fetch';

/**
 * OpenRouter's pricing map, fetched once and used as a FALLBACK.
 *
 * The direct providers — Anthropic, OpenAI, xAI, Google — do not return
 * pricing from their own list endpoints, so a model picked against one of them
 * would show no price at all. We look the model up in this cache by its
 * OpenRouter-style slug (`openrouterSlugFor`) and fold the numbers into the
 * row instead.
 *
 * Misses are silent and failures are ignored on purpose: the price badge is
 * decoration on a form whose real job is saving a working route, and a
 * pricing outage must not stop someone configuring a worker.
 */

export type PricingEntry = { inputPricePerM?: number; outputPricePerM?: number };
export type PricingMap = Record<string, PricingEntry>;

export function useOpenRouterPricing(): PricingMap {
  const [pricing, setPricing] = useState<PricingMap>({});

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ pricing?: PricingMap }>('/api/model-context')
      .then((d) => {
        if (!cancelled && d.pricing) setPricing(d.pricing);
      })
      .catch(() => {
        /* decorative — see the note above */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return pricing;
}
