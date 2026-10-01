import type { ClipsModel } from './widgets';

/**
 * Формулы разбора сервиса клипов с пандами.
 *
 * Чистые функции без интерфейса: их зовёт врезка в браузере и node, когда
 * нужно сверить числа в тексте с тем, что покажет калькулятор. Поэтому импорт
 * здесь только типовой — node исполняет файл как есть.
 */

const MBIT = 1_000_000;
const DAY = 86_400;
const TIB = 1024 ** 4;

export type ClipsResult = { out: Record<string, number>; verdict: string };

/**
 * Пайплайн: от числа загрузок до числа GPU.
 *
 * Поток считается как у любой очереди работы — закон Литтла: поток на пике,
 * умноженный на время одной обработки, даёт число видео в работе разом, а
 * видео на GPU обрабатывается по одному, так что это же число — размер пула.
 * `gpuFactor` — сколько секунд GPU уходит на секунду видео: детектор смотрит
 * не каждый кадр, и 0,2 — это минута на пятиминутный ролик.
 */
function pipeline(v: Record<string, number>): ClipsResult {
  const average = v.uploadsPerDay / DAY;
  const peak = average * v.peakFactor;
  const jobTime = v.videoMinutes * 60 * v.gpuFactor;
  const inFlight = Math.ceil(peak * jobTime);
  const gpuHours = (v.uploadsPerDay * jobTime) / 3600;
  const queued = peak * v.queueMinutes * 60;
  const timeToClips = v.queueMinutes * 60 + jobTime;

  const verdict = inFlight <= 1 ? 'single' : inFlight <= 40 ? 'pool' : 'split';

  return { out: { average, peak, jobTime, gpuHours, inFlight, queued, timeToClips }, verdict };
}

/**
 * Хранилище: клип — таймкоды, поэтому хранится оригинал целиком.
 *
 * Оригинал весит столько, сколько снял телефон: минуты на битрейт, и живёт,
 * пока живёт видео. Рядом считается альтернатива — нарезать клипы в
 * отдельные файлы и хранить только их: разница в десятки раз, и это цена
 * решения «таймкоды вместо нарезки». Горячий класс — первые дни, пока видео
 * смотрят; дальше оно уходит в класс с редким доступом.
 */
function storage(v: Record<string, number>): ClipsResult {
  const perVideo = (v.videoMinutes * 60 * v.mbps * MBIT) / 8;
  const uploadBytes = v.uploadsPerDay * perVideo;
  const pandaSeconds = (v.videoMinutes * 60 * v.pandaShare) / 100;
  const clipsPerDay = (v.uploadsPerDay * pandaSeconds) / v.clipSeconds;
  const storedYear = uploadBytes * 365;
  const hot = uploadBytes * Math.min(v.hotDays, 365);
  const cold = storedYear - hot;
  const cutAlternative = ((v.uploadsPerDay * pandaSeconds * v.clipMbps * MBIT) / 8) * 365;

  const verdict = storedYear <= 50 * TIB ? 'bucket' : storedYear <= 1024 * TIB ? 'tiers' : 'budget';

  return {
    out: { perVideo, uploadBytes, clipsPerDay, storedYear, hot, cold, cutAlternative, ratio: storedYear / cutAlternative },
    verdict,
  };
}

/**
 * Раздача: сколько смотрят и что из этого — байты, а что — метаданные.
 *
 * Байты просмотра идут с CDN — кусок оригинала по диапазону, в том битрейте,
 * в котором видео лежит. В нашу базу приходит по одному чтению на страницу
 * клипа и на поиск. Рядом с ними поток записи — клипы, которые нашёл
 * детектор, — и отношение между ними говорит, какая база нужна.
 */
function delivery(v: Record<string, number>): ClipsResult {
  const views = v.uploadsPerDay * v.watchRatio;
  const viewsPeak = (views / DAY) * v.peakFactor;
  const egressDay = (views * v.clipSeconds * v.playMbps * MBIT) / 8;
  const egressMonth = egressDay * 30;
  const searchesPeak = viewsPeak * v.searchesPerView;
  const readsPeak = viewsPeak + searchesPeak;
  const clipsPerDay = v.uploadsPerDay * v.clipsPerVideo;
  const writesPeak = (clipsPerDay / DAY) * v.peakFactor;
  const readWrite = (views * (1 + v.searchesPerView)) / clipsPerDay;

  const verdict = searchesPeak > 2_000 ? 'cluster' : egressMonth > 10 * TIB ? 'cdn' : 'direct';

  return {
    out: { views, viewsPeak, egressDay, egressMonth, searchesPeak, readsPeak, writesPeak, readWrite },
    verdict,
  };
}

export function clipsCalculate(model: ClipsModel, values: Record<string, number>): ClipsResult {
  if (model === 'pipeline') return pipeline(values);
  if (model === 'storage') return storage(values);
  return delivery(values);
}
