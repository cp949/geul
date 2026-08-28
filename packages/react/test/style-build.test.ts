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

const compileCss = (): string => sass.compile(entryPath).css;

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
