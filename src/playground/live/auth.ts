import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { guestSignInAllowed, supabase } from './client';

/**
 * Вход через Google — или гостем, по одному имени. Без учётки в песочницу
 * не попадают (кроме кандидата по приглашению): на входе стоит заставка с
 * этими двумя способами.
 *
 * Имя и аватар берутся из профиля Google: интервьюеру важно видеть, что в
 * комнате именно тот человек, которого звали, а не «Гость 2».
 *
 * Гость — анонимный пользователь Supabase с именем в метаданных. Для сервера
 * он такой же вошедший, как все: те же политики, свои пространство и
 * собеседования. Почты у него нет, поэтому приглашение на почту он не примет —
 * только приглашение по ссылке. Выйдя, гость теряет учётку насовсем.
 */

export interface Person {
  id: string;
  name: string;
  avatar?: string;
}

function person(user: User): Person {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    name: (meta.full_name as string) || (meta.name as string) || user.email || '—',
    avatar: (meta.avatar_url as string) || (meta.picture as string) || undefined,
  };
}

export function useAuth() {
  const client = supabase();
  const [me, setMe] = useState<Person | null>(null);
  /** Пока клиент не дочитал сессию (и не обменял ?code= после Google), кнопку входа не показываем. */
  const [ready, setReady] = useState(!client);
  const [guestAllowed, setGuestAllowed] = useState(false);

  useEffect(() => {
    if (client) guestSignInAllowed().then(setGuestAllowed);
  }, [client]);

  /**
   * Токен обновляется раз в час, и на каждое обновление приходит новый
   * объект пользователя. Тот же человек должен остаться тем же объектом —
   * иначе комната переподключалась бы на каждое обновление токена.
   */
  const same = (next: Person | null) => (previous: Person | null) =>
    previous && next && previous.id === next.id && previous.name === next.name && previous.avatar === next.avatar
      ? previous
      : next;

  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setMe(same(data.session ? person(data.session.user) : null));
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setMe(same(session ? person(session.user) : null));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  /** Возвращаемся на тот же адрес: в нём роль и комната. */
  const signIn = useCallback(async () => {
    const back = new URL(location.href);
    back.hash = '';
    await client?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back.toString() } });
  }, [client]);

  /** Вход гостем. Ошибку возвращает текстом — её показывают рядом с полем имени. */
  const signInAsGuest = useCallback(
    async (name: string): Promise<string | null> => {
      if (!client) return 'Supabase is not configured';
      const { error } = await client.auth.signInAnonymously({ options: { data: { name } } });
      return error ? error.message : null;
    },
    [client],
  );

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
  }, [client]);

  return { enabled: Boolean(client), ready, me, guestAllowed, signIn, signInAsGuest, signOut };
}
