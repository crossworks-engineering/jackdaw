/**
 * The `params` the Studio structure editor sends. The brain stores an agent's
 * params WHOLE, and the Studio graph only carries temperature and max_tokens,
 * so a save built from those two alone wiped every other key (tool_loading,
 * suggest_follow_up, top_p set on the agents screen). This starts from the
 * saved params and changes only the two fields the editor shows; a blank
 * field removes its key (the runtime default applies).
 */
export function studioParamsPatch(
  saved: Record<string, unknown> | null | undefined,
  temp: string,
  maxTokens: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(saved ?? {}) };
  delete params.temperature;
  delete params.max_tokens;
  if (temp.trim()) params.temperature = Number(temp);
  if (maxTokens.trim()) params.max_tokens = Number(maxTokens);
  return params;
}
