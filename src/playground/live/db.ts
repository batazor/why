import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Person } from './auth';

/**
 * Общее для всех запросов к базе: клиент, разбор ответа, uuid.
 *
 * Проект песочницы (Design) — один документ, а на сервере он разложен по
 * таблицам так, чтобы права резали его по швам: задание отдельно от эталона,
 * доска кандидата отдельно от оценок интервьюера. Модули рядом собирают
 * документ из строк и раскладывают обратно — панелям о таблицах знать не
 * нужно. Разложены они так же, как схема: пространство и команда
 * (workspaces), сценарии (scenarios), собеседования (interviews), сравнение
 * (calibration), ссылки и приглашения (links). Здесь — только общее.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Проекты пространства — с uuid, проекты браузера — `d_…`: по id видно, где проект живёт. */
export const isCloudId = (id: string) => UUID.test(id);

export function db(): SupabaseClient {
  const client = supabase();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/** Ошибка запроса — исключение: песочница покажет «не сохранено», а не промолчит. */
export function must<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

export interface ProfileRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export const toPerson = (row: ProfileRow): Person => ({ id: row.id, name: row.name || row.email, avatar: row.avatar_url ?? undefined });
