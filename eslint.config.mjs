import nextConfig from 'eslint-config-next'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

const eslintConfig = [
  {
    ignores: [
      'public/scripts/*',
      'scripts/**',
      '.mypy_cache/**',
      // ビルド成果物・サブプロジェクト（このリポジトリのlint対象外）
      '.open-next/**',
      'promo-video/**',
      'aituber-kit-docs/**',
      'aituber-kit-lp/**',
    ],
  },
  ...nextConfig,
  prettierConfig,
  {
    // react-hooks等のプラグインはnextConfig側でこのfilesパターンにのみ登録される
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      // React Compiler関連の新ルールを警告に変更（既存コードとの互換性のため）
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]

export default eslintConfig
