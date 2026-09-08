// spec(docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md) §3 —
// 코드 블록 구문 강조 seam의 공개 계약. geul 자신은 어떤 구문 강조
// 라이브러리도 소유하지 않는다 — 소비자가 이 타입에 맞춘 함수를
// CreateEditorOptions.syntaxHighlighter로 연결한다. ProseMirror
// `Decoration`이나 내부 배관(`prosemirror-highlight`)의 타입을 여기서
// 참조하지 않는다(ADR-0002 — 공개 API에 PM/Tiptap 타입 비노출).
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
