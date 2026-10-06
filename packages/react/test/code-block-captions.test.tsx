// @vitest-environment jsdom

/**
 * CodeBlockCaptions 컴포넌트(RD-002 DELTA-02, Issue #194; 좌상단 위치·toolbar·
 * more 메뉴 진입점은 Issue #196; 조건부 표시는 Issue #195): 코드블록
 * 좌상단에 caption 오버레이가 codeBlock 인스턴스마다 각자의 실측
 * 위치(readPageRect)에 뜨되, 값이 있거나 편집 중일 때만 렌더된다(빈 값+
 * 비편집이면 렌더 자체가 없음 — placeholder "caption" 문구는 이제 빈 값
 * 비편집 버튼이 아니라 편집 input의 HTML placeholder attribute가 담당하고,
 * draft가 빈 문자열일 때만 보인다). 클릭→입력→Enter/blur로 커밋하고 Escape로
 * 취소함을 검증한다. media/table 계열 오버레이(TableHandles/
 * MediaHandleOverlays)와 달리 hover로 뽑은 단일 대상이 아니라 문서 안 모든
 * codeBlock을 동시에 렌더 대상으로 삼는다(RD-002-DELTA-02.md "완료 조건과
 * 검출 변이" 10).
 */
import { DEFAULT_DICTIONARY, type DocumentChangeEvent } from "@cp949/geul-core";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getCodeBlockCaptionEditingSnapshot,
  setCodeBlockCaptionEditing,
} from "../src/code-block-caption-editing-store.js";
import { CodeBlockCaptions } from "../src/code-block-captions.js";
import {
  toggleCollapseByHostApi,
  toggleWithChild,
} from "./collapsed-toggle-test-support.js";
import {
  mountBlockEditor,
  type MountBlockEditorOptions,
  stubRect,
} from "./mount-editor.js";
import { releaseEnterRepeatSuppression } from "./menu-keyboard-test-support.js";

afterEach(cleanup);
// 캡션 Enter가 handleMenuKeyDown의 문서 capture 반복 억제를 건다. 다음 테스트에
// 남지 않게 푼다(G-TST-003).
afterEach(releaseEnterRepeatSuppression);

const placeholder = DEFAULT_DICTIONARY.toolbar.codeBlock.captionPlaceholder;
const inputLabel = DEFAULT_DICTIONARY.toolbar.codeBlock.captionAriaLabel;

const renderCaptions = (
  options: Omit<MountBlockEditorOptions, "children"> = {},
) => mountBlockEditor({ ...options, children: <CodeBlockCaptions /> });

const captionInput = (): HTMLInputElement =>
  screen.getByRole<HTMLInputElement>("textbox", { name: inputLabel });

describe("caption 오버레이 위치(좌상단, Issue #196 완료 조건 1)", () => {
  it("오버레이 top이 코드블록의 상단(rect.top)이다(이전: 하단 rect.bottom)", () => {
    // Issue #195 게이트(완료 조건 1)로 caption이 빈 값+비편집이면 오버레이가
    // 아예 렌더되지 않는다 — 위치 계산 자체를 검증하려면 오버레이가 있어야
    // 하므로 caption 값을 채워 완료 조건 2 경로(비어있지 않으면 표시)를 탄다.
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
    // mountBlockEditor의 restubGeometry()는 render() 완료 뒤에 rect를
    // 스텁한다 — 위 "두 오버레이가 서로 다른 top 위치" 테스트와 같은 이유로
    // resize 이벤트를 한 번 더 쏴 스텁된 rect를 반영한다.
    fireEvent(window, new Event("resize"));

    // DEFAULT_BLOCK_LAYOUT(mount-editor.tsx)의 첫 블록은 top=0/height=20 —
    // rect.top=0, rect.bottom=20. 좌상단이면 "0px", 하단이었다면 "20px".
    const overlay = document.querySelector<HTMLElement>(
      ".geul-code-block-caption",
    );
    expect(overlay?.style.top).toBe("0px");
  });

  it("오버레이가 transform: translateY(calc(-100% - 0.5rem))로 코드블록 바깥 위쪽에 gap을 두고 붙어 코드 첫 줄과 겹치지 않는다(단계-3 리뷰 BLOCKER, 2026-09-17 gap 추가)", () => {
    // top: rect.top 그대로면 <pre>의 padding-top 아래에서 시작하는 코드
    // 첫 줄과 z-index: 5인 caption이 겹친다(실측: <pre> padding-top 0.75rem
    // vs caption 높이 약 26.4px). 자기 높이만큼 위로 밀어 올려야 이전
    // 하단 배치(top: rect.bottom, gap 없이 접함)와 대칭으로 겹치지 않는다.
    // 추가 -0.5rem은 caption과 코드블록 사이 시각적 gap이다(2026-09-17
    // 사용자 보고 — 최초 구현은 gap이 없어 캡션과 코드가 거의 붙어 보였다).
    // Issue #195 게이트(완료 조건 1) 때문에 caption 값을 채워 오버레이를
    // 표시시킨다(위 top 테스트와 같은 이유).
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
    fireEvent(window, new Event("resize"));

    const overlay = document.querySelector<HTMLElement>(
      ".geul-code-block-caption",
    );
    expect(overlay?.style.transform).toBe("translateY(calc(-100% - 0.5rem))");
  });
});

