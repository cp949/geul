// 4종 미디어 블록 kind 판별 유니온 — media-commands.ts(insertMediaBlock 내부
// 구현)와 editor-controller.ts(EditorController.commands.insertMediaBlock
// 공개 시그니처)가 공유한다.
//
// 별도 파일로 분리한 이유: media-commands.ts는 Tiptap Editor 타입을 쓰는
// 내부 명령 구현이고(ADR-0002 — Tiptap/ProseMirror 타입 비공개 계약,
// public-types.test.ts), 이 kind 유니온만은 EditorController 공개
// 인터페이스가 직접 참조해 index.ts에서 재노출해야 한다. media-commands.js
// 안에 두면 그 모듈의 reachable declaration(.d.ts) 전체가 공개 표면에
// 끌려 들어와 insertMediaBlock(editor: Editor, ...)의 Tiptap Editor 타입이
// 함께 노출된다(실측: public-types.test.ts RED). tiptap import가 전혀 없는
// 이 파일로 분리해 reachable해도 안전하게 한다.
export type MediaBlockKind = "file" | "image" | "video" | "audio";

// editor-controller.ts::getSelectionMediaBlock(RD-003 DELTA-01)이 PM
// NodeSelection의 node.type.name(런타임엔 평범한 string)을 MediaBlockKind로
// 좁히는 데 쓴다. `string`에 대한 `!==` 리터럴 비교 연쇄는 TS가 좁히지
// 않으므로(넓은 원시 타입에서 유한 리터럴을 뺀 나머지를 계산하지 않는다)
// 이 파일처럼 명시적 타입가드가 필요하다.
export const isMediaBlockKind = (value: string): value is MediaBlockKind =>
  value === "file" ||
  value === "image" ||
  value === "video" ||
  value === "audio";
