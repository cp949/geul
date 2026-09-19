import type { IframeEmbedConfig as IframeUrlPolicy } from "@cp949/geul-model";

// media-block-kind.ts와 동일한 분리 근거(그 파일 상단 주석 참고, RD-002
// DELTA-02 실측 재확인) — Tiptap import가 전혀 없는 별도 파일에 둬야
// index.ts가 이 타입을 재노출해도 reachable .d.ts 전체가 안전하다.
// iframe-block-extension.ts에 이 타입을 직접 두면(처음 시도, RED로 실측
// 발견) 그 파일이 `@tiptap/core`/`@tiptap/pm/model`을 import해 전체
// 컴파일된 .d.ts에 Tiptap 타입 참조가 남고, index.ts가 그 파일에서
// 하나라도 재노출하면 public-types.test.ts의 reachable declaration
// 순회가 파일 전체를 끌어와 ADR-0002(core 공개 타입 비노출)를 깬다.

// IframeBlockExtension.addOptions()(iframe-block-extension.ts)가 쓰는
// 렌더링 옵션 shape — 원 소유자는 그 파일이지만 타입 선언만 이 자족
// 파일로 옮겨 host 표면(IframeEmbedConfig)과 함께 안전하게 재노출한다.
export type IframeBlockExtensionOptions = {
  sandbox: string;
  allow: string;
  referrerPolicy: string;
};

// CreateEditorOptions.iframeEmbed(RD-002 DELTA-02) — host가 EditorController
// 생성 시 주입하는 iframe 설정 전체를 한 옵션으로 노출한다. model의
// `IframeEmbedConfig`(iframe-embed-policy.ts, URL 허용 정책 4필드)와 위
// 렌더링 옵션(sandbox/allow/referrerPolicy) 교집합이다 — 두 소스 타입이
// 이름 겹치는 필드가 없어 교집합이 충돌하지 않는다. `setIframeSrc`
// 커맨드(block-attribute-commands.ts)는 앞 4필드만
// resolveIframeEmbedDecision에 그대로 넘기고, production-editor-
// assembly.ts는 뒤 3필드만 있으면 `.configure()`로 override한다. spec
// §2 원안의 단일 IframeEmbedConfig 개념을 host 표면에서 유지하면서도,
// RD-002 DELTA-01이 이미 분리한 "model은 URL 정책만, core는 렌더링
// 옵션만 안다"는 내부 계층 경계는 그대로 둔다.
export type IframeEmbedConfig = IframeUrlPolicy &
  Partial<IframeBlockExtensionOptions>;