describe("codeBlock이 없으면 오버레이가 렌더되지 않는다(완료 조건 5)", () => {
  it("문단만 있는 문서에는 caption 오버레이가 없다", () => {
    renderCaptions();

    expect(screen.queryByRole("button", { name: placeholder })).toBeNull();
    expect(document.querySelector(".geul-code-block-caption")).toBeNull();
  });
});

describe("빈 caption 비편집 상태는 오버레이를 렌더하지 않는다(완료 조건 1, 구 완료 조건 6 재작성 — Issue #195)", () => {
  it.each([undefined, ""])(
    "caption이 %s이고 편집 중이 아니면 .geul-code-block-caption과 placeholder 버튼이 DOM에 없다",
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

      expect(screen.queryByRole("button", { name: placeholder })).toBeNull();
      expect(document.querySelector(".geul-code-block-caption")).toBeNull();
    },
  );
});

describe("편집 중이면 빈 caption이어도 오버레이가 표시된다(완료 조건 3, Issue #195)", () => {
  it("caption이 빈 값인 codeBlock을 setCodeBlockCaptionEditing으로 직접 편집 상태로 만들면 input이 뜬다", () => {
    // #196의 toolbar 버튼·more 메뉴는 이 store의 setter를 호출해 편집을
    // 연다 — 여기서도 toolbar를 거치지 않고 store를 직접 호출해 같은
    // 경로를 시뮬레이션한다(code-block-language-combobox.test.tsx와 달리
    // 이 파일은 toolbar를 마운트하지 않는다).
    renderCaptions({
      initialBlocks: [
        { id: "code-1", type: "codeBlock", content: [{ text: "a" }] },
      ],
    });

    // 편집 중이 아니므로 아직 오버레이가 없다(완료 조건 1과 같은 전제).
    expect(document.querySelector(".geul-code-block-caption")).toBeNull();

    act(() => {
      setCodeBlockCaptionEditing({ blockId: "code-1", draft: "" });
    });

    const input = captionInput();
    expect(input).toBeTruthy();
    expect(input.value).toBe("");
    // 버튼이 더는 렌더되지 않아(완료 조건 1) placeholder "caption" 문구를
    // 보여줄 곳이 없어졌다 — input의 HTML placeholder attribute가 그
    // 역할을 대신한다(draft가 빈 문자열일 때만 브라우저가 표시).
    expect(input.placeholder).toBe(placeholder);
  });
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

    // caption이 빈 값이라 Issue #195 게이트로 placeholder 버튼 자체가 없다
    // (완료 조건 1) — #196의 toolbar·more 메뉴와 같은 경로(store setter
    // 직접 호출)로 편집을 연다.
    act(() => {
      setCodeBlockCaptionEditing({ blockId: "code-1", draft: "" });
    });
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

    // 위 Enter 커밋 테스트와 같은 이유로 store setter로 편집을 연다.
    act(() => {
      setCodeBlockCaptionEditing({ blockId: "code-1", draft: "" });
    });
    fireEvent.change(captionInput(), { target: { value: "blur 커밋" } });
    fireEvent.blur(captionInput());

    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "blur 커밋",
    });
    expect(screen.getByRole("button", { name: "blur 커밋" })).toBeTruthy();
  });
});

describe("Escape 취소(완료 조건 9)", () => {
  it("Escape 후 blur가 이어져도 커밋하지 않고 포커스가 편집기로 복원된다", () => {
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
    expect(document.activeElement).toBe(rendered.editable);
  });
});

