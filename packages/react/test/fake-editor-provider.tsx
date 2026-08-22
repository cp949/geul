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
 * 경우, 빈 객체, `commands` 누락, `commands`가 원시값, `destroy` 누락을 전부
 * 타입 에러로 잡는다(실측 확인).
 *
 * 대신 파일마다 그 파일 fake의 정확한 표면을 요구하던 형태
 * (`ReturnType<typeof fakeController>`)보다는 헐겁다. 그 형태가 거절하던 세
 * 가지를 이제 통과시킨다(실측: 두 형태를 나란히 두고 tsc로 확인).
 *
 * - `commands`가 빈 객체인 fake
 * - 선택 조회 API(`getSelectionMarks` 등)가 하나도 없는 fake
 * - `getDocument`/`replaceDocument`가 없는 fake. 저장소의 `fakeController`
 *   다섯이 전부 그 둘을 갖는데도 아래 타입은 요구하지 않는다 — 타입에 더하면
 *   계약 테스트 2건이 `TS2739`로 지고 호출부는 한 곳도 깨지지 않는다(실측).
 *
 * 넓힘이 호출부 전체에 순약화인 것은 아니다. 26곳 중 20곳이 위 형태를 쓰던
 * 네 파일에 있어 약해졌고, 나머지 6곳은 이중 캐스트를 호출부마다 인라인으로
 * 써서 타입 검사가 아예 없었다(실측) — 그 6곳은 이번에 강해졌다.
 *
 * 넓힘이 실제로 만든 위험은 파일 간 유출이 아니다. 다섯 `fakeController`
 * 팩토리가 전부 파일 지역 `const`이고 어느 것도 export하지 않아(실측) 그
 * 경로는 이전 형태에서도 없었다. 잃은 것은 컴파일 에러가 런타임 에러로
 * 옮겨간 것이다 — 표면이 모자란 fake
 * (`{mount, unmount, destroy, commands: {}}`)에 `<FormattingToolbar />`를
 * 물리면 아래 타입은 통과하고(실측: typecheck exit 0) 렌더 중
 * `formatting-toolbar.tsx`가 부르는 `editor.getSelectionMarks()`에서
 * `TypeError: editor.getSelectionMarks is not a function`으로 죽는다(실측).
 * 이전 형태는 같은 fake를 `TS2739`로 거절했다(실측).
 *
 * 잃은 검사를 단일 공용 타입으로 되살릴 수는 없다. 선택 조회 API를 필수로
 * 요구하면 그것을 쓰지 않는 호출부 3곳이 `TS2741`로 깨진다(실측).
 *
 * 실제 컨트롤러를 마운트하는 레인은 이 헬퍼를 쓰지 않는다 — `mount-editor.tsx`가
 * provider 조립까지 함께 한다.
 */

import type { EditorController } from "@cp949/geul-core";
import type { ReactNode } from "react";

import { EditorProvider } from "../src/index.js";

/**
 * 오용을 잡는 데 필요한 최소 형태다. 기준이 "이 헬퍼가 읽는 표면"이 아닌 것은
 * 이 헬퍼가 컨트롤러를 하나도 읽지 않고 캐스트만 하기 때문이다 — "읽는 표면만
 * 요구한다"를 문자 그대로 적용하면 답이 `unknown`이 되고, `unknown`은 오용을
 * 하나도 잡지 못한다(위 실측).
 *
 * `commands`가 `object`인 것은 그 안을 아무도 읽지 않기 때문이다 — 존재하는지와
 * 원시값이 아닌지만 본다. `Record<string, unknown>`으로 바꿔도 지금 트리는
 * 에러 0건이다(실측) — 저장소의 fake가 전부 객체 리터럴이라 둘의 차이가
 * 드러나지 않는다. 차이는 합성 사례에서만 보인다: interface로 선언된 타입은
 * 인덱스 시그니처가 없어 `Record<string, unknown>`이 `TS2322`로 거절하고
 * `object`는 통과시킨다(실측). 거절할 이유가 없는 것은 거절하지 않는다.
 *
 * 네 필드는 전부 오용 감지용 형태이지 provider가 부르는 표면이 아니다.
 * `EditorProvider`는 external 컨트롤러의 어떤 메서드도 부르지 않는다 —
 * `editor` prop을 그대로 컨텍스트에 실을 뿐이고, `destroy`는 자기가 만든 내부
 * 컨트롤러에만 부른다. `mount`/`unmount`의 호출자는 `packages/react/src/`
 * 전체에서 `editor-content.tsx` 하나뿐이라(실측), children에
 * `<EditorContent />`가 없는 호출부에서는 넷 중 아무것도 불리지 않는다.
 */
export type FakeEditorController = {
  mount: (element: HTMLElement) => void;
  unmount: () => void;
  destroy: () => void;
  commands: object;
};

/**
 * fake 컨트롤러를 `editor` prop에 실은 `EditorProvider` 요소를 만든다.
 * 컨트롤러는 읽지도 검사하지도 않고 그대로 넘긴다 — 오용 검출은 전적으로 위
 * 파라미터 타입이 하고, 런타임은 무엇을 넘겨도 정상으로 보인다.
 */
export const withProvider = (
  controller: FakeEditorController,
  children: ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);
