/**
 * `attributeOverrides.editor` + `--geul-color-*` 재선언 조합으로 "다크
 * 전환" 시나리오가 실제로 동작함을 고정한다(spec §7, R4 슬라이스5
 * RD-002-DELTA-04, EXT-008, RD-002 마지막 DELTA). roadmap.md "결정"(전용
 * `colorScheme` prop 대신 `attributeOverrides` 흡수)의 핵심 주장 — 컨슈머가
 * 스스로 만든 attribute를 selector로 쓰는 CSS로 `--geul-color-*`를
 * 재선언하면 상태 전환이 동작한다 — 를 검증하는 자리다. 새 프로덕션
 * 코드는 없다(DELTA-01~03이 이미 배선을 마쳤다).
 *
 * RD-001-DELTA-03(`color-token-override.test.tsx`)이 확인한 jsdom 제약과
 * 같다 — `getComputedStyle(el).color` 같은 단축 속성은 `var()`를 해석하지
 * 않지만 `getPropertyValue("--x")`는 cascade를 정확히 해석한다. core 패키지
 * 테스트는 `vitest.config.ts` 프로젝트 설정상 기본 jsdom 환경이라 별도
 * pragma가 필요 없다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "../src/index.js";
import {
  mountTiptapEditor,
  paragraphDocument,
} from "./editor-controller-support.js";

const injectStyle = (css: string): void => {
  const style = document.createElement("style");
  style.setAttribute("data-test-style", "");
  style.textContent = css;
  document.head.appendChild(style);
};

afterEach(() => {
  for (const style of document.head.querySelectorAll("style[data-test-style]")) {
    style.remove();
  }
  for (const container of document.body.querySelectorAll(
    "[data-test-container]",
  )) {
    container.remove();
  }
});

/**
 * mountTiptapEditor()의 컨테이너는 document에 붙지 않은 채 반환된다(core
 * 테스트 헬퍼 계약, `list-item-block-type-support.ts`) — `:root`
 * 선언의 상속 해석은 documentElement까지 이어지는 실제 트리 연결이
 * 필요하므로(jsdom 실측: 미연결 트리에서 상속값은 빈 문자열을 반환하고,
 * 요소 자신에 직접 매치하는 규칙만 연결 여부와 무관하게 해석된다) 이
 * 시나리오 검증만 별도로 document.body에 붙인다.
 */
const attachToDocument = (editable: HTMLElement): void => {
  const container = editable.parentElement ?? editable;
  container.setAttribute("data-test-container", "");
  document.body.appendChild(container);
};

describe("attributeOverrides.editor + --geul-color-* 다크 전환 시나리오", () => {
  it("컨슈머가 만든 attribute selector로 재선언한 --geul-color-*가 편집 가능 DOM에 반영된다", () => {
    injectStyle(`
      :root { --geul-color-border: #dadce0; }
      [data-color-scheme="dark"] { --geul-color-border: #5f6368; }
    `);
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
      attributeOverrides: { editor: { "data-color-scheme": "dark" } },
    });
    const { editable } = mountTiptapEditor(editor);
    attachToDocument(editable);

    const value = getComputedStyle(editable)
      .getPropertyValue("--geul-color-border")
      .trim();
    expect(value).toBe("#5f6368");
  });

  it("attributeOverrides.editor를 지정하지 않으면 같은 CSS가 있어도 dark override가 적용되지 않는다(대조군)", () => {
    injectStyle(`
      :root { --geul-color-border: #dadce0; }
      [data-color-scheme="dark"] { --geul-color-border: #5f6368; }
    `);
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });
    const { editable } = mountTiptapEditor(editor);
    attachToDocument(editable);

    const value = getComputedStyle(editable)
      .getPropertyValue("--geul-color-border")
      .trim();
    expect(value).toBe("#dadce0");
  });
});
