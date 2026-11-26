import { createRequire } from 'node:module'
import { rolldown } from 'rolldown'
import nodePolyfills from '@rolldown/plugin-node-polyfills'

const require = createRequire(import.meta.url)
const moduleId = 'virtual:exceljs-browser'

// ExcelJS's default browser entry is precompiled and bypasses npm overrides.
// Build its workbook source with browser stream and Buffer support scoped to this chunk.
export default function exceljsBrowser() {
  return {
    name: 'exceljs-browser',
    resolveId(id) {
      if (id === moduleId) return '\0' + moduleId
    },
    async load(id) {
      if (id !== '\0' + moduleId) return
      const bundle = await rolldown({
        input: require.resolve('exceljs/lib/exceljs.bare.js'),
        platform: 'browser',
        plugins: [
          {
            name: 'commonjs-inherits',
            resolveId(id, importer) {
              // readable-stream calls require('inherits') as a function.
              if (id === 'inherits') return this.resolve('inherits/inherits_browser.js', importer)
            },
          },
          nodePolyfills(),
        ],
      })
      try {
        const { output: [chunk] } = await bundle.generate({ format: 'es', sourcemap: true })
        return { code: chunk.code, map: chunk.map }
      } finally {
        await bundle.close()
      }
    },
  }
}
