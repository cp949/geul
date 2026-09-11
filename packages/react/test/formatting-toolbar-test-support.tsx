/**
 * FormattingToolbar 테스트가 공유하는 최소 EditorController fake를 제공한다.
 */
import {
  DEFAULT_DICTIONARY,
  type BlockTypeDescriptor,
  type Dictionary,
  type MediaBlockKind,
} from "@cp949/geul-core";
import { vi, type Mock } from "vitest";

type SelectionBlockType = {
  blockId: string;
  blockType: BlockTypeDescriptor;
} | null;

// media-toolbar.test.tsx의 SelectionMediaBlock과 같은 shape — 이 파일은
// 기본값(null, "미디어 선택 아님")만 쓰고 media 선택 테스트는 개별
// override로 이 shape을 채운다.
type SelectionMediaBlock = {
  blockId: string;
  kind: MediaBlockKind;
  url: string | null;
  name: string | null;
  caption: string | null;
  showPreview: boolean | null;
  textAlignment: "left" | "center" | "right" | null;
} | null;

// indentBlock/outdentBlock의 Result 반환 타입을 성공/실패 양쪽 다 받도록
// 미리 넓혀 둔다 — 실패 케이스 테스트가 기본값과 다른 모양의 vi.fn을 넘겨도
// 대입 타입 에러(TS2322)가 나지 않는다.
type CommandResult =
  | { ok: true; value: undefined }
  | { ok: false; error: { code: string; command: string } };

export type BlockNestingActionState = {
  canIndent: boolean;
  canOutdent: boolean;
};

type FormattingToolbarFakeController = {
  mount: Mock;
  unmount: Mock;
  destroy: Mock;
  getDocument: Mock;
  getSelectionMarks: Mock;
  getSelectionBlockType: Mock;
  getSelectionMediaBlock: Mock;
  isCellRangeSelected: Mock;
  getBlockNestingActionState: Mock;
  getDictionary: Mock;
  replaceDocument: Mock;
  commands: {
    setText: Mock;
    setBlockType: Mock;
    indentBlock: Mock;
    outdentBlock: Mock;
    toggleBold: Mock;
    toggleItalic: Mock;
    toggleUnderline: Mock;
    toggleStrike: Mock;
    toggleCode: Mock;
    toggleInlineTextColor: Mock;
    toggleInlineBackgroundColor: Mock;
    undo: Mock;
    redo: Mock;
  };
};

/**
 * FormattingToolbar가 읽는 최소 controller 표면을 만든다.
 * 각 테스트는 query와 command override만 주입해 버튼 상태 변화를 격리한다.
 */
export const fakeController = (
  getSelectionMarks: Mock = vi.fn(() => [] as string[]),
  getSelectionBlockType: Mock = vi.fn((): SelectionBlockType => ({
    blockId: "block-1",
    blockType: { type: "paragraph" },
  })),
  setBlockType: Mock = vi.fn((...args: [string, BlockTypeDescriptor]) => {
    void args;
    return { ok: true as const, value: undefined };
  }),
  indentBlock: Mock = vi.fn((): CommandResult => ({
    ok: true,
    value: undefined,
  })),
  outdentBlock: Mock = vi.fn((): CommandResult => ({
    ok: true,
    value: undefined,
  })),
  getBlockNestingActionState: Mock = vi.fn((): BlockNestingActionState => ({
    canIndent: true,
    canOutdent: true,
  })),
  // spec §8(EXT-009), RD-002-DELTA-02 — dictionary override 테스트 전용.
  // 미지정이면 기본값(en)을 그대로 반환한다.
  getDictionary: Mock = vi.fn((): Dictionary => DEFAULT_DICTIONARY),
  // 미디어 블록(image/video/audio/file) 선택 게이트 테스트 전용 — 기본값
  // null(미디어 선택 아님)이면 기존 텍스트 선택 테스트 전부가 그대로
  // 통과한다.
  getSelectionMediaBlock: Mock = vi.fn((): SelectionMediaBlock => null),
  // 표 CellSelection 게이트 테스트 전용 — 기본값 false(CellSelection
  // 아님)면 기존 텍스트 선택 테스트 전부가 그대로 통과한다(위
  // getSelectionMediaBlock과 같은 결).
  isCellRangeSelected: Mock = vi.fn((): boolean => false),
): FormattingToolbarFakeController => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    // 실제 브라우저와 달리 jsdom은 contentEditable IDL 프로퍼티를
    // contenteditable 속성으로 반영하지 않는다. formatting-toolbar.tsx에는
    // 이 속성을 읽는 초점 복구 경로가 없지만, 실제 브라우저 DOM 동작과 fake를
    // 맞추기 위해 속성을 직접 세운다.
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "editor text";
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks,
  getSelectionBlockType,
  getSelectionMediaBlock,
  isCellRangeSelected,
  getBlockNestingActionState,
  getDictionary,
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    setBlockType,
    indentBlock,
    outdentBlock,
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    toggleInlineTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    toggleInlineBackgroundColor: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});
