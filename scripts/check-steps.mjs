#!/usr/bin/env node
/**
 * Проверяет то, что zod-схема проверить не может: связь между локалями и
 * колодами кода. Именно здесь ловится главный класс i18n-багов — расхождение
 * версий одного урока между языками.
 *
 * Ошибка -> exit 1 (ломает сборку). Отсутствие перевода -> предупреждение.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { createHighlighter } from 'shiki';
import { codeTransformers } from '../src/code/shiki.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessonsDir = path.join(root, 'src/content/lessons');
const codeDir = path.join(root, 'src/code');
const likec4Dir = path.join(root, 'likec4');

const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * Какие view объявлены в модели LikeC4.
 *
 * Читается из исходников, а не из сгенерированного компонента: генерация — шаг
 * сборки, а проверка обязана работать и до него. Плюс `index`: его LikeC4
 * создаёт сам для корня модели.
 */
async function likec4Views() {
  if (!existsSync(likec4Dir)) return null;

  const files = (await readdir(likec4Dir)).filter((file) => file.endsWith('.c4'));
  const views = new Set(['index']);

  for (const file of files) {
    const source = await readFile(path.join(likec4Dir, file), 'utf8');

    for (const match of source.matchAll(/^\s*view\s+([A-Za-z_][\w]*)/gm)) {
      views.add(match[1]);
    }

    // Модель — общий для локалей ассет, как колода и схема, поэтому текст в ней
    // только английский. Проверяются строки в кавычках, а не файл целиком:
    // комментарии здесь — обычные комментарии в исходниках и пишутся по-русски.
    for (const [, quoted] of source.matchAll(/'([^']*)'/g)) {
      if (CYRILLIC.test(quoted)) {
        errors.push(`likec4/${file}: кириллица в "${quoted}" — общий ассет, только английский`);
      }
    }
  }

  return views;
}

/** Пометка на схеме должна умещаться в две строки. */
const NOTE_LIMIT = 80;

const errors = [];
const warnings = [];

/** Все сниппеты колод — их прогоняет подсветка в самом конце. */
const snippets = [];

function frontmatter(source, where) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) {
    errors.push(`${where}: нет frontmatter`);
    return null;
  }
  try {
    return parseYaml(match[1]);
  } catch (error) {
    errors.push(`${where}: битый YAML — ${error.message}`);
    return null;
  }
}

