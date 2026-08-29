import { mergeAttributes, Node } from "@tiptap/core";

// quote는 문단 동형 계약이다(spec §4.2 — content+children, 차이는 타입과
// HTML 매핑 blockquote뿐) — paragraph/heading과 같은 blockContent 그룹·
// blockContainer 포장 패턴을 따른다(editor-controller.ts의 인라인
// HeadingExtension 전례 — 이 파일은 새 파일로 둔다). identity(blockId)는
// blockContainer가 소유하므로 quote 자체는 attrs가 없다.
//
// parseHTML을 두는 이유 — 표·divider(비포장, 자체 id)와 달리 blockContainer
// 포장 노드는 BlockIdExtension이 컨테이너에 id를 사후 배정하므로 붙여넣기로
// id 없는 노드가 생기지 않는다(heading의 hN parse 규칙과 동형). 외부
// <blockquote><p>…</p></blockquote> 붙여넣기의 의미 계약은 후속
// 슬라이스(클립보드) 소관이다. 이 규칙은 변환기(tiptap-to-model.ts)가
// quote 컨테이너를 수용하는 것을 전제한다 — 수용 전에는 PM 기본
// 붙여넣기(table-paste-extension.ts NOT_TABULAR 폴백)로 들어온 외부
// blockquote가 readEditorDocument 변환 거절로 실패한다.
//
// defining: true — heading 전례.
//
// 참조 구현 출처: BlockNote v0.54.0 packages/core/src/blocks/Quote/block.ts
// (구조만 참조, 코드 미복제).
export const QuoteExtension = Node.create({
  name: "quote",
  group: "blockContent",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: "blockquote" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes), 0];
  },
});
