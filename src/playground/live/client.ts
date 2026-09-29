import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Клиент Supabase — единственная точка, где песочница знает про бэкенд.
 *
 * Адрес и публичный ключ приходят из окружения сборки (PUBLIC_SUPABASE_URL,
 * PUBLIC_SUPABASE_ANON_KEY). Публичный ключ секретом не является: он и так
 * виден в браузере, а что по нему можно — решают политики RLS на сервере.
 *
 * Без переменных совместной работы просто нет: песочница остаётся локальной,
 * как раньше, и ни одна кнопка про вход не показывается.
 */

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client =
    URL_ && KEY
      ? createClient(URL_, KEY, {
          auth: {
            /*
             * PKCE, а не implicit: implicit возвращает токены в hash, а hash
             * у песочницы занят присланным сценарием (#s=…). PKCE приносит
             * ?code=, клиент сам обменивает его и убирает из адреса.
             */
            flowType: 'pkce',
            storageKey: 'why:playground:auth',
          },
        })
      : null;
  return client;
}

export const liveEnabled = () => supabase() !== null;
