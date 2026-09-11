// Riveron design tokens — single source of truth for all visual values.
export const theme = {
  colors: {
    ink: '#071739',        // PMS 539 — primary text, headings
    body: '#4c6382',       // PMS 6112 — secondary text
    muted: '#6b7d94',      // tertiary / placeholder text
    line: '#dadde6',       // PMS 649 — borders, dividers
    surface: '#ffffff',
    canvas: '#fafbfc',     // page background
    brand: '#071739',      // PMS 539 navy
    brandSoft: '#e6e9ef',
    brandAccent: '#379190',// PMS 6137 teal — CTAs, progress, emphasis
    amber: '#dfa840',      // PMS 2007 — header accent border
  },
  font: {
    heading: 'Arial, Helvetica, sans-serif',
    body: 'Verdana, Geneva, sans-serif',
  },
  space: [4, 8, 12, 16, 24, 32, 48],
  radius: { sm: 4, md: 8, lg: 12 },
};
