import js from '@eslint/js'
import next from '@next/eslint-plugin-next'
import { defineConfig, globalIgnores } from 'eslint/config'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['.next/**', '.yarn/**', 'out/**', 'build/**', 'next-env.d.ts']),
  { files: ['**/*.{js,mjs,ts,tsx}'], extends: [js.configs.recommended] },
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, hooks.configs.flat.recommended, next.configs['core-web-vitals']],
    languageOptions: { globals: globals.browser },
  },
])
