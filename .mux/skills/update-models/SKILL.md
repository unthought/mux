---
name: update-models
description: Upgrade models.json from LiteLLM upstream and prune models-extra entries that are now covered.
---

# Update Models

Refresh the LiteLLM pricing database (`models.json`) and remove entries from `models-extra.ts`
that upstream now covers accurately.

## File Map

| File                                      | Role                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `src/common/utils/tokens/models.json`     | LiteLLM upstream pricing/token-limit database (~1 MB JSON)                |
| `src/common/utils/tokens/models-extra.ts` | Local overrides for models missing or wrong in upstream                   |
| `src/common/utils/tokens/modelStats.ts`   | Runtime lookup: checks models-extra **first**, then models.json           |
| `src/common/constants/knownModels.ts`     | UI-facing model definitions (aliases, warm flags, tokenizer overrides)    |
| `scripts/update_models.ts`                | Fetches latest `model_prices_and_context_window.json` from LiteLLM GitHub |

## Procedure

### 1. Fetch the latest models.json

```bash
bun scripts/update_models.ts
```

This overwrites `src/common/utils/tokens/models.json` with the latest LiteLLM data.

### 2. Identify removable models-extra entries

For **each** model key in `models-extra.ts`, check whether upstream `models.json` now contains
a matching entry. The lookup keys follow the same logic as `modelStats.ts`:

- Bare model name (e.g., `gpt-5.2`)
- Provider-prefixed name (e.g., `openai/gpt-5.2`)

### 3. Decide: remove, keep, or update

For each models-extra entry found upstream, compare the **critical fields**:

| Field                             | Priority                       |
| --------------------------------- | ------------------------------ |
| `max_input_tokens`                | Must match or be acceptable    |
| `max_output_tokens`               | Must match or be acceptable    |
| `input_cost_per_token`            | Must match exactly             |
| `output_cost_per_token`           | Must match exactly             |
| `cache_creation_input_token_cost` | Must match if present in extra |
| `cache_read_input_token_cost`     | Must match if present in extra |

**Decision matrix:**

- **Remove** from models-extra: upstream data matches on all critical fields (or upstream is
  strictly better—e.g., has cache costs that extra omitted).
- **Keep** in models-extra: upstream data is wrong (e.g., wrong context window, wrong pricing).
  Update the comment explaining _why_ it's kept.
- **Update** in models-extra: the model is in upstream but upstream has a specific field wrong.
  Only override the minimum necessary fields.

> Remember: `modelStats.ts` checks models-extra **first**. An entry in models-extra always
> wins over models.json, which means stale overrides will shadow corrected upstream data.

### 4. Remove entries from models-extra.ts

Delete the full object entry (key + value + preceding comment block) for each model being removed.
Keep the file clean — no orphaned comments or trailing commas.

After removal, if `models-extra.ts` is empty (all models are upstream), keep the file with just
the `ModelData` interface and an empty `modelsExtra` export:

```typescript
export const modelsExtra: Record<string, ModelData> = {};
```

### 5. Validate

Run these checks in order — all must pass:

```bash
# Type-check (catches import/type errors from removed entries)
make typecheck

# Unit tests for model lookups (catches broken pricing/limits)
bun test src/common/utils/tokens/modelStats.test.ts

# Known-models integration test — verifies every KNOWN_MODELS entry resolves
# through getModelStats() and has valid token limits and costs.
# This catches premature models-extra removals automatically.
bun test src/common/constants/knownModels.test.ts

# Model capabilities (uses models-extra data)
bun test src/common/utils/ai/modelCapabilities.test.ts
```

If any test hard-codes a value from a removed models-extra entry (e.g., asserting
`max_input_tokens === 272000` for a model that now resolves from upstream with a
different value), update the test expectation to match the new upstream data.

## Common Pitfalls

- **LiteLLM key format varies.** Some models use bare names (`gpt-5.2`), some use
  `provider/model` (`anthropic/claude-opus-4-6`). Always check both forms.
- **models-extra shadows upstream.** If you leave a stale entry in models-extra, users will
  get outdated pricing even after upstream is fixed. Always prune.
- **The `mode` field matters.** Some Codex models use `"responses"` mode instead of `"chat"`.
  If upstream has the wrong mode, keep the models-extra override.
- **Cache costs may be absent upstream.** If models-extra has cache pricing that upstream lacks,
  keep the entry (cache cost accuracy affects user-facing cost estimates).
