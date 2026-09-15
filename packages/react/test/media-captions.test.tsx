// @vitest-environment jsdom

/**
 * MediaCaptions 컴포넌트(2026-09-16, Notion 스타일 클릭-즉시-편집 요청 —
 * 그릴링 Q1~Q8): image/video/audio/file 블록 아래 caption을 클릭해 바로
 * 편집할 수 있음을 검증한다. `code-block-captions.tsx`의 클릭→입력→
 * Enter/blur 커밋·Escape 취소 계약을 그대로 따르되(테스트 구조도 그 파일을
 * 미러링한다), 두 지점이 다르다 — 빈 캡션의 진입점이 hover 게이트다(Q2),
 * Shift+Enter로 실제 줄바꿈을 넣을 수 있다(Q3, `<textarea>`).
 */
import { DEFAULT_DICTIONARY, type DocumentChangeEvent } from "@cp949/geul-core";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MediaCaptions } from "../src/media-captions.js";
import {
  mountBlockEditor,
  type MountBlockEditorOptions,
} from "./mount-editor.js";

afterEach(cleanup);

const addCaptionLabel = DEFAULT_DICTIONARY.toolbar.media.addCaptionAriaLabel;
const inputLabelFor = (kind: "image" | "video" | "audio" | "file") =>
  DEFAULT_DICTIONARY.toolbar.media.captionInputAriaLabel.replace(
    "{kind}",
    DEFAULT_DICTIONARY.toolbar.kindNames[kind],
  );

const renderCaptions = (
  options: Omit<MountBlockEditorOptions, "children"> = {},
) => mountBlockEditor({ ...options, children: <MediaCaptions /> });

const captionTextarea = (
  kind: "image" | "video" | "audio" | "file" = "image",
): HTMLTextAreaElement =>
  screen.getByRole<HTMLTextAreaElement>("textbox", { name: inputLabelFor(kind) });

describe("캡션 표시(완료 조건 — 값이 있으면 hover와 무관하게 항상 보인다)", () => {
  it("caption이 있으면 hover 없이도 표시 버튼이 뜬다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "설명",
        },
      ],
    });

    expect(screen.getByRole("button", { name: "설명" })).toBeTruthy();
  });

  it("caption이 없고 hover도 없으면 아무것도 렌더되지 않는다(Q2 — placeholder가 공간을 차지하지 않는다)", () => {
    renderCaptions({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/a.png" },
      ],
    });

    expect(document.querySelector(".geul-media-caption")).toBeNull();
    expect(screen.queryByText(addCaptionLabel)).toBeNull();
  });
});

describe("빈 캡션의 hover 진입점(Q2)", () => {
  it("caption이 없는 media를 hover하면 '캡션 추가' 버튼이 뜬다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/a.png" },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");

    fireEvent.pointerMove(media);

    expect(screen.getByText(addCaptionLabel)).toBeTruthy();
  });

  it("'캡션 추가' 버튼을 클릭하면 빈 draft로 편집 textarea가 뜬다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/a.png" },
      ],
    });
    const [media] = rendered.blocks;
    if (media === undefined) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);

    fireEvent.click(screen.getByText(addCaptionLabel));

    const textarea = captionTextarea();
    expect(textarea.value).toBe("");
    expect(textarea.placeholder).toBe(
      DEFAULT_DICTIONARY.toolbar.media.captionOverlayPlaceholder,
    );
  });
});

describe("클릭 편집 진입", () => {
  it("caption 값을 그대로 보여주고, 클릭하면 그 값을 초기값으로 한 textarea로 전환된다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "설명",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "설명" }));

    expect(captionTextarea().value).toBe("설명");
  });
});

