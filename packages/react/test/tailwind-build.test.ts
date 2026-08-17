import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const tailwindBin = fileURLToPath(
  new URL("../node_modules/.bin/tailwindcss", import.meta.url),
);
const canaryPath = fileURLToPath(
  new URL("../src/__tailwind-canary.ts", import.meta.url),
);

const buildTailwindCss = async () => {
  const { stdout } = await execFileAsync(
    tailwindBin,
    ["-i", "src/tailwind.css", "-o", "-"],
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
});
