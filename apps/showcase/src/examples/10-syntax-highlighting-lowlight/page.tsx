import { ExamplePage } from "../../example-shell/example-page.js";
import SyntaxHighlightingLowlightExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SyntaxHighlightingLowlightPage = () => (
  <ExamplePage
    description="lowlight(+ highlight.js)로 만든 SyntaxHighlighter 함수를 EditorProvider에 연결한 예제다. javascript·python·css 3개 언어 코드 블록 각각의 토큰에 highlight.js CSS class가 적용되지만 source 텍스트 자체는 바뀌지 않는다. 코드블록에 커서를 두면 우상단 언어 버튼으로 실시간 전환도 가능하다."
    source={exampleSource}
    title="Syntax highlighting (lowlight)"
  >
    <SyntaxHighlightingLowlightExample />
  </ExamplePage>
);

export default SyntaxHighlightingLowlightPage;
