import { Extension } from "@tiptap/core";
import { Decoration } from "@tiptap/pm/view";
import { createHighlightPlugin, type Parser } from "prosemirror-highlight";

import type {
  SyntaxHighlighter,
  SyntaxHighlightToken,
} from "./syntax-highlight.js";

// RD-001-DELTA-01/02/03(spec §3·§4). 겹치는 token은 별도 코드가
// 없다(spec §4 — ProseMirror가 겹치는 inline decoration을 병합·우선순위
// 없이 그대로 렌더한다). 미지원/빈 language도 별도 코드가 없다(빈
// 배열이면 이 함수가 빈 배열을 그대로 돌려준다).
const clampOffset = (value: number, sourceLength: number): number =>
  Math.min(Math.max(value, 0), sourceLength);

// spec §4 "범위 밖 token" — [0, sourceLength] 밖이거나 from > to인
// token을 유효 범위로 clamp한다. from > to는 swap(순서를 뒤집어
// 유효하게 만듦)하지 않고 zero-width로 만든다(RD-001-DELTA-03 "## 계획"의
// 설계 결정) — swap은 소비자가 의도하지 않은 새 의미(반대 방향 강조)를
// 만들어낼 수 있어, 정보를 새로 만들지 않는 zero-width가 더 보수적이다.
const toDecorations = (
  tokens: readonly SyntaxHighlightToken[],
  contentStart: number,
  sourceLength: number,
): Decoration[] =>
  tokens.map((token) => {
    const clampedFrom = clampOffset(token.from, sourceLength);
    const clampedTo = Math.max(
      clampOffset(token.to, sourceLength),
      clampedFrom,
    );
    if (clampedFrom !== token.from || clampedTo !== token.to) {
      console.warn(
        `[geul] syntaxHighlighter: token 범위(${token.from}, ${token.to})가 source 길이(${sourceLength})를 벗어나거나 from > to라 (${clampedFrom}, ${clampedTo})로 clamp되었습니다.`,
      );
    }
    return Decoration.inline(
      contentStart + clampedFrom,
      contentStart + clampedTo,
      token.className === undefined ? {} : { class: token.className },
    );
  });

// prosemirror-highlight의 Parser 계약(Decoration[] | Promise<void>, 실측
// dist/types-*.d.ts)에서 Promise는 값을 실어 나르지 않는다 — resolve는
// "다시 물어봐도 된다"는 신호일 뿐이고, 그 다음 호출이 동기 배열을
// 반환해야 실제로 렌더된다(calculateDecoration이 Promise를 받으면 자신의
// pos 캐시에 아무것도 저장하지 않고 promises 목록에 쌓았다가, 하나라도
// resolve하면 전체 코드 블록을 다시 계산시킨다 — DELTA-02 조사, 소스
// 실측). resolve된 값을 기억해 두 번째 호출에서 동기로 돌려주는 책임은
// 이 어댑터가 진다.
//
// 캐시 키는 `language + content`다(pos가 아니다) — 이것이 stale 방지의
// 핵심이다. 편집으로 content가 바뀌면 새 키로 다시 계산하므로, 바뀌기
// 전 content에 대한 오래된 Promise가 나중에 resolve해도 그 결과는 옛
// 키에만 쓰이고 현재 호출(새 content, 새 키)이 조회하지 않는다 — 코드
// 블록이 다른 편집으로 밀려 pos가 이동해도 content가 같으면 캐시가
// 그대로 유효하다는 부수 이점도 있다.
type CacheEntry =
  | { status: "pending"; promise: Promise<void> }
  | { status: "resolved"; decorations: readonly SyntaxHighlightToken[] };

const cacheKey = (language: string | undefined, content: string): string =>
  `${language ?? ""}:${content}`;

// geul의 공개 seam(SyntaxHighlighter, {source,language} 입력)을
// prosemirror-highlight의 내부 Parser 계약({content,pos,language,size}
// 입력)으로 감싼다. 소비자에게는 이 어댑터도 Parser 타입도 노출하지
// 않는다(ADR-0002). 코드 블록 텍스트 콘텐츠는 노드 시작 위치(pos) 바로
// 다음(pos + 1)부터 시작한다(ProseMirror 관례) — token의 source-상대
// 오프셋에 이 값을 더해 문서 절대 위치로 변환한다.
//
// 캐시는 이 함수 호출마다(=Tiptap Editor 인스턴스마다, replaceDocument()의
// 재구성 포함) 새로 만들어진다 — 에디터 인스턴스 간 공유하지 않는다.
const createParserFromHighlighter = (
  highlighter: SyntaxHighlighter,
): Parser => {
  const cache = new Map<string, CacheEntry>();

  return ({ content, pos, language }) => {
    const key = cacheKey(language, content);
    const cached = cache.get(key);
    if (cached?.status === "resolved") {
      return toDecorations(cached.decorations, pos + 1, content.length);
    }
    if (cached?.status === "pending") return cached.promise;

    const result = highlighter({ source: content, language });
    if (!(result instanceof Promise)) {
      return toDecorations(result, pos + 1, content.length);
    }

    // prosemirror-highlight 자신의 pos 캐시가 동기 결과를 이미 저장하므로
    // (calculateDecoration의 cache.set(pos, ...)) 동기 분기는 여기서
    // 별도로 캐시하지 않는다 — 재시도(refresh) 계약을 지켜야 하는
    // Promise 분기만 이 어댑터 캐시가 책임진다.
    const pending: Promise<void> = result.then(
      (tokens) => {
        cache.set(key, { status: "resolved", decorations: tokens });
      },
      (error: unknown) => {
        // spec §4 "거절된 Promise" — 이 시도만 실패로 처리한다. 이
        // content(키)는 "resolved, 빈 배열"로 확정해 plain text로
        // 남긴다 — cache.delete로 다시 pending 만들지 않는다. 그렇게
        // 하면 실패 → resolve(catch) → refresh → 재시도 → 실패 → ...가
        // 같은 content에 대해 무한 반복된다(실측 — 회귀 테스트 작성
        // 중 hang으로 발견). content가 바뀌면(=새 키) 여전히 새로
        // 시도한다.
        console.warn(
          "[geul] syntaxHighlighter: 비동기 강조 요청이 거절되어 이번 시도만 실패로 처리합니다.",
          error,
        );
        cache.set(key, { status: "resolved", decorations: [] });
      },
    );
    cache.set(key, { status: "pending", promise: pending });
    return pending;
  };
};

// 비공개 Tiptap 확장 — index.ts가 재수출하지 않는다.
// createHighlightPlugin의 nodeTypes 기본값(['code_block','codeBlock'])과
// languageExtractor 기본값(node => node.attrs.language)이 geul의 codeBlock
// 스키마(code-block-extension.ts)와 이미 일치해 별도 configure가 필요 없다.
export const CodeBlockHighlightExtension = Extension.create<{
  syntaxHighlighter: SyntaxHighlighter;
}>({
  name: "codeBlockHighlight",
  addProseMirrorPlugins() {
    return [
      createHighlightPlugin({
        parser: createParserFromHighlighter(this.options.syntaxHighlighter),
      }),
    ];
  },
});
