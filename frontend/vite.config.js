import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Fails the build if any source file under src/ contains emoji.
 * Ranges checked: U+1F300-U+1FAFF (emoji), U+2600-U+26FF (misc symbols),
 * U+FE0F (variation selector). Skips test files (__tests__/, *.test.js, *.spec.js).
 * The approved project icon set (← → ↓ ↑ ✓ ✎ × ✕, U+2700-U+27BF dingbats and
 * U+2190-U+21FF arrows) is not in these ranges and is never flagged.
 */
function noEmojiPlugin() {
  const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE0F}]/u;
  const TEST_RE = /__tests__\/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$/;

  return {
    name: 'no-emoji',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || TEST_RE.test(id)) return null;
      const match = EMOJI_RE.exec(code);
      if (match) {
        const cp = match[0].codePointAt(0).toString(16).toUpperCase();
        throw new Error(
          `[no-emoji] Emoji or symbol U+${cp} (${match[0]}) found in:\n  ${id}\n` +
          `  Remove it and use a lucide-react icon or an approved Unicode icon instead.`
        );
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), noEmojiPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
