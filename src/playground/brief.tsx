import { useState } from 'react';
import type { Design } from './model';
import type { T } from './i18n';

/**
 * Задание — карточкой поверх полотна, в том же оформлении, что в разборе
 * (Brief.astro): край слева, рукописная подпись, источник капсом.
 *
 * Оно висит над схемой всегда: к условию возвращаются с любого места — на
 * оценках, чтобы вспомнить цифры, на схеме, чтобы не придумать требование
 * самому. Вкладка ради этого — лишний щелчок и потерянный контекст.
 * Сворачивается до подписи, когда мешает смотреть на схему.
 */

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

/** Абзацы — через пустую строку, строки с «- » — список: как проза разбора. */
function blocks(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n');
      return lines.every((line) => /^\s*[-*•]\s+/.test(line))
        ? { kind: 'ul', items: lines.map((line) => line.replace(/^\s*[-*•]\s+/, '')) }
        : { kind: 'p', text: chunk };
    });
}

const KEY = 'why:playground:brief-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function BriefCard({ design, t }: { design: Design; t: T }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const hints = design.scenario.hints.filter((hint) => design.session.revealed.includes(hint.id));

  const toggle = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(KEY, value ? '0' : '1');
      } catch {
        /* свёрнутость — удобство, не данные */
      }
      return !value;
    });
  };

  if (!design.task.trim() && !hints.length) return null;

  return (
    <figure className={`pg-brief ${collapsed ? 'is-collapsed' : ''}`}>
      <figcaption className="pg-brief__head">
        <span className="pg-brief__label">{t('brief.label')}</span>
        {design.taskSource && <span className="pg-brief__source">{design.taskSource}</span>}
        {collapsed && hints.length > 0 && (
          <span className="pg-brief__badge" title={t('scenario.hints')}>
            <i className="codicon codicon-lightbulb" aria-hidden="true" /> {hints.length}
          </span>
        )}
        <button
          type="button"
          className="pg-icon-button pg-brief__toggle"
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'brief.expand' : 'brief.collapse')}
          title={t(collapsed ? 'brief.expand' : 'brief.collapse')}
          onClick={toggle}
        >
          <i className={`codicon codicon-${collapsed ? 'chevron-down' : 'chevron-up'}`} aria-hidden="true" />
        </button>
      </figcaption>
      {!collapsed && (
        <div className="pg-brief__body">
          {/* blockquote: это дословная чужая постановка, как и в разборе. */}
          <blockquote className="pg-brief__text">
            {blocks(design.task).map((block, index) =>
              block.kind === 'ul' ? (
                <ul key={index}>
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={index}>{block.text}</p>
              ),
            )}
          </blockquote>
          {hints.length > 0 && (
            <section className="pg-brief__hints">
              <span className="pg-brief__hints-label">
                <i className="codicon codicon-lightbulb" aria-hidden="true" /> {t('scenario.hints')}
              </span>
              <ol>
                {hints.map((hint) => (
                  <li key={hint.id}>{hint.text}</li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </figure>
  );
}
