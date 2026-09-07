// @vitest-environment jsdom

/**
 * `--geul-color-*` override가 실제 렌더된 에디터 DOM에 반영됨을 고정한다
 * (R4 슬라이스5 RD-001-DELTA-03, EXT-008). roadmap.md "결정"(라이트/다크
 * 상태 전환 지점)의 핵심 근거 — CSS 커스텀 속성은 상속되므로 소비자가
 * `--geul-color-*`를 재선언하는 것만으로 오늘도 이미 테마 전환이 동작한다
 * — 를 지금까지 아무 테스트도 고정하지 않아 이 파일이 그 공백을 메운다.
 *
 * jsdom은 `getComputedStyle(el).color` 같은 단축 속성에서 `var(--x, fb)`
 * 참조를 해석하지 않는다(리터럴 문자열을 그대로 반환, DELTA-03 착수 시
 * 스파이크로 확인). 대신 `getPropertyValue("--x")`로 커스텀 속성 자체를
 * 직접 조회하면 `:root` 재선언의 source-order cascade와 자손 상속을 정확히
 * 해석한다 — 이 파일은 그 경로로 검증한다. "그 속성을 소비하는 규칙이
 * `var(--geul-color-*, ...)` 형태로 컴파일된다"는 `style-build.test.ts`가
 * 소비처별로 이미 고정하므로, 두 테스트를 합치면 완료 조건 전체를
 * 만족한다.
 */
import { join } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { cleanup, render } from "@testing-library/react";
import * as sass from "sass";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorContent } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";

// 실제 패키지 SCSS 진입점을 그대로 컴파일한다 — style-build.test.ts와 같은
// 진입점(`src/styles.scss`)이라 값이 드리프트되면 그 테스트가 먼저 잡는다.
const packageRoot = fileURLToPath(new NodeURL("..", import.meta.url));
const entryPath = join(packageRoot, "src/styles.scss");
const packageCss = sass.compile(entryPath).css;

const fakeController = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  commands: {},
});

/** 테스트 전용 `<style>`을 head에 주입한다 — 소비자 앱의 실제 CSS 배치를 흉내낸다. */
const injectStyle = (css: string): void => {
  const style = document.createElement("style");
  style.setAttribute("data-test-style", "");
  style.textContent = css;
  document.head.appendChild(style);
};

afterEach(() => {
  cleanup();
  for (const style of document.head.querySelectorAll(
    "style[data-test-style]",
  )) {
    style.remove();
  }
});

describe("--geul-color-* override가 렌더된 에디터 DOM에 반영된다", () => {
  it("override 없이는 .geul-editor가 패키지 기본값을 그대로 상속한다", () => {
    injectStyle(packageCss);
    const { container } = render(
      withProvider(fakeController(), <EditorContent />),
    );
    const editorRoot = container.querySelector(".geul-editor");
    expect(editorRoot).not.toBeNull();

    const value = getComputedStyle(editorRoot as Element)
      .getPropertyValue("--geul-color-border")
      .trim();
    expect(value).toBe("#dadce0");
  });

  it("소비자가 :root에서 재선언하면 .geul-editor까지 override 값이 상속된다(다크 전환 시나리오 근거)", () => {
    injectStyle(packageCss);
    injectStyle(":root { --geul-color-border: #123456; }");
    const { container } = render(
      withProvider(fakeController(), <EditorContent />),
    );
    const editorRoot = container.querySelector(".geul-editor");

    const value = getComputedStyle(editorRoot as Element)
      .getPropertyValue("--geul-color-border")
      .trim();
    expect(value).toBe("#123456");
  });
});
