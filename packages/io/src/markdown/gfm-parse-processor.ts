// importMarkdown이 쓰는 remark 파서. remark-gfm의 autolink literal mdast 변환만 끈다(Issue #423).
// - remark-gfm은 text를 쪼개 link를 만드는 `transforms`를 가진다.
//   - 대상은 이스케이프(`https\://a.com`)·NBSP·`\@`가 낀 text다.
//   - 쪼개진 text와 link는 `position`을 잃는다.
// - 위치 없는 text는 소스와 글자 단위로 맞출 수 없다.
//   - 끊어진 참조 이미지(`![a][x]`)가 같은 text에 있으면 평문으로 내려가지 않는다.
// - 가져오기는 literal link를 어차피 평문으로 되돌린다(strip-autolink-literals.ts).
//   - 변환을 끄면 글자는 그대로 text에 남는다. 위치만 지킨다.
// - micromark 토큰 단계의 literal(이스케이프 없는 맨몸 URL)은 이 변환과 무관하다.
//   - 그 link는 `position`이 있고 strip-autolink-literals.ts가 그대로 처리한다.
// - 함정: 확장 목록은 `freeze()` 뒤에만 data에 있다.
//   - remark-gfm 업그레이드로 구조가 바뀌면 비우기가 조용히 무효가 된다.
//   - 던지지 않는다. markdown-literal-transform-positions.test.ts가 위치 없는 노드 0건으로 지킨다.
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownParser = { parse: (source: string) => unknown };

const createParseProcessor = (): MarkdownParser => {
  const processor = unified().use(remarkParse).use(remarkGfm).freeze();
  const extensions = processor.data("fromMarkdownExtensions");
  for (const extension of extensions?.flat() ?? []) {
    extension.transforms = [];
  }
  return processor;
};

export const parseProcessor = createParseProcessor();
