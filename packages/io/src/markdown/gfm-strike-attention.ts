import type { Options } from "remark-stringify";

// strike(`delete`) 직렬화 핸들러다. 라이브러리 핸들러에 `attention`만 더했다.
//
// 라이브러리에 attention이 없는 이유:
// - mdast-util-gfm-strikethrough는 `delete`에 `attention`을 선언하지 않는다.
// - strong·emphasis는 선언한다. containerPhrasing이 `encodeInfo`로 공백과 이웃 글자를
//   문자 참조로 바꾼다.
// - `delete`는 이 처리를 받지 못한다. flanking에 어긋난 `~~`가 나간다.
// - 예: `a~~ b~~`, `x~~,a~~y`, `가~~(a)~~`. 재가져오기에서 `~~`가 글자로 샌다.
//
// 본문 출처: mdast-util-gfm-strikethrough@2.0.0 `handleDelete`와 `peekDelete`.
// io의 직접 의존이 아니라 import하지 않고 옮겼다.
// `state.enter("strikethrough")`와 `exit()`는 옮기지 않았다.
//
// 실행 경로(mdast-util-to-markdown 2.2.0에서 계측):
// - `attention`이 있는 노드는 `containerPhrasing`이 직접 처리한다.
// - 이때 라이브러리가 구문 스택에 `delete`를 등록한다.
// - 핸들러 본문은 호출되지 않는다. `peek`만 호출된다.
// - 본문은 `attention`을 모르는 2.1.2에서만 실행된다.
//
// 구문 스택 등록을 옮기지 않은 이유:
// - `ConstructName`에 `"strikethrough"`가 io 타입 그래프에 없다. TS2345가 난다.
// - `declare module` 보강도 TS2664로 불가능하다.
// - 현재 라이브러리 코드에서 이 구문 이름을 읽는 곳이 없다.
// - 본문이 2.2.0에서 실행되지 않으므로 출력에도 영향이 없다.
//
// 라이브러리 업그레이드 시 확인할 것:
// - 새 버전의 `delete` 핸들러가 `attention`을 선언하면 이 파일을 지운다.
// - 본문이 바뀌었으면 이 복사본을 맞춘다.
// - `"strikethrough"` 구문 이름을 읽는 소비자가 생겼는지 본다.
// - `markdown-strike-flanking.test.ts`가 통과하는지 본다.
//
// 연결: remark-stringify의 `handlers`는 확장 핸들러보다 뒤에 적용된다.
// `use` 순서와 무관하게 이 핸들러가 라이브러리 것을 덮어쓴다.

type Handle = NonNullable<NonNullable<Options["handlers"]>["delete"]>;

/**
 * strike를 `~~...~~`로 직렬화한다. 안쪽 phrasing은 attention 규칙으로 쓴다.
 */
const handleDelete = (
  node: Parameters<Handle>[0],
  _parent: Parameters<Handle>[1],
  state: Parameters<Handle>[2],
  info: Parameters<Handle>[3],
): string => {
  const tracker = state.createTracker(info);
  let value = tracker.move("~~");
  value += state.containerPhrasing(node, {
    ...tracker.current(),
    before: value,
    after: "~",
  });
  value += tracker.move("~~");
  return value;
};

handleDelete.peek = (): string => "~";

handleDelete.attention = (): {
  construct: "delete";
  markers: string[];
  sizes: number[];
} => ({ construct: "delete", markers: ["~"], sizes: [2] });

export { handleDelete };
