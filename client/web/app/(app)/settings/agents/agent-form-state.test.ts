import { describe, expect, it } from 'vitest';
import {
  ROLES,
  agentParamsFromForm,
  brainHasAgentThinkingEffort,
  emptyForm,
  formFromAgent,
  tempDescriptor,
  validateAgent,
} from './agent-form-state';
import type { AgentSummary, FormState } from './agent-form-state';

/**
 * The agents form's pure layer. Until phase 1 lifted this out of a 2,147-line
 * screen, none of it could be reached without rendering the whole thing —
 * which is why validation, the rule an operator meets most often, had no test.
 */

const create = { mode: 'create' } as const;
const edit = { mode: 'edit', agent: { slug: 'saved' } as AgentSummary } as const;

/** A form that passes, so each test can spoil exactly one thing. */
const valid = (over: Partial<FormState> = {}): FormState => ({
  ...emptyForm(),
  name: 'Ada',
  slug: 'ada',
  apiKeyId: 'key_1',
  model: 'anthropic/claude-haiku-4.5',
  systemPrompt: 'Be useful.',
  ...over,
});

describe('validateAgent', () => {
  it('passes a complete form', () => {
    expect(validateAgent(valid(), create)).toEqual({});
    expect(validateAgent(valid(), edit)).toEqual({});
  });

  it('requires the four fields an agent cannot run without', () => {
    expect(validateAgent(valid({ name: '' }), create).name).toBeTruthy();
    expect(validateAgent(valid({ apiKeyId: '' }), create).apiKey).toBeTruthy();
    expect(validateAgent(valid({ model: '' }), create).model).toBeTruthy();
    expect(validateAgent(valid({ systemPrompt: '' }), create).systemPrompt).toBeTruthy();
  });

  it('treats whitespace as empty', () => {
    expect(validateAgent(valid({ name: '   ' }), create).name).toBeTruthy();
    expect(validateAgent(valid({ model: '  ' }), create).model).toBeTruthy();
    expect(validateAgent(valid({ systemPrompt: '\n\t' }), create).systemPrompt).toBeTruthy();
  });

  // The slug is immutable once saved, so an edit cannot get it wrong — and
  // must not be blocked by a rule it has no way to satisfy.
  it('checks the slug on create and not on edit', () => {
    expect(validateAgent(valid({ slug: '' }), create).slug).toBeTruthy();
    expect(validateAgent(valid({ slug: '' }), edit).slug).toBeUndefined();
    expect(validateAgent(valid({ slug: 'Not Valid' }), edit).slug).toBeUndefined();
  });

  it('accepts only what a slug may contain', () => {
    for (const ok of ['ada', 'ada-2', 'ada_2', 'a1']) {
      expect(validateAgent(valid({ slug: ok }), create).slug).toBeUndefined();
    }
    for (const bad of ['Ada', 'ada agent', 'ada.2', 'ada/2', 'ådå']) {
      expect(validateAgent(valid({ slug: bad }), create).slug).toBeTruthy();
    }
  });

  it('reports every problem at once, not the first', () => {
    const errs = validateAgent(valid({ name: '', model: '', apiKeyId: '' }), create);
    expect(Object.keys(errs).sort()).toEqual(['apiKey', 'model', 'name']);
  });
});

describe('tempDescriptor', () => {
  it('names every band, and never returns nothing', () => {
    for (const t of [0, 0.3, 0.31, 0.7, 0.9, 1.0, 1.2, 1.4, 1.8, 2]) {
      const d = tempDescriptor(t);
      expect(d.word).toBeTruthy();
      expect(d.hint).toBeTruthy();
    }
  });

  it('is inclusive at each boundary, so a band never falls through', () => {
    expect(tempDescriptor(0.3).word).toBe('Precise');
    expect(tempDescriptor(0.7).word).toBe('Grounded');
    expect(tempDescriptor(1.0).word).toBe('Balanced');
    expect(tempDescriptor(0.31).word).not.toBe('Precise');
  });
});

