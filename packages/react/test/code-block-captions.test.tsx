// @vitest-environment jsdom

/**
 * CodeBlockCaptions 컴포넌트(RD-002 DELTA-02, Issue #194): 코드블록 하단에
 * always-visible caption 오버레이가 codeBlock 인스턴스마다 각자의 실측
 * 위치(readPageRect)에 뜨고, 빈 값이면 placeholder를 보이며, 클릭→입력→
 * Enter/blur로 커밋하고 Escape로 취소함을 검증한다. media/table 계열
 * 오버레이(TableHandles/MediaHandleOverlays)와 달리 hover로 뽑은 단일
 * 대상이 아니라 문서 안 모든 codeBlock을 동시에 렌더한다
 * (RD-002-DELTA-02.md "완료 조건과 검출 변이" 10).
 */
import { DEFAULT_DICTIONARY, type DocumentChangeEvent } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CodeBlockCaptions } from "../src/code-block-captions.js";
import {
  mountBlockEditor,
  type MountBlockEditorOptions,
} from "./mount-editor.js";

afterEach(cleanup);

const placeholder = DEFAULT_DICTIONARY.toolbar.codeBlock.captionPlaceholder;
const inputLabel = DEFAULT_DICTIONARY.toolbar.codeBlock.captionAriaLabel;

const renderCaptions = (
  options: Omit<MountBlockEditorOptions, "children"> = {},
) => mountBlockEditor({ ...options, children: <CodeBlockCaptions /> });

const captionInput = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("textbox", { name: inputLabel });

describe("codeBlock이 없으면 오버레이가 렌더되지 않는다(완료 조건 5)", () => {
  it("문단만 있는 문서에는 caption 오버레이가 없다", () => {
    renderCaptions();

    expect(screen.queryByRole("button", { name: placeholder })).toBeNull();
    expect(document.querySelector(".geul-code-block-caption")).toBeNull();
  });
});

describe("빈 caption은 placeholder를 보인다(완료 조건 6)", () => {
  it.each([undefined, ""])(
    "caption이 %s이면 placeholder를 보인다",
    (caption) => {
      renderCaptions({
        initialBlocks: [
          {
            id: "code-1",
            type: "codeBlock",
            content: [{ text: "a" }],
            ...(caption === undefined ? {} : { caption }),
          },
        ],
      });

      expect(screen.getByRole("button", { name: placeholder })).toBeTruthy();
    },
  );
});

describe("설정된 caption과 클릭 편집 진입(완료 조건 7)", () => {
  it("caption 값을 그대로 보여주고, 클릭하면 그 값을 초기값으로 한 input으로 전환된다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "code-1",
          type: "codeBlock",
          content: [{ text: "a" }],
          caption: "설명",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "설명" }));

    expect(captionInput().value).toBe("설명");
  });
});

describe("Enter·blur 커밋(완료 조건 8)", () => {
  it("input에서 값을 바꾸고 Enter를 누르면 문서에 반영되고 view 모드로 돌아온다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        { id: "code-1", type: "codeBlock", content: [{ text: "a" }] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: placeholder }));
    fireEvent.change(captionInput(), { target: { value: "새 캡션" } });
    fireEvent.keyDown(captionInput(), { key: "Enter" });

    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "새 캡션",
    });
    expect(screen.getByRole("button", { name: "새 캡션" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: inputLabel })).toBeNull();
  });

  it("Enter 없이 blur(포커스 이동)만으로도 커밋된다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        { id: "code-1", type: "codeBlock", content: [{ text: "a" }] },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: placeholder }));
    fireEvent.change(captionInput(), { target: { value: "blur 커밋" } });
    fireEvent.blur(captionInput());

    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "blur 커밋",
    });
    expect(screen.getByRole("button", { name: "blur 커밋" })).toBeTruthy();
  });

  it("값이 안 바뀌었으면 blur해도 명령을 호출하지 않는다(onChange 이벤트 없음)", () => {
    const changes: DocumentChangeEvent[] = [];
    const rendered = renderCaptions({
      initialBlocks: [
        {
          id: "code-1",
          type: "codeBlock",
          content: [{ text: "a" }],
          caption: "그대로",
        },
      ],
      onChange: (event) => changes.push(event),
    });

    fireEvent.click(screen.getByRole("button", { name: "그대로" }));
    fireEvent.blur(captionInput());

    expect(changes).toEqual([]);
    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "그대로",
    });
    expect(screen.getByRole("button", { name: "그대로" })).toBeTruthy();
  });
});

describe("Escape 취소(완료 조건 9)", () => {
  it("Escape를 누르면 draft를 버리고 커밋 없이 view 모드로 돌아온다", () => {
    const changes: DocumentChangeEvent[] = [];
    const rendered = renderCaptions({
      initialBlocks: [
        {
          id: "code-1",
          type: "codeBlock",
          content: [{ text: "a" }],
          caption: "원래 값",
        },
      ],
      onChange: (event) => changes.push(event),
    });

    fireEvent.click(screen.getByRole("button", { name: "원래 값" }));
    fireEvent.change(captionInput(), { target: { value: "버릴 값" } });
    fireEvent.keyDown(captionInput(), { key: "Escape" });

    expect(changes).toEqual([]);
    expect(screen.getByRole("button", { name: "원래 값" })).toBeTruthy();
    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "원래 값",
    });
  });
});

describe("여러 codeBlock의 독립 오버레이(완료 조건 10)", () => {
  it("각 codeBlock마다 독립된 오버레이가 뜨고 한쪽 편집이 다른 쪽 표시에 영향을 주지 않는다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "code-1",
          type: "codeBlock",
          content: [{ text: "a" }],
          caption: "첫째",
        },
        {
          id: "code-2",
          type: "codeBlock",
          content: [{ text: "b" }],
          caption: "둘째",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "첫째" }));

    expect(captionInput()).toBeTruthy();
    expect(screen.getByRole("button", { name: "둘째" })).toBeTruthy();
  });

  it("두 오버레이가 서로 다른 top 위치(실측 rect)에 뜬다", () => {
    renderCaptions({
      initialBlocks: [
        { id: "code-1", type: "codeBlock", content: [{ text: "a" }] },
        { id: "code-2", type: "codeBlock", content: [{ text: "b" }] },
      ],
    });
    // mountBlockEditor의 restubGeometry()는 render() 완료 뒤에(mount-editor.tsx
    // 참고) getBoundingClientRect를 스텁한다 — CodeBlockCaptions의 마운트 시
    // 최초 useSelectionRefresh onUpdate는 그보다 먼저 실행돼 스텁 전(전부
    // 0) 값을 읽는다. resize 이벤트로 재계산을 한 번 더 트리거해 스텁된
    // rect를 반영한다(useSelectionRefresh가 듣는 이벤트 중 하나).
    fireEvent(window, new Event("resize"));

    const overlays = document.querySelectorAll<HTMLElement>(
      ".geul-code-block-caption",
    );
    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.style.top).not.toBe(overlays[1]?.style.top);
  });
});
