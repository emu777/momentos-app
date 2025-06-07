// eslint.config.mjs

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals"; // ★ globalsをインポート
import tseslint from "typescript-eslint"; // ★ typescript-eslintをインポート

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),

  // ★★★ ここからが修正・追加部分 ★★★
  // TypeScriptの基本的な設定
  ...tseslint.configs.recommended,

  // Next.jsのTypeScript設定を適用しつつ、ルールを上書きするためのオブジェクトを追加
  {
    files: ["**/*.ts", "**/*.tsx"], // TypeScriptファイルに適用
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      // 既存のNext.jsのルールをここで上書き・追加できます

      // ★ 未使用変数のルールをカスタマイズ ★
      "@typescript-eslint/no-unused-vars": [
        "error", // "warn" にすると警告になります
        {
          "args": "after-used",
          "ignoreRestSiblings": true,
          "argsIgnorePattern": "^_", // アンダースコアで始まる引数を無視
          "varsIgnorePattern": "^_", // アンダースコアで始まる変数も無視
          "caughtErrorsIgnorePattern": "^_" // catchブロックのエラー変数も無視
        }
      ],
      
      // 'any'型を許可しないルール (これは前回のエラーで出ていましたね)
      // 必要であれば、ここでも設定を調整できます
      "@typescript-eslint/no-explicit-any": "error", // または "warn"
    },
  }
  // ★★★ ここまでが修正・追加部分 ★★★
];

export default eslintConfig;