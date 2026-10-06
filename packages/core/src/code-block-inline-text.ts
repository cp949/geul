import { Fragment } from "@tiptap/pm/model";
import type { Mark, Node, Schema } from "@tiptap/pm/model";

// inline 콘텐츠와 CodeBlock source 텍스트 사이의 변환을 소유하는 leaf 모듈.
// 병합(block-join-extension.ts), CodeBlock 종료(code-block-exit-extension.ts),
// 종류 변경(generic-block-type-commands.ts)이 같은 규칙을 쓰게 한다(Issue #226).

/**
 * CodeBlock source로 평탄화할 때 leaf 노드가 내는 텍스트다.
 * hardBreak는 개행이고 그 외 leaf는 텍스트 표현이 없어 빈 문자열이다.
 * `textBetween`의 leafText 인자로 쓴다.
 */
export function codeSourceLeafText(leaf: Node): string {
  return leaf.type.name === "hardBreak" ? "\n" : "";
}

// 다음 블록의 inline 콘텐츠를 CodeBlock이 받을 수 있는 순수 텍스트로
// 평탄화한다(#202 스펙 표 행3, RD-001-DELTA-02 — mergeCodeBlockIntoText의
// 반대 방향). CodeBlock은 marks: ""라(code-block-extension.ts) 모든 mark를
// 잃고, hardBreak(inline 그룹, CodeBlock의 content: "text*"에 담길 수 없는
// 노드)는 model-to-tiptap.ts의 "\n"↔hardBreak 관례를 역으로 적용해 리터럴
// "\n" 문자로 치환한다. 그 외 inline 원소(예: 미등록 커스텀 inline)는
// 텍스트 표현이 없어 빈 문자열로 건너뛴다.
export function inlineToCodeSource(
  schema: Schema,
  content: Fragment,
): Fragment {
  const text = content.textBetween(0, content.size, "", codeSourceLeafText);
  return text.length > 0 ? Fragment.from(schema.text(text)) : Fragment.empty;
}

// codeBlock 텍스트 조각(리터럴 `\n` 포함 가능, marks 없음 — schema
// `marks: ""`)을 paragraph가 받는 inline 콘텐츠로 변환한다.
// paragraph content: "inline*"는 리터럴 개행을 담은 text 노드를 허용하지
// 않는다. 분할 규칙은 아래 textToHardBreakInline이 소유한다.
export function codeSourceToInline(
  schema: Schema,
  content: Fragment,
): Fragment {
  let result = Fragment.empty;
  content.forEach((child: Node) => {
    result = result.append(textToHardBreakInline(schema, child.text ?? ""));
  });
  return result;
}

// 텍스트 하나를 `\n` 경계로 나눠 그 사이에 hardBreak를 끼운 inline
// Fragment로 만든다. model-to-tiptap.ts의 inlineContentToTiptap이 저장 모델
// JSON 위에서 하는 `\n→hardBreak` 분할과 같은 규칙을 살아있는 PM 노드
// 위에서 적용한다.
// - 빈 세그먼트(연속 `\n`)는 text 노드를 만들지 않고 건너뛴다.
// - marks는 세그먼트 text와 hardBreak 모두에 붙인다. tiptap-to-model.ts가
//   같은 mark의 hardBreak를 앞뒤 런과 합쳐 export가 한 런 그대로다.
// codeSourceToInline(병합·종료·종류 변경)과 리터럴 개행 정규화
// (hard-break-newline-normalize-extension.ts, Issue #281)가 공유한다.
export function textToHardBreakInline(
  schema: Schema,
  text: string,
  marks: readonly Mark[] = [],
): Fragment {
  const hardBreakType = schema.nodes.hardBreak;
  const nodes: Node[] = [];
  const segments = text.split("\n");
  segments.forEach((segment, index) => {
    if (segment.length > 0) nodes.push(schema.text(segment, marks));
    if (index < segments.length - 1 && hardBreakType !== undefined) {
      nodes.push(hardBreakType.create(null, null, marks));
    }
  });
  return Fragment.fromArray(nodes);
}
