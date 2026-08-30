/**
 * React SCSS 진입점의 실제 컴파일 결과와 PostCSS 호환성 처리를 검증한다.
 * DOM 계약, 디자인 토큰, overlay viewport 제약을 함께 고정한다.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import * as sass from "sass";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const entryPath = join(packageRoot, "src/styles.scss");

// package.json의 browserslist를 그대로 읽는다 — 값을 테스트에 다시
// 하드코딩하면 package.json만 바뀌었을 때 이 테스트가 그 변경을 못 잡는다
// (레포 관례: 이전 tailwind-build.test.ts의 엔진 버전 대조와 동일 이유).
const manifest = require(join(packageRoot, "package.json"));

/** 실제 패키지 SCSS 진입점을 소비자에게 배포되는 CSS 형태로 컴파일한다. */
const compileCss = (): string => sass.compile(entryPath).css;

/** Autoprefixer 설정이 독립 SCSS 입력에도 적용되는지 확인할 CSS를 만든다. */
const compileCanary = async (scss: string): Promise<string> => {
  const raw = sass.compileString(scss).css;
  const result = await postcss([
    autoprefixer({ overrideBrowserslist: manifest.browserslist }),
  ]).process(raw, { from: undefined });
  return result.css;
};

describe("SCSS 빌드 파이프라인", () => {
  it("src에서 쓰는 geul- 클래스를 실제로 컴파일한다", () => {
    const css = compileCss();

    expect(css).toContain(".geul-icon-button {");
    expect(css).toContain(".geul-table-menu__item--danger:disabled {");
  });

  it("placeholder 표시 규칙을 data-placeholder 속성 선택자로 컴파일한다(UI-009)", () => {
    // 문구·데코레이션은 core가 소유하고(placeholder-extension.ts) react는
    // 이 표시 규칙만 소유한다 — 규칙이 빠지면 속성은 붙는데 아무것도
    // 보이지 않는 조용한 회귀가 된다.
    const css = compileCss();

    expect(css).toContain("[data-placeholder]::before");
    expect(css).toContain("content: attr(data-placeholder);");
  });

  it("목록 marker를 blockContainer 앞에 그리고 콘텐츠 placeholder와 중첩 padding을 함께 컴파일한다", () => {
    const css = compileCss();
    const markerLayout =
      /\.geul-editor \[data-be-list-marker\] \{(?<body>[^}]*)\}/.exec(css)
        ?.groups?.body;
    const marker =
      /\.geul-editor \[data-be-list-marker\]::before \{(?<body>[^}]*)\}/.exec(
        css,
      )?.groups?.body;

    expect(markerLayout).toContain("display: grid;");
    expect(markerLayout).toContain(
      "grid-template-columns: max-content minmax(0, 1fr);",
    );
    expect(markerLayout).toContain("column-gap: 0.5rem;");
    expect(marker).toContain("content: attr(data-be-list-marker);");
    expect(marker).toContain("grid-column: 1;");
    expect(marker).toContain("grid-row: 1;");
    expect(marker).not.toContain("position: absolute;");
    expect(css).toContain("[data-be-list-marker] > [data-be-block-group]");
    expect(css).toContain("grid-column: 2;");
    expect(css).toContain("grid-row: 2;");
    expect(css).toContain("[data-placeholder]::before");
    expect(css).toContain("[data-be-block-group] {");
    expect(css).toContain("padding-left: 1.5rem;");
  });

  it("CodeBlock을 plain monospace와 가로 overflow가 있는 코드 영역으로 컴파일한다", () => {
    const css = compileCss();
    const rule = /\.geul-editor \[data-be-code-block\] \{(?<body>[^}]*)\}/.exec(
      css,
    )?.groups?.body;

    expect(rule).toContain("font-family: ui-monospace");
    expect(rule).toContain("padding: 0.75rem 1rem;");
    expect(rule).toContain("background:");
    expect(rule).toContain("border: 1px solid");
    expect(rule).toContain("overflow-x: auto;");
    expect(css).not.toMatch(/\[data-be-code-block\].*(?:\.token|language-)/);
  });

  it("CodeBlock language overlay의 최대 높이에 padding과 border를 포함한다", () => {
    const css = compileCss();
    const rule = /\.geul-code-block-language \{(?<body>[^}]*)\}/.exec(css)
      ?.groups?.body;

    expect(rule).toContain("box-sizing: border-box;");
    expect(rule).toContain("max-height: calc(100vh - 1rem);");
  });

  it("CodeBlock language overlay 폭을 좁은 viewport의 양쪽 8px 여백 안으로 제한한다", () => {
    const css = compileCss();
    const rule = /\.geul-code-block-language \{(?<body>[^}]*)\}/.exec(css)
      ?.groups?.body;

    expect(rule).toContain("width: 14rem;");
    expect(rule).toContain("max-width: calc(100vw - 1rem);");
    expect(rule).toContain("box-sizing: border-box;");
  });

  it("Block menu가 CodeBlock language overlay보다 높은 click 계층을 사용한다", () => {
    const css = compileCss();
    const languageRule = /\.geul-code-block-language \{(?<body>[^}]*)\}/.exec(
      css,
    )?.groups?.body;
    const blockMenuRule = /\.geul-block-menu \{(?<body>[^}]*)\}/.exec(css)
      ?.groups?.body;

    expect(languageRule).toContain("z-index: 30;");
    expect(blockMenuRule).toContain("z-index: 40;");
  });

  it(":root에 --geul-color-* 디자인 토큰 8개의 기본값을 선언한다(SCSS 전환 SSOT)", () => {
    // packages/react/src/styles.css의 var(--be-color-x, #hex) fallback과
    // 값이 같아야 한다 — 하나라도 드리프트되면 이 테스트가 잡는다.
    const css = compileCss();

    const tokens = {
      "--geul-color-text": "#202124",
      "--geul-color-text-muted": "#5f6368",
      "--geul-color-border": "#dadce0",
      "--geul-color-danger": "#d93025",
      "--geul-color-surface": "#fff",
      "--geul-color-surface-muted": "#f1f3f4",
      "--geul-color-accent": "#1a73e8",
      "--geul-color-accent-muted": "#e8f0fe",
    } as const;

    for (const [name, value] of Object.entries(tokens)) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });

  it("생성 CSS에 미해결 @use나 Sass 변수를 남기지 않는다", () => {
    const css = compileCss();

    expect(css).not.toContain("@use");
    expect(css).not.toMatch(/\$[a-z-]+:/);
  });

  it("theme/utilities를 @layer로 감싸지 않는다(소비자 unlayered CSS 안전성 게이트)", () => {
    // 손으로 쓴 SCSS는 아무도 @layer를 안 쓰면 애초에 안 생긴다 — Tailwind
    // 시절처럼 도구 설정(layer() 수식어)이 실수로 이 계약을 깰 위험은
    // 사라졌지만, 회귀 감지 자체는 e2e/tailwind-migration.spec.ts의
    // "소비자 리셋을 이긴다" 테스트와 짝을 이루는 낮은 계층 게이트로 남긴다.
    const css = compileCss();

    expect(css).not.toContain("@layer");
  });

  it("data-be-* DOM attribute 셀렉터는 이름을 바꾸지 않는다(core/model 공유 계약, 이번 SCSS 전환 범위 밖)", () => {
    const css = compileCss();

    expect(css).toContain('table[data-be-header-rows="1"]');
    expect(css).toContain('table[data-be-header-columns="1"]');
  });

  it("PostCSS Autoprefixer가 package.json의 Browserslist를 읽어 필요한 vendor prefix를 추가한다", async () => {
    // appearance는 Chrome 75 타겟에서 -webkit- prefix가 필요하다(autoprefixer
    // --info로 실측 확인). 실제 컴포넌트 CSS는 이 속성을 쓰지 않으므로
    // dist/styles.css 자체에는 이 prefix가 없다 — 파이프라인이 살아있는지는
    // 캔러리로 검증한다(레포 관례: 이전 tailwind-build.test.ts의
    // __tailwind-canary.ts와 같은 이유).
    expect(manifest.browserslist).toEqual(["Chrome >= 75"]);

    const css = await compileCanary(".probe { appearance: none; }");

    expect(css).toContain("-webkit-appearance: none;");
    expect(css).toContain("appearance: none;");
  });
});
