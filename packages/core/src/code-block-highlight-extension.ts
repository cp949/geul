import { Extension } from "@tiptap/core";
import { Decoration } from "@tiptap/pm/view";
import { createHighlightPlugin, type Parser } from "prosemirror-highlight";

import type {
  SyntaxHighlighter,
  SyntaxHighlightToken,
} from "./syntax-highlight.js";

// RD-001-DELTA-01/02(spec §3·§4). 범위 밖·겹침·거절된 Promise 시
// console.warn·미지원 language 등 나머지 edge case(spec §4)는 DELTA-03이
// 다룬다.
const toDecorations = (
  tokens: readonly SyntaxHighlightToken[],
  contentStart: number,
): Decoration[] =>
  tokens.map((token) =>
    Decoration.inline(
      contentStart + token.from,
      contentStart + token.to,
      token.className === undefined ? {} : { class: token.className },
    ),
  );

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
      return toDecorations(cached.decorations, pos + 1);
    }
    if (cached?.status === "pending") return cached.promise;

    const result = highlighter({ source: content, language });
    if (!(result instanceof Promise)) return toDecorations(result, pos + 1);

    // prosemirror-highlight 자신의 pos 캐시가 동기 결과를 이미 저장하므로
    // (calculateDecoration의 cache.set(pos, ...)) 동기 분기는 여기서
    // 별도로 캐시하지 않는다 — 재시도(refresh) 계약을 지켜야 하는
    // Promise 분기만 이 어댑터 캐시가 책임진다.
    const pending: Promise<void> = result.then(
      (tokens) => {
        cache.set(key, { status: "resolved", decorations: tokens });
      },
      () => {
        // DELTA-03이 console.warn·"이전 decoration 유지"를 다룬다. 지금은
        // 재시도를 막지 않도록 항목만 지운다.
        cache.delete(key);
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
