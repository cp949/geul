/**
 * StaticToolbar 테스트가 공유하는 fake EditorController를 제공한다.
 * `formatting-toolbar-test-support.tsx`의 `fakeController`에 `subscribe`를
 * 얹는다. 기존 fake는 FormattingToolbar가 소유하므로 고치지 않는다.
 * 접힌 캐럿 명령 3개의 mock도 여기서 더한다.
 * 실제 편집기에 StaticToolbar를 올리는 `mountToolbarWithEditor`도 둔다.
 */
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { StaticToolbar } from "../src/index.js";
import { fakeController } from "./formatting-toolbar-test-support.js";
import { mountBlockEditor, placeCaret } from "./mount-editor.js";

// 캐럿 명령 mock이 성공과 거절 양쪽을 받도록 반환 타입을 미리 넓혀 둔다.
// 좁게 추론되면 테스트가 다른 결과를 `mockReturnValue`로 넘길 때 타입 에러가 난다.
type CaretCommandResult =
  | { ok: true; value: undefined }
  | { ok: false; error: { code: string; command?: string } };

/**
 * `subscribe`를 가진 fake controller를 만든다. 인자는 `fakeController`와 같다.
 *
 * 실제 편집기는 상태가 바뀔 때 listener를 부른다. fake는 그 시점을 테스트가
 * 정하도록 `emit()`을 노출한다 — `emit()`을 부르기 전에 조회 mock의 반환값을
 * 바꿔 두면 "상태가 바뀐 뒤 통지"를 재현한다.
 *
 * 캐럿 명령 mock의 기본 반환은 `COMMAND_NOT_APPLICABLE`이다. 범위 선택에서
 * 툴바가 기존 선택 영역 명령으로 넘어가는 경로가 기본값이라, 캐럿을 다루지
 * 않는 테스트는 기존 명령 호출을 그대로 본다. 캐럿 성공이 필요한 테스트는
 * `mockReturnValue`로 바꾼다.
 *
 * - `listenerCount()`: 현재 등록된 listener 수. 해제 단언에 쓴다.
 * - `emit()`: 등록된 listener를 모두 부른다. React 갱신을 `act`로 감싼다.
 */
export const fakeStaticToolbarController = (
  ...args: Parameters<typeof fakeController>
) => {
  const controller = fakeController(...args);
  const listeners = new Set<() => void>();
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const notApplicable = (): CaretCommandResult => ({
    ok: false,
    error: { code: "COMMAND_NOT_APPLICABLE", command: "caret" },
  });
  const commands = Object.assign(controller.commands, {
    toggleCaretMark:
      vi.fn<(argument?: unknown) => CaretCommandResult>(notApplicable),
    toggleCaretTextColor:
      vi.fn<(argument?: unknown) => CaretCommandResult>(notApplicable),
    toggleCaretBackgroundColor:
      vi.fn<(argument?: unknown) => CaretCommandResult>(notApplicable),
  });
  return Object.assign(controller, {
    commands,
    subscribe,
    listenerCount: () => listeners.size,
    emit: () => {
      act(() => {
        for (const listener of Array.from(listeners)) listener();
      });
    },
  });
};

/**
 * 실제 편집기와 StaticToolbar를 마운트하고 첫 문단에 캐럿을 놓는다.
 * 편집 영역에 포커스를 둔 채로 돌려준다. 포커스가 처음부터 편집기에 있으면
 * "편집기로 되돌렸다"는 단언이 공허해지므로 호출부가 포커스를 메뉴로 옮긴
 * 뒤 단언한다. 블록 타입 메뉴와 색상 메뉴 테스트가 공유한다.
 */
export const mountToolbarWithEditor = () => {
  const mounted = mountBlockEditor({
    blockIds: ["block-1"],
    children: <StaticToolbar />,
  });
  const paragraph = mounted.blocks[0]?.querySelector("p") ?? mounted.blocks[0];
  if (paragraph === undefined) throw new Error("문단을 찾지 못했다");
  placeCaret(paragraph);
  return mounted;
};
