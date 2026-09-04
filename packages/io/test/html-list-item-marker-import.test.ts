/**
 * 생산 편집기 in-editor copy가 실제로 만드는 목록류 4종의 production
 * 마커 HTML(`div[data-be-bullet-list-item]` 등, `ul`/`li`가 아니다)을
 * `io.importHtml`이 own-content로 인식해 대응 블록 타입으로 반영하는지,
 * 상태 attribute(`data-be-checked`/`data-be-start-number`/
 * `data-be-collapsed`)가 있으면 그 값을 없으면 model 기본값을 반영하는지
 * 검증한다(Issue #38 슬라이스 10 RD-003 DELTA-01). hand-authored
 * fixture만 다룬다 — 실제 core 렌더 DOM과의 통합 왕복은 DELTA-02가
 * `result/RD-003-DELTA-02.md`에서 다룬다. 기존 own-format(`<li>`/
 * `<details>` 기반) 목록 회귀는 이 파일이 아니라
 * `html-check-list-item-import.test.ts`/`html-toggle-import.test.ts`가
 * 재실행으로 계속 지킨다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

describe("production 목록류 div 마커 편입", () => {
  it("bulletListItem production 마커는 own-content로 인식된다", () => {
    const result = importHtml(
      '<div data-be-block-id="A"><div data-be-bullet-list-item>text</div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "A", type: "bulletListItem", content: [{ text: "text" }] },
    ]);
  });

  it("numberedListItem production 마커는 startNumber 없이도 인식된다", () => {
    const result = importHtml(
      '<div data-be-block-id="A"><div data-be-numbered-list-item>text</div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "A", type: "numberedListItem", content: [{ text: "text" }] },
    ]);
  });

  it("numberedListItem production 마커는 data-be-start-number 값을 반영한다", () => {
    const result = importHtml(
      '<div data-be-block-id="A">' +
        '<div data-be-numbered-list-item data-be-start-number="3">text</div>' +
        "</div>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "A",
        type: "numberedListItem",
        content: [{ text: "text" }],
        startNumber: 3,
      },
    ]);
  });

  it("checkListItem production 마커는 상태 없으면 checked:false로 반영된다", () => {
    const result = importHtml(
      '<div data-be-block-id="A"><div data-be-check-list-item>text</div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "A",
        type: "checkListItem",
        content: [{ text: "text" }],
        checked: false,
      },
    ]);
  });

  it("checkListItem production 마커는 data-be-checked=true를 반영한다", () => {
    const result = importHtml(
      '<div data-be-block-id="A">' +
        '<div data-be-check-list-item data-be-checked="true">text</div>' +
        "</div>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "A",
        type: "checkListItem",
        content: [{ text: "text" }],
        checked: true,
      },
    ]);
  });

  it("checkListItem production 마커는 data-be-checked=false를 명시값으로 반영한다", () => {
    const result = importHtml(
      '<div data-be-block-id="A">' +
        '<div data-be-check-list-item data-be-checked="false">text</div>' +
        "</div>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "A",
        type: "checkListItem",
        content: [{ text: "text" }],
        checked: false,
      },
    ]);
  });

  it("toggleListItem production 마커는 collapsed 없이도 인식된다", () => {
    const result = importHtml(
      '<div data-be-block-id="A"><div data-be-toggle-list-item>text</div></div>',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      { id: "A", type: "toggleListItem", content: [{ text: "text" }] },
    ]);
  });

  it("toggleListItem production 마커는 data-be-collapsed=true를 반영한다", () => {
    const result = importHtml(
      '<div data-be-block-id="A">' +
        '<div data-be-toggle-list-item data-be-collapsed="true">text</div>' +
        "</div>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "A",
        type: "toggleListItem",
        content: [{ text: "text" }],
        collapsed: true,
      },
    ]);
  });

  it("data-be-block-group 안에 목록류 부모+자식이 들어간 구조는 children으로 보존된다", () => {
    const result = importHtml(
      '<div data-be-block-id="P"><div data-be-bullet-list-item>parent</div>' +
        '<div data-be-block-group=""><div data-be-block-id="C">' +
        '<div data-be-check-list-item data-be-checked="true">child</div>' +
        "</div></div></div>",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.blocks).toEqual([
      {
        id: "P",
        type: "bulletListItem",
        content: [{ text: "parent" }],
        children: [
          {
            id: "C",
            type: "checkListItem",
            content: [{ text: "child" }],
            checked: true,
          },
        ],
      },
    ]);
  });

  it("목록류 마커가 전혀 없는 임의 div는 own-content로 오인식되지 않는다", () => {
    const result = importHtml("<div><div>흔한 문단</div></div>");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const block of result.value.document.blocks) {
      expect(block.type).not.toBe("bulletListItem");
      expect(block.type).not.toBe("numberedListItem");
      expect(block.type).not.toBe("checkListItem");
      expect(block.type).not.toBe("toggleListItem");
    }
  });
});
