// The user manual (docs/USER-MANUAL.md) inside the app (F1): its sections
// down the left, the text on the right. A small Markdown reader: headings,
// paragraphs, lists, tables, quotes, code, bold, italics, inline code and
// links (opened in the browser).
import { useEffect, useMemo, useRef } from 'preact/hooks';
import * as S from '../store.js';
import { Modal } from './controls.jsx';
import text from '../../docs/USER-MANUAL.md?raw';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(s, key = 0) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*|<kbd>[^<]+<\/kbd>)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('<kbd>')) out.push(<kbd key={k}>{t.slice(5, -6)}</kbd>);
    else if (t.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      const local = href.startsWith('#');
      out.push(
        <a
          key={k}
          href={local ? href : undefined}
          title={local ? undefined : href}
          onClick={(e) => {
            e.preventDefault();
            if (local) document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
            else if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
          }}
        >
          {label}
        </a>,
      );
    } else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function render(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      out.push(<pre key={k++} class="code-box">{body.join('\n')}</pre>);
      continue;
    }
    const h = /^(#{1,4}) (.+)$/.exec(line);
    if (h) {
      const Tag = `h${Math.min(4, h[1].length + 1)}`;
      out.push(
        <Tag key={k++} id={slug(h[2])}>
          {inline(h[2])}
        </Tag>,
      );
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push(
        <table key={k++}>
          <thead>
            <tr>{cells(body[0]).map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.slice(1).map((r, j) => (
              <tr key={j}>{cells(r).map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.) /.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ''));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={k++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(<blockquote key={k++}>{inline(body.join(' '))}</blockquote>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||>|\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={k++}>{inline(para.join(' '))}</p>);
  }
  return out;
}

export function ManualDialog() {
  const body = useRef(null);
  const content = useMemo(() => render(text), []);
  const toc = useMemo(() => [...text.matchAll(/^(#{2,3}) (.+)$/gm)].map((m) => ({ level: m[1].length, title: m[2].trim() })), []);
  useEffect(() => {
    const section = S.manualSection.peek();
    S.manualSection.value = null;
    if (section) setTimeout(() => body.current?.querySelector(`#${CSS.escape(slug(section))}`)?.scrollIntoView(), 30);
  }, []);
  return (
    <Modal title="User manual" class="modal-wide modal-manual" onClose={() => (S.dialog.value = null)}>
      <div class="manual">
        <nav class="manual-toc" aria-label="Sections">
          {toc.map((t) => (
            <button
              type="button"
              key={t.title}
              class={`manual-toc-item level-${t.level}`}
              onClick={() => body.current?.querySelector(`#${CSS.escape(slug(t.title))}`)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t.title}
            </button>
          ))}
        </nav>
        <article class="manual-body prose" ref={body}>
          {content}
        </article>
      </div>
    </Modal>
  );
}
