# PIT-0012 합성 paste 이벤트는 ClipboardEventInit이 아니라 defineProperty로 clipboardData를 얹는다

- 상태: `ACTIVE`
- 적용 영역: e2e
- 최초 근거: R1 슬라이스 13(Firefox/WebKit 게이트)

## 상황과 징후

`new ClipboardEvent("paste", { clipboardData, bubbles, cancelable })`로 합성한 paste 이벤트를 디스패치하면 Chromium과 WebKit에서는 `event.clipboardData.types`에 실어 보낸 데이터가 그대로 나타나지만, Firefox에서는 `event.clipboardData`가 `null`이 아닌데도 `types`가 빈 배열로 나온다. 표 붙여넣기 e2e 3건(외부 HTML 표, Google Sheets HTML, Excel HTML)이 Firefox에서만 표가 생성되지 않고 타임아웃했다 — `handlePaste`가 `clipboardData.getData(...)`로 빈 문자열을 읽어 `NOT_TABULAR`로 판단했기 때문이다.

## 근본 원인

Firefox는 스크립트가 생성한(untrusted) `ClipboardEvent`의 `clipboardData` 초기값을 보안상 반영하지 않는다 — 생성자 옵션으로 넘긴 `DataTransfer`를 무시하고 자체 빈 `DataTransfer`를 노출한다. `ClipboardEventInit.clipboardData`는 표준이 아니라 Chromium이 먼저 지원한 확장이라 엔진별로 이 정도까지 지원 범위가 다르다.

## 예방 규칙

- e2e에서 paste를 합성할 때 `ClipboardEvent` 생성자의 `clipboardData` 옵션에 의존하지 않는다. 대신 평범한 `Event("paste", { bubbles, cancelable })`를 만들고 `Object.defineProperty(event, "clipboardData", { value: data, configurable: true })`로 얹은 뒤 디스패치한다 — 세 엔진(Chromium/Firefox/WebKit) 모두 이 방식에서 `clipboardData.types`가 정상적으로 채워진다. addEventListener는 이벤트 인스턴스가 아니라 `type` 문자열로 매치하므로 `ClipboardEvent` 서브타입일 필요가 없다.
- 프로덕션 코드가 `event instanceof ClipboardEvent`로 분기하지 않는지 확인한다 — 이 대체 방식은 평범한 `Event`를 디스패치하므로 그런 분기가 있으면 깨진다.
- 새 브라우저 이벤트 합성 헬퍼를 추가할 때는 착수 전에 Chromium 단일 엔진이 아니라 3개 엔진 모두에서 최소 재현으로 먼저 검증한다.

## 검증 방법

```bash
pnpm exec playwright test e2e/table-paste.spec.ts --project=firefox --project=webkit --project=chromium
```

## 실제 근거

- `e2e/table-paste.spec.ts`의 `dispatchPaste` 헬퍼와 `e2e/table-handle.spec.ts`의 "외부 HTML 표를 붙여넣으면 표가 생기고 편집이 계속된다 @core" 테스트.
- R1 슬라이스 13 판정 회차 `R1-01`([상세](../reviews/r1-enhanced-table-mvp-completion.md)) — Firefox 프로젝트 첫 도입 시 `page.evaluate`로 `clipboardData.types`를 직접 로그해 원인을 확인했다.

## 관련 문서

- [PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md)
