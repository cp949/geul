/**
 * 대상 엘리먼트에 ClipboardEvent("paste")를 직접 디스패치한다.
 * 실제 브라우저의 클립보드 접근 권한 없이도 text/html·text/plain·file
 * 붙여넣기를 재현한다. `table-paste.spec.ts`가 처음 썼고,
 * `clipboard-paste.spec.ts`(Issue #38 슬라이스 10 RD-006 DELTA-02)가
 * 두 번째 소비 파일로 등장해 여기로 승격했다(G-TST-002).
 *
 * Firefox는 ClipboardEvent 생성자의 clipboardData 초기값을 합성(untrusted)
 * 이벤트에 반영하지 않는다 — clipboardData 자체는 null이 아니지만 types가
 * 빈 배열로 나온다. 대신 평범한 Event에 clipboardData를 defineProperty로
 * 얹으면 세 엔진(Chromium/Firefox/WebKit) 모두 types가 채워진다.
 *
 * Playwright `locator.evaluate(dispatchPaste, input)`으로 브라우저 컨텍스트
 * 안에서 실행된다 — 함수 본문이 그대로 직렬화되므로 클로저로 외부 값을
 * 참조하지 않는다.
 */
export const dispatchPaste = (
  target: Element,
  input: { html?: string; text?: string; fileNames?: string[] },
): void => {
  const data = new DataTransfer();
  if (input.html !== undefined) data.setData("text/html", input.html);
  if (input.text !== undefined) data.setData("text/plain", input.text);
  for (const name of input.fileNames ?? []) {
    data.items.add(new File(["x"], name, { type: "text/plain" }));
  }
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: data,
    configurable: true,
  });
  target.dispatchEvent(event);
};
