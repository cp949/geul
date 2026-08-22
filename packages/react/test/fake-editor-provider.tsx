/**
 * fake 컨트롤러를 `EditorProvider`에 꽂는다.
 *
 * `editor` prop은 `EditorController` 전체를 요구하지만 단위 테스트의 fake는 그
 * 표면의 일부만 채운다. `Partial<EditorController>`로 좁히는 것으로는 부족하다
 * — `Partial<T>`가 재귀하지 않아 `commands`는 여전히 31개 전부를 요구하고,
 * fake가 흔히 쓰는 `vi.fn(() => [] as string[])`의 `string[]`은
 * `getSelectionMarks`의 `TextMark["type"][]`과 다르다. 실측하면 호출부가 하나도
 * 남김없이 타입 에러다(측정 시점 26곳, 에러 26건). 그래서 `as unknown as`
 * 이중 캐스트가 필요하고, 이 모듈이 그 캐스트를 단독으로 소유한다. 파라미터를
 * `EditorController`로 받으면 같은 캐스트가 호출부 전부로 흩어져 규칙의 주인이
 * 다시 여럿이 된다.
 *
 * 캐스트를 감싸는 대가로 파라미터 타입까지 헐거워지면 안 된다. 무제약 제네릭과
 * `unknown` 파라미터는 컴파일을 통과하지만 오용을 하나도 잡지 못한다(실측:
 * 에러 0건). 아래 최소 구조 타입은 팩토리를 호출하지 않고 함수 자체를 넘기는
 * 경우, 빈 객체, `commands` 누락 세 가지를 전부 타입 에러로 잡는다(실측 확인).
 *
 * 실제 컨트롤러를 마운트하는 레인은 이 헬퍼를 쓰지 않는다 — `mount-editor.tsx`가
 * provider 조립까지 함께 한다.
 */

import type { EditorController } from "@cp949/geul-core";
import type { ReactNode } from "react";

import { EditorProvider } from "../src/index.js";

/**
 * 이 헬퍼가 컨트롤러에 요구하는 최소 표면. `commands`가 `object`인 것은 이
 * 모듈이 그 안을 읽지 않기 때문이다 — 존재하는지와 원시값이 아닌지만 본다.
 * `Record<string, unknown>`도 위 세 오용을 똑같이 잡지만 interface로 선언된
 * `commands` 타입까지 거절한다(실측). 거절할 이유가 없는 것은 거절하지 않는다.
 */
export type FakeEditorController = {
  mount: (element: HTMLElement) => void;
  unmount: () => void;
  destroy: () => void;
  commands: object;
};

export const withProvider = (
  controller: FakeEditorController,
  children: ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);
