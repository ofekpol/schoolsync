/** Marks a fact the founders still need to supply. Search for it before going live. */
export const LEGAL_PLACEHOLDER = "[להשלמה]";

/**
 * Facts shown on /privacy, /accessibility and the support path. Same owner as
 * the company site (EduSolutions repo, content/legal.ts) — keep the two in sync.
 */
export const LEGAL = {
  companyName: "EduSolutions, בבעלות אופק פוליקר",
  idLabel: "עוסק פטור מס'",
  companyNumber: "212686182",
  contactEmail: LEGAL_PLACEHOLDER,
  a11yCoordinator: { name: LEGAL_PLACEHOLDER, email: LEGAL_PLACEHOLDER },
  conformance: 'ת"י 5568 ברמה AA',
  lastChecked: LEGAL_PLACEHOLDER,
  updated: "7.11.2026",
} as const;
