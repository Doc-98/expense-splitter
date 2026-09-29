// Tests that check the stylesheet's own rules (contrast, the category
// palette, swipe touch-action) read it through here: src/styles.css is only
// the layer order plus @imports of src/styles/**, so this follows those
// imports and returns the whole stylesheet as one text, in cascade order,
// exactly as the build inlines it (minus the layer wrappers). Paths are
// resolved from the project root, which works in both the node and the
// jsdom test environments (import.meta.url isn't a file: URL in jsdom).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readStylesheet() {
  const src = resolve(process.cwd(), 'src')
  const index = readFileSync(resolve(src, 'styles.css'), 'utf8')
  const files = [...index.matchAll(/@import '\.\/(styles\/[^']+)'/g)].map((m) => m[1])
  if (files.length === 0) throw new Error('src/styles.css has no @imports to follow')
  return files.map((f) => readFileSync(resolve(src, f), 'utf8')).join('\n')
}
