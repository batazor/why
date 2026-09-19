import { useEffect, useState, type DragEvent } from 'react';
import { BLOCK_BY_KIND } from './catalog';
import { REQ_DRAG, type Design, type Requirement } from './model';
import type { T } from './i18n';

/**
 * Требования документом — тот же вид, что таблица в разборе (RequirementsBoard):
 * путь файла сверху, под ним две таблицы. Это то, на что смотрят после
 * собеседования и что уходит в отчёт, поэтому рядом с каждым требованием —
 * чем оно закрыто: блоки схемы и маршруты API.
 */

/** Путь — идентификатор, а не проза: одинаков на всех языках. */
const PATH = 'docs/REQUIREMENTS.md';

function Blocks({ design, item, t }: { design: Design; item: Requirement; t: T }) {
  const nodes = design.nodes.filter((node) => item.covers.includes(node.id));
  if (!nodes.length) return <span className="pg-doc__none">—</span>;
  return (
    <span className="pg-doc__chips">
      {nodes.map((node) => (
        <span key={node.id} className="pg-doc__block">
          <i className={`codicon codicon-${BLOCK_BY_KIND.get(node.kind)?.icon ?? 'server-process'}`} aria-hidden="true" />
          {node.label || t(`block.${node.kind}`)}
        </span>
      ))}
    </span>
  );
}

function Routes({ design, item }: { design: Design; item: Requirement }) {
  const routes = design.api.filter((route) => route.covers.includes(item.id));
  if (!routes.length) return <span className="pg-doc__none">—</span>;
  return (
    <span className="pg-doc__chips">
      {routes.map((route) => (
        <code key={route.id} className={`pg-doc__route pg-api--${route.method.toLowerCase()}`}>
          <b>{route.method}</b> {route.path}
        </code>
      ))}
    </span>
  );
}

/** Строку таблицы тоже можно тащить на блок: за номер или за всю строку. */
function dragRow(id: string, enabled: boolean) {
  if (!enabled) return {};
  return {
    draggable: true,
    className: 'pg-doc__row--drag',
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(REQ_DRAG, id);
      event.dataTransfer.effectAllowed = 'link';
    },
  };
}

function Doc({ design, t, draggable }: { design: Design; t: T; draggable: boolean }) {
  const fr = design.requirements.filter((item) => item.kind === 'fr');
  const nfr = design.requirements.filter((item) => item.kind === 'nfr');

  return (
    <div className="pg-doc__body">
      <section className="pg-doc__section">
        <h3 className="pg-doc__title">
          {t('req.fr')} <span className="pg-count">{fr.length}</span>
        </h3>
        <table className="pg-doc__table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('doc.fr')}</th>
              <th>{t('doc.blocks')}</th>
              <th>{t('doc.routes')}</th>
            </tr>
          </thead>
          <tbody>
            {fr.map((item) => (
              <tr key={item.id} {...dragRow(item.id, draggable)}>
                <td>{item.id}</td>
                <td>{item.text || <span className="pg-doc__none">{t('req.text')}</span>}</td>
                <td>
                  <Blocks design={design} item={item} t={t} />
                </td>
                <td>
                  <Routes design={design} item={item} />
                </td>
              </tr>
            ))}
            {!fr.length && (
              <tr className="pg-doc__empty">
                <td colSpan={4}>{t('req.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="pg-doc__section pg-doc__section--nfr">
        <h3 className="pg-doc__title">
          {t('req.nfr')} <span className="pg-count">{nfr.length}</span>
        </h3>
        <table className="pg-doc__table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('doc.nfr')}</th>
              <th>{t('doc.target')}</th>
              <th>{t('doc.blocks')}</th>
            </tr>
          </thead>
          <tbody>
            {nfr.map((item) => (
              <tr key={item.id} {...dragRow(item.id, draggable)}>
                <td>{item.id}</td>
                <td>
                  {item.text || <span className="pg-doc__none">{t('req.text')}</span>}
                  {item.category && <span className="pg-doc__category">{t(`nfr.${item.category}`)}</span>}
                </td>
                <td className="pg-doc__target">{item.target || <span className="pg-doc__none">—</span>}</td>
                <td>
                  <Blocks design={design} item={item} t={t} />
                </td>
              </tr>
            ))}
            {!nfr.length && (
              <tr className="pg-doc__empty">
                <td colSpan={4}>{t('req.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** Тот же документ в Markdown — вставить в отчёт, тикет или README сервиса. */
export function requirementsMarkdown(design: Design, t: T): string {
  const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\n+/g, ' ') || '—';
  const blocks = (item: Requirement) =>
    design.nodes
      .filter((node) => item.covers.includes(node.id))
      .map((node) => node.label || t(`block.${node.kind}`))
      .join(', ');
  const routes = (item: Requirement) =>
    design.api
      .filter((route) => route.covers.includes(item.id))
      .map((route) => `\`${route.method} ${route.path}\``)
      .join(', ');

  const fr = design.requirements.filter((item) => item.kind === 'fr');
  const nfr = design.requirements.filter((item) => item.kind === 'nfr');
  return [
    `# ${design.title}`,
    '',
    `## ${t('req.fr')}`,
    '',
    `| # | ${t('doc.fr')} | ${t('doc.blocks')} | ${t('doc.routes')} |`,
    '|---|---|---|---|',
    ...fr.map((item) => `| ${item.id} | ${cell(item.text)} | ${cell(blocks(item))} | ${cell(routes(item))} |`),
    '',
    `## ${t('req.nfr')}`,
    '',
    `| # | ${t('doc.nfr')} | ${t('req.category')} | ${t('doc.target')} | ${t('doc.blocks')} |`,
    '|---|---|---|---|---|',
    ...nfr.map(
      (item) =>
        `| ${item.id} | ${cell(item.text)} | ${cell(item.category ? t(`nfr.${item.category}`) : '')} | ${cell(item.target)} | ${cell(blocks(item))} |`,
    ),
    '',
  ].join('\n');
}

/**
 * Документ требований: в боковой панели и во всю ширину окна. В панели таблица
 * в четыре колонки тесная — развёрнутый вид для того, чтобы спокойно прочитать.
 */
export function RequirementsDoc({ design, t, draggable = false }: { design: Design; t: T; draggable?: boolean }) {
  const [wide, setWide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!wide) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setWide(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wide]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(requirementsMarkdown(design, t));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен — кнопка просто ничего не сделала */
    }
  };

  const bar = (
    <div className="pg-doc__path">
      <span>{PATH}</span>
      <span className="pg-doc__actions">
        <button type="button" className="pg-doc__action" onClick={copy}>
          <i className={`codicon codicon-${copied ? 'check' : 'markdown'}`} aria-hidden="true" />
          {t(copied ? 'doc.copied' : 'doc.copy')}
        </button>
        <button type="button" className="pg-doc__action" onClick={() => setWide(!wide)}>
          <i className={`codicon codicon-${wide ? 'screen-normal' : 'screen-full'}`} aria-hidden="true" />
          {t(wide ? 'comp.close' : 'doc.expand')}
        </button>
      </span>
    </div>
  );

  return (
    <>
      <div className="pg-doc">
        {bar}
        <Doc design={design} t={t} draggable={draggable} />
      </div>
      {wide && (
        <div className="pg-dialog" role="dialog" aria-modal="true" aria-label={PATH} onClick={() => setWide(false)}>
          <div className="pg-dialog__box pg-doc pg-doc--wide" onClick={(event) => event.stopPropagation()}>
            {bar}
            <div className="pg-doc__scroll">
              <Doc design={design} t={t} draggable={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
