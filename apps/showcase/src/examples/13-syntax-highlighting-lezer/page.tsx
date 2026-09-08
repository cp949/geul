import { ExamplePage } from "../../example-shell/example-page.js";
import SyntaxHighlightingLezerExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SyntaxHighlightingLezerPage = () => (
  <ExamplePage
    description="@lezer/javascript + @lezer/highlight(CodeMirror6의 문법 파서/구문 강조 엔진)로 만든 SyntaxHighlighter 함수를 EditorProvider에 연결한 예제다. 코드 블록의 각 토큰에 tok- class가 적용되지만 source 텍스트 자체는 바뀌지 않는다."
    source={exampleSource}
    title="Syntax highlighting (lezer)"
  >
    <SyntaxHighlightingLezerExample />
  </ExamplePage>
);

export default SyntaxHighlightingLezerPage;