describe("Enter·blur 커밋", () => {
  it("textarea에서 값을 바꾸고 Enter를 누르면 문서에 반영되고 표시 모드로 돌아온다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "원래",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "원래" }));
    fireEvent.change(captionTextarea(), { target: { value: "새 캡션" } });
    fireEvent.keyDown(captionTextarea(), { key: "Enter" });

    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "새 캡션",
    });
    expect(screen.getByRole("button", { name: "새 캡션" })).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: inputLabelFor("image") }),
    ).toBeNull();
  });

  it("Enter 없이 blur(포커스 이동)만으로도 커밋된다", () => {
    const rendered = renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "원래",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "원래" }));
    fireEvent.change(captionTextarea(), { target: { value: "blur 커밋" } });
    fireEvent.blur(captionTextarea());

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
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "그대로",
        },
      ],
      onChange: (event) => changes.push(event),
    });

    fireEvent.click(screen.getByRole("button", { name: "그대로" }));
    fireEvent.blur(captionTextarea());

    expect(changes).toEqual([]);
    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "그대로",
    });
  });
});

describe("Escape 취소", () => {
  it("Escape를 누르면 draft를 버리고 커밋 없이 표시 모드로 돌아온다", () => {
    const changes: DocumentChangeEvent[] = [];
    const rendered = renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "원래 값",
        },
      ],
      onChange: (event) => changes.push(event),
    });

    fireEvent.click(screen.getByRole("button", { name: "원래 값" }));
    fireEvent.change(captionTextarea(), { target: { value: "버려질 값" } });
    fireEvent.keyDown(captionTextarea(), { key: "Escape" });

    expect(changes).toEqual([]);
    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "원래 값",
    });
    expect(screen.getByRole("button", { name: "원래 값" })).toBeTruthy();
  });
});

describe("Shift+Enter 멀티라인(Q3)", () => {
  it("Shift+Enter는 커밋하지 않고 편집 상태를 유지한다(기본 textarea 개행 동작에 맡긴다)", () => {
    renderCaptions({
      initialBlocks: [
        { id: "image-1", type: "image", url: "https://example.com/a.png" },
      ],
    });
    const media = document.querySelector<HTMLElement>(
      "[data-geul-media-kind]",
    );
    if (media === null) throw new Error("media 요소가 없다");
    fireEvent.pointerMove(media);
    fireEvent.click(screen.getByText(addCaptionLabel));

    fireEvent.change(captionTextarea(), { target: { value: "첫 줄" } });
    fireEvent.keyDown(captionTextarea(), { key: "Enter", shiftKey: true });

    // preventDefault를 호출하지 않았다는 것만 이 계층에서 확인할 수 있다
    // (jsdom은 실제 textarea 개행 삽입을 렌더링하지 않는다) — 편집 상태가
    // 그대로 유지되는지(커밋되지 않았는지)로 Shift+Enter가 일반 Enter와
    // 다르게 처리됐음을 검증한다.
    expect(
      screen.getByRole("textbox", { name: inputLabelFor("image") }),
    ).toBeTruthy();
  });
});

describe("캡션 폭 — 이미지 실측 폭에 맞추고 하한(8rem/128px)을 둔다(Q7·Q8)", () => {
  it("이미지가 min-width보다 넓으면 caption 폭이 이미지 실측 폭과 같다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "설명",
        },
      ],
      layout: { left: 10, top: 0, width: 300, height: 20 },
    });
    // mountBlockEditor의 restubGeometry()는 render() 완료 뒤에 rect를
    // 스텁한다(code-block-captions.test.tsx와 같은 이유) — resize
    // 이벤트를 한 번 더 쏴 스텁된 rect를 반영한다.
    fireEvent(window, new Event("resize"));

    const container = document.querySelector<HTMLElement>(
      ".geul-media-caption",
    );
    expect(container?.style.width).toBe("300px");
    expect(container?.style.left).toBe("10px");
  });

  it("이미지가 min-width(128px)보다 좁으면 caption 폭이 128px로 커지고 가운데 정렬된다", () => {
    renderCaptions({
      initialBlocks: [
        {
          id: "image-1",
          type: "image",
          url: "https://example.com/a.png",
          caption: "설명",
        },
      ],
      layout: { left: 100, top: 0, width: 40, height: 20 },
    });
    fireEvent(window, new Event("resize"));

    const container = document.querySelector<HTMLElement>(
      ".geul-media-caption",
    );
    expect(container?.style.width).toBe("128px");
    // 원래 이미지 중심(100 + 40/2 = 120)을 기준으로 128px 폭이 양쪽 절반씩
    // 늘어난다 — left = 120 - 128/2 = 56.
    expect(container?.style.left).toBe("56px");
  });
});
