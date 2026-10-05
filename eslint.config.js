// @cp949/geul 워크스페이스 전체를 한 번에 검사하는 루트 flat config다.
// biome.json을 대체한다 — 패키지별 eslint.config는 두지 않는다(단일 실행 방식 유지).
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    // biome.json의 files.includes 제외 목록과 동일하게 맞춘다.
    ignores: [
      ".worktrees/**",
      "_tmp/**",
      "_works/**",
      "**/.turbo/**",
      "**/.vite/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // React를 쓰는 패키지에만 hooks 규칙을 켠다.
    // eslint-plugin-react-hooks 7.x의 flat.recommended는 rules-of-hooks·
    // exhaustive-deps 외에 React Compiler 대비 규칙 전량(refs, purity,
    // set-state-in-effect, immutability 등)을 error로 켠다 — 기존 코드의
    // ref-during-render·effect 내부 setState 패턴을 대량으로 어긋난 것으로
    // 표시하는데, 고치려면 컴포넌트 로직 자체를 바꿔야 해서 biome→eslint
    // 도구 교체 범위를 벗어난다. 전통적인 hooks 규칙 두 개만 켠다.
    files: [
      "packages/react/**/*.{ts,tsx}",
      "apps/demo/**/*.{ts,tsx}",
      "apps/showcase/**/*.{ts,tsx}",
    ],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Issue #271·#272 — 전역 DOM 생성자 `instanceof`는 iframe 문서 노드에서
    // 틀린다. iframe 문서의 노드와 이벤트는 다른 realm 인스턴스다.
    // 판정은 각 패키지 `dom-node.ts`의 `nodeType` helper로 한다.
    // test 파일과 apps는 대상이 아니다.
    // 규칙은 이름만 본다. `@tiptap/core`의 `Node` 같은 같은 이름 클래스의
    // 정당한 `instanceof`는 그 줄에 disable 주석과 이유를 단다.
    files: ["packages/core/src/**/*.ts", "packages/react/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[operator='instanceof'][right.type='Identifier'][right.name=/^(Node|Element|Text|CharacterData|Document|DocumentFragment|ShadowRoot|Window|(HTML|SVG|MathML)\\w*Element|\\w*Event)$/]",
          message:
            "전역 DOM 생성자 instanceof는 iframe 문서 노드에서 틀린다. 각 패키지 dom-node.ts의 helper로 nodeType 판정을 한다.",
        },
      ],
    },
  },
];
