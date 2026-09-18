import { Node } from "@tiptap/core";

// callout은 quote와 같은 nestableBlockContent content node다(spec BLK-020
// §3, Issue #209 RD-002 DELTA-01). identity(blockId)는 blockContainer가
// 소유하므로 quote처럼 자체 attrs가 없지만, icon 하나만 이 노드 자체가
// 갖는다(toggleListItem.collapsed와 같은 패턴 — null=model 필드 부재
// 직대응, list-item-extension.ts 선례). parseHTML/renderHTML을 선언하지
// 않는다 — callout의 HTML 표현(data-geul-callout/data-geul-icon)은 io
// 계층(io/html) 소관이라 이 PM 노드가 DOM 태그를 결정하지 않는다
// (list-item-extension.ts의 4종 목록 항목과 동일 근거).
export const CalloutExtension = Node.create({
  name: "callout",
  group: "nestableBlockContent",
  content: "inline*",

  addAttributes() {
    return {
      icon: { default: null, rendered: false },
    };
  },
});