describe('emptyForm', () => {
  it('starts on a real role, ready to be filled in', () => {
    const f = emptyForm();
    expect(ROLES.some((r) => r.value === f.role)).toBe(true);
    expect(f.name).toBe('');
    expect(f.slug).toBe('');
  });

  it('honours the role it is given', () => {
    for (const r of ROLES) expect(emptyForm(r.value).role).toBe(r.value);
  });
});

describe('thinking effort on the form', () => {
  const row = (over: Partial<AgentSummary>): AgentSummary =>
    ({
      slug: 'ada',
      name: 'Ada',
      role: 'responder',
      provider: 'openrouter',
      model: 'm',
      systemPrompt: 'p',
      priority: 100,
      enabled: true,
      backupEnabled: false,
      viaTailnet: false,
      backupViaTailnet: false,
      memoryConfig: {},
      params: {},
      ...over,
    }) as AgentSummary;

  it('a new agent starts on inherit', () => {
    expect(emptyForm().thinkingEffort).toBeNull();
  });

  it('loads the stored effort, and inherit for null, missing or unknown', () => {
    expect(formFromAgent(row({ thinkingEffort: 'max' })).thinkingEffort).toBe('max');
    expect(formFromAgent(row({ thinkingEffort: 'off' })).thinkingEffort).toBe('off');
    expect(formFromAgent(row({ thinkingEffort: null })).thinkingEffort).toBeNull();
    expect(formFromAgent(row({})).thinkingEffort).toBeNull();
  });

  it('detects a brain that stores it by the key, null included', () => {
    expect(brainHasAgentThinkingEffort([row({ thinkingEffort: null })])).toBe(true);
    expect(brainHasAgentThinkingEffort([row({})])).toBe(false);
    // Nothing to look at (a fresh brain): show it; an older brain drops the key.
    expect(brainHasAgentThinkingEffort([])).toBe(true);
  });
});

describe('tool loading and the params a save sends', () => {
  const row = (params: AgentSummary['params']): AgentSummary =>
    ({
      slug: 'ada',
      name: 'Ada',
      role: 'responder',
      provider: 'openrouter',
      model: 'm',
      systemPrompt: 'p',
      priority: 100,
      enabled: true,
      backupEnabled: false,
      viaTailnet: false,
      backupViaTailnet: false,
      memoryConfig: {},
      params,
    }) as AgentSummary;

  it('a new agent sends every tool (full)', () => {
    expect(emptyForm().toolLoading).toBe('full');
    expect(agentParamsFromForm(emptyForm())).not.toHaveProperty('tool_loading');
  });

  it('loads deferred, and full for absent or unknown values', () => {
    expect(formFromAgent(row({ tool_loading: 'deferred' })).toolLoading).toBe('deferred');
    expect(formFromAgent(row({ tool_loading: 'full' })).toolLoading).toBe('full');
    expect(formFromAgent(row({})).toolLoading).toBe('full');
  });

  it('a save keeps tool_loading: loading a deferred agent and saving sends it back', () => {
    const saved = { temperature: 0.4, tool_loading: 'deferred' as const };
    const form = formFromAgent(row(saved));
    expect(agentParamsFromForm(form, saved)).toEqual({
      temperature: 0.4,
      tool_loading: 'deferred',
    });
  });

  it('turning it off omits the key, so absent means full', () => {
    const saved = { tool_loading: 'deferred' as const };
    const form = { ...formFromAgent(row(saved)), toolLoading: 'full' as const };
    expect(agentParamsFromForm(form, saved)).not.toHaveProperty('tool_loading');
  });

  it('keeps top_p, which has no field, and never sends keys the brain rejects', () => {
    const saved = {
      top_p: 0.9,
      max_retries: 3,
      voice: { enabled: true },
      temperature: 1,
    };
    const params = agentParamsFromForm(formFromAgent(row(saved)), saved);
    expect(params).toEqual({ temperature: 1, top_p: 0.9 });
  });
});
