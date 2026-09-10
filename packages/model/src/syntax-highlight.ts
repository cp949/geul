// spec(docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md) §3 —
// 코드 블록 구문 강조 seam의 공개 계약. geul 자신은 어떤 구문 강조
// 라이브러리도 소유하지 않는다 — 소비자가 이 타입에 맞춘 함수를
// CreateEditorOptions.syntaxHighlighter로 연결한다. ProseMirror
// `Decoration`이나 내부 배관(`prosemirror-highlight`)의 타입을 여기서
// 참조하지 않는다(ADR-0002 — 공개 API에 PM/Tiptap 타입 비노출).
//
// 정의 위치는 원래 packages/core였다 — Issue #172(spec §2·§10)로 이곳
// model로 옮겼다. packages/io가 core에 의존하지 않는 layering(ADR-0002)에서
// io의 exportHtml도 이 계약을 참조해야 했기 때문이다. packages/core의
// index.ts는 이 타입을 계속 re-export한다(ADR-0002 §7의 model→core
// re-export 선례와 동일 패턴) — shape·계약은 이동 전후로 변경되지 않는다.
export type SyntaxHighlightToken = {
  /** source 문자열 안 시작 오프셋(0-indexed, code unit 기준). */
  from: number;
  /** source 문자열 안 끝 오프셋(exclusive). */
  to: number;
  /**
   * 적용할 CSS class. 색상 자체는 geul이 소유하지 않는다 — 이 class를
   * 정의하는 스타일시트는 소비자(또는 소비자가 고른 하이라이터의 테마)가
   * 공급한다.
   */
  className?: string;
};

export type SyntaxHighlighter = (input: {
  source: string;
  language: string | undefined;
}) =>
  readonly SyntaxHighlightToken[] | Promise<readonly SyntaxHighlightToken[]>;
