/**
 * Роли песочницы и что каждой разрешено.
 *
 * Права собраны в одну таблицу, а не разбросаны по условиям в интерфейсе:
 * когда появится бэкенд, та же таблица станет проверкой на сервере, и
 * интерфейс с сервером не разъедутся.
 */

export const ROLES = ['author', 'interviewer', 'candidate', 'trainee'] as const;
export type Role = (typeof ROLES)[number];

export type Tab =
  | 'task'
  | 'scenario'
  | 'conduct'
  | 'score'
  | 'signals'
  | 'train'
  | 'req'
  | 'api'
  | 'calc'
  | 'inspect'
  | 'check';

export interface Permissions {
  /** Какую доску показывает полотно: эталон автора или ответ кандидата. */
  board: 'reference' | 'answer';
  /** Можно ли менять доску на полотне. */
  editBoard: boolean;
  editTask: boolean;
  /** Управление проектами: новый, копия, удаление, импорт, пример. */
  manageProjects: boolean;
  /** Может переключиться между ответом кандидата и эталоном. */
  compare: boolean;
  /** Задание у всех висит карточкой над полотном; вкладка «Задача» — только чтобы его править. */
  tabs: Tab[];
}

export const PERMISSIONS: Record<Role, Permissions> = {
  author: {
    board: 'reference',
    editBoard: true,
    editTask: true,
    manageProjects: true,
    compare: false,
    tabs: ['task', 'scenario', 'req', 'api', 'calc', 'inspect', 'check'],
  },
  interviewer: {
    board: 'answer',
    editBoard: false,
    editTask: false,
    manageProjects: false,
    compare: true,
    tabs: ['conduct', 'score', 'signals', 'req', 'api', 'calc', 'inspect', 'check'],
  },
  candidate: {
    board: 'answer',
    editBoard: true,
    editTask: false,
    manageProjects: false,
    compare: false,
    tabs: ['req', 'api', 'calc', 'inspect', 'check'],
  },
  /**
   * Тренировка: тот же кандидат, но интервьюера играет песочница.
   *
   * Задачу выбирает сам — отсюда manageProjects; эталон не показывается до
   * конца прохождения — отсюда compare: false. Вкладки «Проверки» нет: её
   * место занимает «Тренировка», а два списка замечаний рядом только путают.
   */
  trainee: {
    board: 'answer',
    editBoard: true,
    editTask: false,
    manageProjects: true,
    compare: false,
    tabs: ['train', 'req', 'api', 'calc', 'inspect'],
  },
};

const KEY = 'why:playground:role';

/**
 * Роль берётся из адреса (?role=candidate), иначе из прошлого захода: ссылку
 * с ролью удобно отдать кандидату, а своя роль запоминается.
 */
export function initialRole(): Role {
  try {
    const fromUrl = new URL(location.href).searchParams.get('role');
    if (ROLES.includes(fromUrl as Role)) return fromUrl as Role;
    const saved = localStorage.getItem(KEY);
    if (ROLES.includes(saved as Role)) return saved as Role;
  } catch {
    /* хранилище недоступно — роль по умолчанию */
  }
  return 'author';
}

export function rememberRole(role: Role) {
  try {
    localStorage.setItem(KEY, role);
    const url = new URL(location.href);
    url.searchParams.set('role', role);
    history.replaceState(null, '', url);
  } catch {
    /* не критично */
  }
}
