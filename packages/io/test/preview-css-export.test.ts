/**
 * packages/io가 "./preview.css"를 공개 export로 제공하는지 확인하는
 * 테스트다(Issue #178, RD-001). exports 계약, 빌드 산출물 존재, 승격
 * 소스의 Chrome75 호환(`:is()` 재유입 방지)과 커버리지 유지를 다룬다 —
 * 편집기-미리보기 시각 일치 자체는 RD-002의 e2e 회귀가 맡는다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * package.json을 매번 다시 읽는다 — 캐싱하면 값이 고정돼 필드가 지워져도
 * 테스트가 그걸 놓친다.
 */
function readPackageManifest(): { exports?: Record<string, unknown> } {
  return JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown> };
}

describe("preview.css export", () => {
  it('exports["./preview.css"]가 dist/preview.css를 가리킨다', () => {
    const manifest = readPackageManifest();
    expect(manifest.exports?.["./preview.css"]).toBe("./dist/preview.css");
  });

  it("빌드 산출물 dist/preview.css가 존재하고 .geul-preview 셀렉터를 포함한다", () => {
    const css = readFileSync(join(packageRoot, "dist/preview.css"), "utf8");
    expect(css).toContain(".geul-preview");
  });

  it("소스가 Chrome75 미지원 :is() 셀렉터를 쓰지 않는다", () => {
    const css = readFileSync(join(packageRoot, "src/preview.css"), "utf8");
    // 파일 상단 설명 주석이 ":is()"를 언급하므로(Chrome75엔 왜 못 쓰는지
    // 설명) 주석을 지운 실제 CSS 규칙만 검사한다.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toContain(":is(");
  });

  it("소스가 승격 대상 규칙을 전부 유지한다(헤딩/문단/blockquote/목록/코드/표/hr/링크/details/미디어)", () => {
    const css = readFileSync(join(packageRoot, "src/preview.css"), "utf8");
    for (const selectorFragment of [
      ".geul-preview h1,",
      ".geul-preview h6 {",
      ".geul-preview p {",
      ".geul-preview blockquote {",
      'li[data-geul-checked="true"]::before',
      ".geul-preview pre {",
      ".geul-preview :not(pre) > code {",
      ".geul-preview table {",
      ".geul-preview hr {",
      ".geul-preview a {",
      ".geul-preview summary {",
      ".geul-preview img,",
      'img[data-geul-text-alignment="left"]',
      'img[data-geul-text-alignment="right"]',
      ".geul-preview figcaption {",
    ]) {
      expect(css).toContain(selectorFragment);
    }
  });
});
