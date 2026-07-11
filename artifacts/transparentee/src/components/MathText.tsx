import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Segment {
  type: 'text' | 'inline' | 'display';
  content: string;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match $$...$$ first (display), then $...$ (inline)
  const re = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', content: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ type: 'display', content: m[1] });
    } else if (m[2] !== undefined) {
      segments.push({ type: 'inline', content: m[2] });
    }
    last = re.lastIndex;
  }
  if (last < text.length) {
    segments.push({ type: 'text', content: text.slice(last) });
  }
  return segments;
}

function renderMath(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    });
  } catch {
    return latex;
  }
}

export default function MathText({ text }: { text: string }) {
  const segments = parseSegments(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          // Preserve newlines as line breaks
          const lines = seg.content.split('\n');
          return (
            <span key={i}>
              {lines.map((line, j) => (
                <span key={j}>
                  {line}
                  {j < lines.length - 1 && <br />}
                </span>
              ))}
            </span>
          );
        }
        if (seg.type === 'display') {
          return (
            <span
              key={i}
              className="block my-3 overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: renderMath(seg.content, true) }}
            />
          );
        }
        // inline
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.content, false) }}
          />
        );
      })}
    </>
  );
}
