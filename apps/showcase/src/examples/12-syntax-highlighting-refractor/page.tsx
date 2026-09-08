import { ExamplePage } from "../../example-shell/example-page.js";
import SyntaxHighlightingRefractorExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const SyntaxHighlightingRefractorPage = () => (
  <ExamplePage
    description="refractor(Prism 어댑터)로 만든 SyntaxHighlighter 함수를 EditorProvider에 연결한 예제다. 코드 블록의 각 토큰에 Prism CSS class가 적용되지만 source 텍스트 자체는 바뀌지 않는다."
    source={exampleSource}
    title="Syntax highlighting (refractor)"
  >
    <SyntaxHighlightingRefractorExample />
  </ExamplePage>
);

export default SyntaxHighlightingRefractorPage;
