import { migrate, type Design, type DesignSummary } from './model';

/**
 * Где живут проекты.
 *
 * Интерфейс асинхронный, хотя сейчас за ним браузерное хранилище: когда
 * появится бэкенд, его реализация встанет на место `LocalRepository`, и
 * интерфейсу не придётся меняться. Всё, что песочница знает о хранении, —
 * эти четыре метода.
 */
export interface DesignRepository {
  list(): Promise<DesignSummary[]>;
  load(id: string): Promise<Design | null>;
  save(design: Design): Promise<void>;
  remove(id: string): Promise<void>;
}

const PREFIX = 'why:playground:';
const INDEX = `${PREFIX}index`;

/**
 * Хранилище браузера может быть недоступно (приватное окно, запрет сайта).
 * Тогда проекты живут в памяти до перезагрузки, а не роняют песочницу.
 */
export class LocalRepository implements DesignRepository {
  private memory = new Map<string, string>();

  private get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  private set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      this.memory.set(key, value);
    }
  }

  private drop(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      this.memory.delete(key);
    }
  }

  private index(): DesignSummary[] {
    try {
      return JSON.parse(this.get(INDEX) ?? '[]') as DesignSummary[];
    } catch {
      return [];
    }
  }

  async list() {
    return this.index().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string) {
    const raw = this.get(PREFIX + id);
    if (!raw) return null;
    try {
      return migrate(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(design: Design) {
    this.set(PREFIX + design.id, JSON.stringify(design));
    const rest = this.index().filter((item) => item.id !== design.id);
    this.set(
      INDEX,
      JSON.stringify([...rest, { id: design.id, title: design.title, updatedAt: design.updatedAt }]),
    );
  }

  async remove(id: string) {
    this.drop(PREFIX + id);
    this.set(INDEX, JSON.stringify(this.index().filter((item) => item.id !== id)));
  }
}

/** Последний открытый проект — удобство, а не данные: потерять его не страшно. */
export const lastOpened = {
  get(): string | null {
    try {
      return localStorage.getItem(`${PREFIX}last`);
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      localStorage.setItem(`${PREFIX}last`, id);
    } catch {
      /* не критично */
    }
  },
};

export function exportFile(design: Design) {
  const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const name = design.title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'design';
  link.href = url;
  link.download = `${name}.sysdesign.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importFile(file: File): Promise<Design> {
  return migrate(JSON.parse(await file.text()));
}
