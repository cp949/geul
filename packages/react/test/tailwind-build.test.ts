import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const require = createRequire(import.meta.url);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
// .bin의 셸 심(node_modules/.bin/tailwindcss)은 pnpm 링커 설정과 플랫폼에
// 의존하므로, CLI 패키지의 bin 필드가 가리키는 JS 엔트리를 node로 직접
// 실행한다(레포 관례: core의 public-types.test.ts와 동일 방식).
const cliManifestPath = require.resolve("@tailwindcss/cli/package.json");
const cliEntry = join(
  dirname(cliManifestPath),
  require(cliManifestPath).bin.tailwindcss,
);
// 주의: 캔러리 파일명을 .gitignore에 등록하면 안 된다 — Tailwind v4의 소스
// 스캔은 명시적 @source 아래에서도 gitignore를 존중하므로 캔러리가 스캔에서
// 빠져 이 테스트가 깨진다(실측 확인). 대신 dist 유출은 packages/react의
// tsconfig exclude가 막고, 각 테스트가 afterEach/finally로 파일을 정리한다.
const canaryPath = fileURLToPath(
  new URL("../src/__tailwind-canary.ts", import.meta.url),
);

const buildTailwindCss = async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliEntry, "-i", "src/tailwind.css", "-o", "-"],
    { cwd: packageRoot },
  );
  return stdout;
};

describe("Tailwind CSS 빌드 파이프라인", () => {
  afterEach(async () => {
    await rm(canaryPath, { force: true });
  });

  it("src에서 사용한 geul: 유틸리티 클래스를 실제로 컴파일한다", async () => {
    await writeFile(
      canaryPath,
      'export const _tailwindBuildCanary = "geul:hidden";\n',
    );

    const css = await buildTailwindCss();

    expect(css).toContain(".geul\\:hidden {");
  });

  it("src 밖 파일의 geul: 사용은 스캔하지 않는다(source(none) + 명시적 @source 계약)", async () => {
    const outsidePath = fileURLToPath(
      new URL("../__tailwind-canary-outside.ts", import.meta.url),
    );
    await writeFile(outsidePath, 'export const _outside = "geul:sr-only";\n');

    try {
      const css = await buildTailwindCss();
      expect(css).not.toContain(".geul\\:sr-only {");
    } finally {
      await rm(outsidePath, { force: true });
    }
  });

  it("CLI가 컴파일하는 엔진 버전이 devDependency tailwindcss 버전과 일치한다", async () => {
    // tailwindcss(theme.css 제공)와 @tailwindcss/cli(컴파일 엔진)는 서로
    // 독립적으로 고정된 exact devDep이라, 한쪽만 범프되면 한 버전의
    // theme.css를 다른 버전 엔진으로 컴파일하는 스큐가 에러 없이 지나간다.
    // 출력 헤더의 엔진 버전을 devDep 선언과 대조해 스큐를 고정한다.
    const manifest = require(join(packageRoot, "package.json"));

    const css = await buildTailwindCss();

    expect(css).toContain(
      `/*! tailwindcss v${manifest.devDependencies.tailwindcss} `,
    );
  });

  it("생성 CSS에 @tailwind나 미해결 @import를 남기지 않는다", async () => {
    const css = await buildTailwindCss();

    expect(css).not.toContain("@tailwind");
    expect(css).not.toMatch(/@import\s/);
  });

  it("theme/utilities를 layer()로 감싸지 않는다(소비자 unlayered CSS 안전성 게이트)", async () => {
    await writeFile(
      canaryPath,
      'export const _tailwindBuildCanary = "geul:hidden";\n',
    );

    const css = await buildTailwindCss();

    // Tailwind가 @property 폴백용으로 항상 내는 "@layer properties"는
    // 우리 theme/utilities 레이어와 무관하므로 허용한다. layer() 수식어를
    // 붙였다면 나타났을 "@layer theme"/"@layer utilities"만 없으면 된다.
    expect(css).not.toContain("@layer theme");
    expect(css).not.toContain("@layer utilities");
    expect(css).toContain(".geul\\:hidden {");
  });

  it(":root에 --be-color-* 디자인 토큰 8개의 기본값을 선언한다(SCSS 전환 전 SSOT 확보)", async () => {
    // 이전에는 var(--be-color-x, #hex) fallback 리터럴이 10여 개 파일에
    // 흩어져 있을 뿐 실제 선언부가 packages/react 안에 없었다(아키텍처
    // 리뷰 03.html 실행 순서 1단계). 값 자체는 각 fallback과 동일해야
    // 하므로 시각적 회귀 없이 SSOT만 추가한다 — 값이 하나라도 드리프트되면
    // 이 테스트가 잡는다.
    const css = await buildTailwindCss();

    const tokens = {
      "--be-color-text": "#202124",
      "--be-color-text-muted": "#5f6368",
      "--be-color-border": "#dadce0",
      "--be-color-danger": "#d93025",
      "--be-color-surface": "#fff",
      "--be-color-surface-muted": "#f1f3f4",
      "--be-color-accent": "#1a73e8",
      "--be-color-accent-muted": "#e8f0fe",
    } as const;

    for (const [name, value] of Object.entries(tokens)) {
      expect(css).toContain(`${name}: ${value};`);
    }
  });
});