describe("IME 조합 중 keydown(Issue #232)", () => {
  // 조합을 확정하는 Enter와 조합을 취소하는 Escape는 캡션 입력의 키가
  // 아니다. handleMenuKeyDown이 조합 중 키를 처리하지 않고 preventDefault도
  // 하지 않는다(link-toolbar.test.tsx의 Issue #230 테스트와 같은 모양).
  const setup = () => {
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
    fireEvent.change(captionInput(), { target: { value: "조합 중 값" } });
    return { changes, rendered };
  };

  it("조합 중 Enter는 캡션을 확정하지 않고 preventDefault하지 않는다", () => {
    const { changes, rendered } = setup();

    const notPrevented = fireEvent.keyDown(captionInput(), {
      key: "Enter",
      isComposing: true,
    });

    expect(notPrevented).toBe(true);
    expect(captionInput().value).toBe("조합 중 값");
    expect(changes).toEqual([]);
    expect(rendered.editor.getDocument().blocks[0]).toMatchObject({
      caption: "원래 값",
    });
  });

  it("조합 중 Escape는 편집을 취소하지 않고 preventDefault하지 않는다", () => {
    const { changes } = setup();

    const notPrevented = fireEvent.keyDown(captionInput(), {
      key: "Escape",
      isComposing: true,
    });

    expect(notPrevented).toBe(true);
    expect(captionInput().value).toBe("조합 중 값");
    expect(changes).toEqual([]);
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
    // Issue #195 게이트(완료 조건 1)로 caption이 빈 값+비편집이면 오버레이가
    // 렌더되지 않는다 — 위치 계산 자체를 검증하려면 두 오버레이 모두
    // 있어야 하므로 caption 값을 채운다(위 "각 codeBlock마다 독립된
    // 오버레이" 테스트와 같은 fixture).
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

describe("스크롤 컨테이너 clip", () => {
  // 에디터 host를 overflow 컨테이너로 보고 y 0~100만 보이게 한다. 캡션은
  // 컨테이너 바깥에 그려져 컨테이너가 잘라내지 못하므로, 오버레이 자신의
  // 박스가 그 영역 안에 완전히 들어올 때만 보이게 한다(블록이 일부만 보여도
  // 블록 위쪽에 붙는 캡션은 경계 밖에 걸칠 수 있다). 숨김은 unmount가 아니라
  // visibility다.
  const twoCodeBlocks = [0, 1].map((index) => ({
    id: `code-${index + 1}`,
    type: "codeBlock" as const,
    content: [{ text: "a" }],
    caption: `설명 ${index + 1}`,
  }));

  const setup = () => {
    const { host } = renderCaptions({ initialBlocks: twoCodeBlocks });
    host.style.overflowY = "auto";
    stubRect(host, { left: 0, top: 0, width: 600, height: 100 });
    const overlays = Array.from(
      document.querySelectorAll<HTMLElement>(".geul-code-block-caption"),
    );
    return { host, first: overlays[0]!, second: overlays[1]! };
  };

  it("오버레이 박스가 영역 안이면 보이고 밖이면 숨긴다", () => {
    const { host, first, second } = setup();
    stubRect(first, { left: 0, top: 10, width: 600, height: 24 });
    stubRect(second, { left: 0, top: 300, width: 600, height: 24 });
    fireEvent.scroll(host);

    expect(first.style.visibility).toBe("");
    expect(second.style.visibility).toBe("hidden");
  });

  it("경계에 걸쳐 일부만 보이는 캡션도 숨긴다", () => {
    const { host, first, second } = setup();
    stubRect(first, { left: 0, top: -10, width: 600, height: 24 });
    stubRect(second, { left: 0, top: 90, width: 600, height: 24 });
    fireEvent.scroll(host);

    expect(first.style.visibility).toBe("hidden");
    expect(second.style.visibility).toBe("hidden");
  });

  it("스크롤해서 영역 안으로 들어오면 다시 보인다", () => {
    const { host, first, second } = setup();
    stubRect(first, { left: 0, top: -50, width: 600, height: 24 });
    stubRect(second, { left: 0, top: 10, width: 600, height: 24 });
    fireEvent.scroll(host);

    expect(first.style.visibility).toBe("hidden");
    expect(second.style.visibility).toBe("");
  });

  it("편집 중인 캡션은 영역 밖이어도 숨기지 않는다(입력 포커스를 잃지 않는다)", () => {
    const { host, second } = setup();
    stubRect(second, { left: 0, top: 300, width: 600, height: 24 });
    act(() => setCodeBlockCaptionEditing({ blockId: "code-2", draft: "초안" }));
    fireEvent.scroll(host);

    expect(second.style.visibility).toBe("");
    expect(captionInput().value).toBe("초안");
  });
});

describe("접힌 toggle이 가린 codeBlock의 caption(Issue #288)", () => {
  // 접힘은 자식을 display:none으로 가려 rect가 0x0이다. 이 rect로 오버레이를
  // 그리면 뷰포트 구석에 visible로 남는다. 표식(data-geul-collapsed-hidden)으로
  // 판정한다.
  const codeBlock = {
    id: "code-1",
    type: "codeBlock" as const,
    content: [{ text: "a" }],
    caption: "설명",
  };
  const captionOverlays = () =>
    document.querySelectorAll(".geul-code-block-caption");

  it("접힌 toggle 안 codeBlock의 caption 오버레이를 렌더하지 않는다", () => {
    const { host } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, true),
    });
    fireEvent(window, new Event("resize"));

    expect(host.querySelector("[data-geul-collapsed-hidden]")).not.toBeNull();
    expect(captionOverlays()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "설명" })).toBeNull();
  });

  it("대조: 펼친 toggle 안 codeBlock의 caption 오버레이는 렌더한다", () => {
    const { host } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    fireEvent(window, new Event("resize"));

    expect(host.querySelector("[data-geul-collapsed-hidden]")).toBeNull();
    expect(captionOverlays()).toHaveLength(1);
  });

  it("호스트 API로 접으면 DOM 이벤트 없이 사라지고, 펼치면 다시 나타난다", () => {
    const { editor, host } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    expect(captionOverlays()).toHaveLength(1);

    toggleCollapseByHostApi(editor);
    expect(host.querySelector("[data-geul-collapsed-hidden]")).not.toBeNull();
    expect(captionOverlays()).toHaveLength(0);

    toggleCollapseByHostApi(editor);
    expect(host.querySelector("[data-geul-collapsed-hidden]")).toBeNull();
    expect(captionOverlays()).toHaveLength(1);
  });

  it("deleteBlock으로 지운 codeBlock의 caption 오버레이가 DOM 이벤트 없이 사라진다", () => {
    const { editor } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    expect(captionOverlays()).toHaveLength(1);

    act(() => {
      editor.commands.deleteBlock("code-1");
    });

    expect(captionOverlays()).toHaveLength(0);
  });

  it("편집 중인 codeBlock이 접히면 편집 store를 비우고 caption을 커밋하지 않으며 펼쳐도 되살아나지 않는다", () => {
    const { editor } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    act(() => setCodeBlockCaptionEditing({ blockId: "code-1", draft: "초안" }));
    expect(captionInput().value).toBe("초안");

    toggleCollapseByHostApi(editor);

    expect(getCodeBlockCaptionEditingSnapshot()).toBeNull();
    expect(screen.queryByRole("textbox", { name: inputLabel })).toBeNull();
    toggleCollapseByHostApi(editor);
    expect(screen.queryByRole("textbox", { name: inputLabel })).toBeNull();
    expect(screen.getByRole("button", { name: "설명" })).toBeTruthy();
    expect(editor.getBlock("code-1")).toMatchObject({ caption: "설명" });
  });

  it("편집 중인 codeBlock을 deleteBlock으로 지우면 편집 store를 비운다", () => {
    const { editor } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    act(() => setCodeBlockCaptionEditing({ blockId: "code-1", draft: "초안" }));

    act(() => {
      editor.commands.deleteBlock("code-1");
    });

    expect(getCodeBlockCaptionEditingSnapshot()).toBeNull();
    expect(screen.queryByRole("textbox", { name: inputLabel })).toBeNull();
  });

  it("대조: 보이는 codeBlock을 편집 중일 때 다른 블록 변경은 편집을 지우지 않는다", () => {
    const { editor } = renderCaptions({
      initialBlocks: toggleWithChild(codeBlock, false),
    });
    act(() => setCodeBlockCaptionEditing({ blockId: "code-1", draft: "초안" }));

    act(() => {
      editor.commands.setText("p1", "다른 블록 변경");
    });

    expect(getCodeBlockCaptionEditingSnapshot()).toEqual({
      blockId: "code-1",
      draft: "초안",
    });
    expect(captionInput().value).toBe("초안");
  });
});
