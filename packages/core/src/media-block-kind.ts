import type { MediaBlockType } from "@cp949/geul-model";

// 5종 미디어 블록 kind 판별 유니온 — media-commands.ts(insertMediaBlock 내부
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
// iframe(CUS-001~004, spec docs/specs/2026-09-19-iframe-block-design.md)이
// 5번째 kind다 — resize/align/toolbar/오버레이 인프라를 media 4종과 공유한다
// (spec §1 "MediaBlockKind 확장" 결정). "Media"라는 이름이 iframe엔 다소
// 부정확하지만 전면 rename은 범위 밖이다(spec §8).
//
// 5종 유니온과 판정은 model의 BLOCK_FAMILY 표가 소유한다(Issue #371).
// 여기서는 공개 이름 MediaBlockKind를 MediaBlockType 별칭으로 유지한다.
// model import는 type 전용이라 이 파일에 Tiptap 의존이 생기지 않는다.
// string을 MediaBlockKind로 좁히는 판정은 model의 isMediaBlockType을 쓴다.
export type MediaBlockKind = MediaBlockType;
