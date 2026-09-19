import type { Dictionary, EditorError, MediaBlockKind } from "@cp949/geul-core";

// CUS-001~004(roadmap Issue #212 RD-004 DELTA-02) — Embed URL 저장 거절
// 문구. `MediaToolbar`(Embed 탭)와 `FilePanel`(Embed URL 탭)이 그대로
// 공유한다 — 두 컴포넌트는 각자 독립된 selection 상태 기계를 갖지만
// (RD-003-DELTA-03.md "결정"), 이 함수는 그 상태와 무관한 순수 매핑
// (kind, EditorError, Dictionary) -> string이라 상태 기계를 공유하지 않고도
// 안전하게 뽑아낼 수 있다. iframe + IFRAME_URL_NOT_ALLOWED만 model
// resolveIframeEmbedDecision의 거절 사유별 문구로 대체하고, 나머지(다른
// kind의 LINK_HREF_REJECTED 등)는 기존 generic unsupportedMediaUrl을 그대로
// 쓴다.
export const iframeUrlRejectionMessage = (
  kind: MediaBlockKind,
  error: EditorError,
  dictionary: Dictionary,
): string => {
  if (kind === "iframe" && error.code === "IFRAME_URL_NOT_ALLOWED") {
    switch (error.reason) {
      case "PROTOCOL_NOT_ALLOWED":
        return dictionary.status.iframeUrlRejected.protocolNotAllowed;
      case "PRIVATE_NETWORK_BLOCKED":
        return dictionary.status.iframeUrlRejected.privateNetworkBlocked;
      case "NOT_WHITELISTED_AND_CUSTOM_DISABLED":
        return dictionary.status.iframeUrlRejected.notWhitelisted;
    }
  }
  return dictionary.status.unsupportedMediaUrl;
};
