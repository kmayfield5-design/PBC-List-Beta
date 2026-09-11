'use strict';

/**
 * Default per-engagement vocabulary applied to every new request
 * unless the caller supplies a custom metadata object.
 *
 * Shape mirrors requests.metadata JSONB:
 *   areas      — ordered list for dropdowns and filter chips
 *   workstreams — empty by default; populated per engagement
 *   defaults   — sensible fallbacks for item creation
 */
const DEFAULT_VOCABULARY = {
  areas: [
    { value: 'finance', label: 'Finance' },
    { value: 'legal',   label: 'Legal' },
    { value: 'tax',     label: 'Tax' },
    { value: 'hr',      label: 'HR' },
    { value: 'it',      label: 'IT' },
    { value: 'ops',     label: 'Operations' },
    { value: 'other',   label: 'Other' },
  ],
  workstreams: [],
  defaults: {
    expected_format: 'xlsx',
  },
};

module.exports = { DEFAULT_VOCABULARY };
