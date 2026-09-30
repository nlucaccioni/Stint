// SPDX-License-Identifier: GPL-3.0-or-later
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['**/out/**', '**/dist/**', '**/release/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  // packages/core must stay free of UI, Electron, and DB code so web + sync can reuse it.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'react', 'react-dom', 'better-sqlite3', 'drizzle-orm*', 'node:*'],
              message: 'packages/core must not depend on Electron, React, Node, or the database.',
            },
          ],
        },
      ],
    },
  },
)