const locales = (await readdir(lessonsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Какие view объявлены в модели; null — модели в проекте нет. */
const likec4ViewIds = await likec4Views();

/** locale -> slug -> frontmatter */
const bySlug = new Map();

for (const locale of locales) {
  const files = (await readdir(path.join(lessonsDir, locale))).filter((f) => /\.mdx?$/.test(f));
  for (const file of files) {
    const slug = file.replace(/\.mdx?$/, '');
    const where = `${locale}/${file}`;
    const data = frontmatter(await readFile(path.join(lessonsDir, locale, file), 'utf8'), where);
    if (!data) continue;

    if (!bySlug.has(slug)) bySlug.set(slug, new Map());
    bySlug.get(slug).set(locale, { data, where });
  }
}

for (const [slug, perLocale] of bySlug) {
  const missing = locales.filter((locale) => !perLocale.has(locale));
  if (missing.length) {
    warnings.push(`урок "${slug}" не переведён на: ${missing.join(', ')}`);
  }

  // Колода кода общая для всех локалей.
  const deckName = [...perLocale.values()][0].data.deck ?? slug;
  const deckPath = path.join(codeDir, `${deckName}.ts`);
  if (!existsSync(deckPath)) {
    errors.push(`урок "${slug}": нет колоды src/code/${deckName}.ts`);
    continue;
  }
  const deckModule = await import(deckPath);
  const deck = deckModule.default;
  const deckIds = deck.map((step) => step.id);
  const duplicates = deckIds.filter((id, i) => deckIds.indexOf(id) !== i);
  if (duplicates.length) {
    errors.push(`колода "${deckName}": повторяющиеся id — ${[...new Set(duplicates)].join(', ')}`);
  }

  // Колода и схема общие для всех локалей, поэтому текст в них может быть только
  // английским. Иначе русский комментарий вылезет на английской странице —
  // я наступил на это дважды, теперь это ловит сборка.
  for (const step of deck) {
    for (const field of ['caption', 'code', 'output']) {
      if (CYRILLIC.test(step[field] ?? '')) {
        errors.push(`колода "${deckName}", шаг "${step.id}": кириллица в ${field} — общий ассет, только английский`);
      }
    }
  }

  /**
   * Схема и постер описаны одной и той же спекой для React Flow, поэтому
   * проверяются одинаково: ссылки на несуществующие шаги, рёбра в никуда,
   * кириллица в подписях (спека общая для всех локалей).
   */
  function checkFlow(spec, label, allowedSteps) {
    const where = `${label} колоды "${deckName}"`;
    const nodeIds = spec.nodes.map((node) => node.id);

    const duplicates = nodeIds.filter((id, i) => nodeIds.indexOf(id) !== i);
    if (duplicates.length) {
      errors.push(`${where}: повторяющиеся id узлов — ${[...new Set(duplicates)].join(', ')}`);
    }

    const referenced = new Set();
    const collect = (list) => (list ?? []).forEach((id) => referenced.add(id));

    for (const node of spec.nodes) {
      collect(node.only);
      collect(node.active);
      collect(node.focus);
      collect(node.bad);
      for (const [field, value] of Object.entries({ kind: node.kind, title: node.title, sub: node.sub })) {
        if (CYRILLIC.test(value ?? '')) {
          errors.push(`${where}: кириллица в ${field} узла "${node.id}" — общий ассет, только английский`);
        }
      }
    }

    for (const edge of spec.edges) {
      collect(edge.only);
      if (CYRILLIC.test(edge.label ?? '')) {
        errors.push(`${where}: кириллица в подписи ребра "${edge.id}" — общий ассет, только английский`);
      }
      for (const side of ['source', 'target']) {
        if (!nodeIds.includes(edge[side])) {
          errors.push(`${where}: ребро "${edge.id}": ${side} "${edge[side]}" — нет такого узла`);
        }
      }
    }

    const unknown = [...referenced].filter((id) => !allowedSteps.includes(id));
    if (unknown.length) {
      errors.push(`${where}: ссылки на несуществующие шаги — ${unknown.join(', ')}`);
    }
    return referenced;
  }

  // Шаги, для которых схема резервирует место под пометку. Текст пометки —
  // проза, значит переводится и обязан быть в каждой локали.
  const annotatedSteps = (deckModule.flow?.annotations ?? []).map((a) => a.step);

  for (const step of deck) {
    if (step.code && step.lang) {
      snippets.push({ deck: deckName, step: step.id, lang: step.lang, code: step.code });
    }
  }

  // Комментарии в коде — placeholder'ы {{ключ}}. Собираем, что код требует.
  const neededComments = new Set();
  for (const step of deck) {
    for (const match of (step.code ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
      neededComments.add(match[1]);
    }
  }

  // Схема разбора: шаги те же, что в колоде.
  if (deckModule.flow) {
    const unknownNotes = annotatedSteps.filter((id) => !deckIds.includes(id));
    if (unknownNotes.length) {
      errors.push(`схема колоды "${deckName}": пометки для несуществующих шагов — ${unknownNotes.join(', ')}`);
    }
    const referenced = checkFlow(deckModule.flow, 'схема', deckIds);
    const never = deckIds.filter((id) => !referenced.has(id));
    if (never.length) {
      warnings.push(`схема колоды "${deckName}": на шагах ${never.join(', ')} схема не меняется`);
    }
  }

  /**
   * Не легла ли пометка на узел.
   *
   * Расставляя пометки, легко забыть, что набор видимых узлов меняется от шага
   * к шагу: место, пустое на одном шаге, на другом занято карточкой, и записка
   * накрывает её собой. Глазами это ловится только если пролистать все шаги —
   * поэтому считает машина.
   */
  if (deckModule.flow?.annotations) {
    const flow = deckModule.flow;
    const { NODE_SIZE } = await import(path.join(codeDir, 'flow.ts'));
    const visible = (only, step) => only === undefined || only.includes(step);
    const overlap = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    for (const annotation of flow.annotations) {
      const note = {
        x: annotation.position.x,
        y: annotation.position.y,
        w: annotation.width ?? 190,
        h: NODE_SIZE.note,
      };

      const occupied = flow.nodes
        .filter((node) => visible(node.only, annotation.step))
        .map((node) => ({
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          w: node.width ?? NODE_SIZE.width,
          h: node.variant === 'bar' ? NODE_SIZE.bar : NODE_SIZE.card,
        }));

      if (flow.drop?.step === annotation.step) {
        occupied.push({
          id: 'drop-slot',
          x: flow.drop.slot.x,
          y: flow.drop.slot.y,
          w: flow.drop.width ?? NODE_SIZE.width,
          h: NODE_SIZE.card,
        });
      }

      const hit = occupied.filter((box) => overlap(note, box)).map((box) => box.id);
      if (hit.length) {
        errors.push(
          `схема колоды "${deckName}": пометка шага "${annotation.step}" налезает на ${hit.join(', ')}`,
        );
      }
    }
  }

  // Перетаскивание: шаг, на котором оно работает, обязан иметь подписи в
  // каждой локали — иначе читателю предложат тащить безымянную карточку.
  const dragStep = deckModule.flow?.drop?.step;
  if (dragStep && !deckIds.includes(dragStep)) {
    errors.push(`схема колоды "${deckName}": drop ссылается на несуществующий шаг "${dragStep}"`);
  }

  // Постер: схема из одного состояния, шаг у неё ровно один.
  if (deckModule.poster) {
    const fixed = deckModule.poster.fixedStep;
    if (!fixed) {
      errors.push(`постер колоды "${deckName}": нет fixedStep — постер рисуется вне плеера`);
    } else {
      checkFlow(deckModule.poster, 'постер', [fixed]);
    }
  } else {
    warnings.push(`колода "${deckName}": нет постера — карточка в каталоге будет без иллюстрации`);
  }

  /**
   * Разбор ведёт либо нарисованная схема, либо модель LikeC4. Полотно на сцене
   * одно, поэтому две схемы разом — не выбор варианта, а забытая правка.
   */
  if (deckModule.flow && deckModule.likec4) {
    errors.push(`колода "${deckName}": объявлены и flow, и likec4 — на сцене одно полотно`);
  }

  if (deckModule.likec4) {
    if (!likec4ViewIds) {
      errors.push(`колода "${deckName}": ведёт разбор по likec4, но каталога likec4/ нет`);
    }

    for (const [step, viewId] of Object.entries(deckModule.likec4.views)) {
      if (!deckIds.includes(step)) {
        errors.push(`колода "${deckName}": likec4 ссылается на несуществующий шаг "${step}"`);
      }
      // Опечатка в id иначе доезжает до читателя пустым полотном: LikeC4 не
      // находит view и молча не рисует ничего.
      if (likec4ViewIds && !likec4ViewIds.has(viewId)) {
        errors.push(`колода "${deckName}", шаг "${step}": нет view "${viewId}" в likec4/`);
      }
    }
  }

  // Эталон порядка шагов — первая локаль по алфавиту; остальные обязаны совпасть.
  let reference = null;
  let quizReference = null;
  let incidentReference = null;

  for (const [locale, { data, where }] of perLocale) {
    const ids = data.steps.map((step) => step.id);

    const unknown = ids.filter((id) => !deckIds.includes(id));
    if (unknown.length) {
      errors.push(`${where}: шаги без кода в колоде "${deckName}" — ${unknown.join(', ')}`);
    }
    const unused = deckIds.filter((id) => !ids.includes(id));
    if (unused.length) {
      warnings.push(`${where}: шаги колоды без нарратива — ${unused.join(', ')}`);
    }

    if (reference === null) {
      reference = { locale, ids };
    } else if (reference.ids.join('|') !== ids.join('|')) {
      errors.push(
        `${where}: порядок/состав шагов расходится с ${reference.locale}\n` +
          `    ${reference.locale}: ${reference.ids.join(', ')}\n` +
          `    ${locale}: ${ids.join(', ')}`,
      );
    }

    // Пометка — укол, а не абзац. Длинная разрастается на четыре строки и
    // ложится на узлы и рёбра: место под неё в спеке фиксированное.
    for (const step of data.steps) {
      if (step.note && step.note.length > NOTE_LIMIT) {
        errors.push(`${where}: note шага "${step.id}" — ${step.note.length} символов при лимите ${NOTE_LIMIT}`);
      }
    }

    // Комментарии к коду: набор ключей обязан совпадать с тем, что требует код.
    const given = Object.keys(data.comments ?? {});
    const missingComments = [...neededComments].filter((key) => !given.includes(key));
    if (missingComments.length) {
      errors.push(`${where}: нет переводов комментариев к коду — ${missingComments.join(', ')}`);
    }
    const strayComments = given.filter((key) => !neededComments.has(key));
    if (strayComments.length) {
      warnings.push(`${where}: комментарии ${strayComments.join(', ')} не используются ни в одном шаге`);
    }

    if (dragStep && !data.steps.find((step) => step.id === dragStep)?.drag) {
      errors.push(`${where}: нет подписей drag для шага "${dragStep}" — схема ждёт карточку`);
    }

    const noted = data.steps.filter((step) => step.note).map((step) => step.id);
    const missingNotes = annotatedSteps.filter((id) => !noted.includes(id));
    if (missingNotes.length) {
      errors.push(`${where}: нет note для шагов с пометкой на схеме — ${missingNotes.join(', ')}`);
    }
    const strayNotes = noted.filter((id) => !annotatedSteps.includes(id));
    if (strayNotes.length) {
      warnings.push(`${where}: note у шагов ${strayNotes.join(', ')} нигде не показывается — на схеме для них нет пометки`);
    }

    // Реальные случаи: пересказ переводится, ссылка — нет. Значит набор и
    // порядок ссылок обязаны совпадать между локалями, иначе на одном языке
    // читатель увидит случай, которого на другом нет.
    const incidents = (data.incidents ?? []).map((item) => item.url);
    if (incidentReference === null) {
      incidentReference = { locale, urls: incidents };
    } else if (incidentReference.urls.join('|') !== incidents.join('|')) {
      errors.push(
        `${where}: реальные случаи расходятся с ${incidentReference.locale}\n` +
          `    ${incidentReference.locale}: ${incidentReference.urls.join(', ') || '—'}\n` +
          `    ${locale}: ${incidents.join(', ') || '—'}`,
      );
    }

    for (const [i, item] of (data.quiz ?? []).entries()) {
      if (item.answer >= item.options.length) {
        errors.push(`${where}: quiz[${i}].answer=${item.answer} вне диапазона options`);
      }
    }

    // Прогресс квиза лежит в localStorage под ключом урока, общим для локалей.
    // Значит порядок вопросов и индексы правильных ответов обязаны совпадать,
    // иначе переключение языка подсветит не те варианты.
    const quizShape = (data.quiz ?? []).map((item) => `${item.options.length}:${item.answer}`);
    if (quizReference === null) {
      quizReference = { locale, shape: quizShape };
    } else if (quizReference.shape.join('|') !== quizShape.join('|')) {
      errors.push(
        `${where}: квиз расходится с ${quizReference.locale} по числу вариантов или индексам ответов\n` +
          `    ${quizReference.locale}: ${quizReference.shape.join(', ') || '—'}\n` +
          `    ${locale}: ${quizShape.join(', ') || '—'}`,
      );
    }
  }
}

/**
 * Маркеры вроде [!code highlight] обрабатывает подсветка, и обрабатывает не
 * всегда: TextMate-грамматика Lean не выделяет хвостовой --комментарий в
 * отдельный токен, если в строке есть скобка, и маркер молча утекает в текст
 * страницы. Единственный надёжный способ это поймать — прогнать подсветку
 * по-настоящему и посмотреть, что осталось.
 */
if (snippets.length) {
  const langs = [...new Set(snippets.map((s) => s.lang))];
  const highlighter = await createHighlighter({ themes: ['github-light'], langs });
  const transformers = codeTransformers();

  for (const snippet of snippets) {
    if (!snippet.code.includes('[!code')) continue;
    const html = highlighter.codeToHtml(snippet.code, {
      lang: snippet.lang,
      theme: 'github-light',
      transformers,
    });
    if (html.includes('[!code')) {
      errors.push(
        `колода "${snippet.deck}", шаг "${snippet.step}": маркер [!code …] утёк в текст — ` +
          `для ${snippet.lang} ставь его отдельной строкой перед целевой`,
      );
    }
  }
  highlighter.dispose();
}

for (const warning of warnings) console.warn(`warn  ${warning}`);
for (const error of errors) console.error(`error ${error}`);

if (errors.length) {
  console.error(`\n${errors.length} ошибок — сборка остановлена.`);
  process.exit(1);
}
console.log(`ok    ${bySlug.size} урок(ов), локали: ${locales.join(', ')}${warnings.length ? `, предупреждений: ${warnings.length}` : ''}`);
