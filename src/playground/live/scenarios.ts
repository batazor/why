import { db, isCloudId, must } from './db';
import type { Workspace } from './workspaces';
import { emptyBoard, emptySession, emptyTraining, migrate, type Design, type DesignSummary, type Scenario } from '../model';
import type { DesignRepository } from '../storage';

// ─── Сценарии ───────────────────────────────────────────────────────────────

/** Открытая часть сценария — то, что увидит и кандидат. */
function publicRow(design: Design) {
  return {
    title: design.title,
    task: design.task,
    task_source: design.taskSource,
    calc: design.calc,
    allow_checks: design.scenario.allowChecks,
    format_version: design.version,
  };
}

function privateContent(design: Design) {
  const { allowChecks: _shownToCandidate, ...content } = design.scenario;
  return content;
}

export interface ScenarioRow {
  id: string;
  title: string;
  task: string;
  task_source: string;
  calc: Design['calc'];
  allow_checks: boolean;
  format_version: number;
  created_at: string;
  updated_at: string;
}

export function fromScenario(row: ScenarioRow, content: Partial<Scenario> | null): Design {
  return migrate({
    version: row.format_version,
    id: row.id,
    title: row.title,
    task: row.task,
    taskSource: row.task_source,
    calc: row.calc,
    scenario: { ...(content ?? {}), allowChecks: row.allow_checks },
    ...emptyBoard(),
    session: emptySession(),
    training: emptyTraining(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * Сценарии пространства.
 *
 * Хранится только то, что готовит автор: задание, настройки, сценарий с
 * эталоном. Доска кандидата и прохождение принадлежат собеседованию, а не
 * сценарию, поэтому сюда не пишутся.
 *
 * Автосохранение песочницы зовёт save на любую правку, в том числе на
 * открытую интервьюером подсказку. Интервьюеру писать сценарий нельзя, да и
 * незачем: запись уходит, только если изменилась сама сохраняемая часть.
 */
export class CloudRepository implements DesignRepository {
  private saved = new Map<string, string>();

  constructor(private workspace: Workspace) {}

  async list(): Promise<DesignSummary[]> {
    const rows = must(
      await db()
        .from('scenarios')
        .select('id, title, updated_at')
        .eq('workspace_id', this.workspace.id)
        .order('updated_at', { ascending: false }),
    ) as { id: string; title: string; updated_at: string }[];
    return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, cloud: true }));
  }

  async load(id: string): Promise<Design | null> {
    if (!isCloudId(id)) return null;
    const row = must(await db().from('scenarios').select('*').eq('id', id).maybeSingle()) as ScenarioRow | null;
    if (!row) return null;
    const secret = must(
      await db().from('scenario_private').select('content').eq('scenario_id', id).maybeSingle(),
    ) as { content: Partial<Scenario> } | null;
    const design = fromScenario(row, secret?.content ?? null);
    this.saved.set(id, JSON.stringify([publicRow(design), privateContent(design)]));
    return design;
  }

  async save(design: Design): Promise<void> {
    const snapshot = JSON.stringify([publicRow(design), privateContent(design)]);
    if (this.saved.get(design.id) === snapshot) return;
    must(
      await db()
        .from('scenarios')
        .upsert({ id: design.id, workspace_id: this.workspace.id, ...publicRow(design) }),
    );
    must(await db().from('scenario_private').upsert({ scenario_id: design.id, content: privateContent(design) }));
    this.saved.set(design.id, snapshot);
  }

  async remove(id: string): Promise<void> {
    must(await db().from('scenarios').delete().eq('id', id));
    this.saved.delete(id);
  }
}

/**
 * Браузер и пространство одним списком.
 *
 * Войдя, человек не теряет того, что рисовал до входа: локальные проекты
 * остаются в списке рядом со сценариями пространства. Куда писать, видно по
 * id; новые проекты создаются в пространстве.
 */
export class HybridRepository implements DesignRepository {
  constructor(
    private local: DesignRepository,
    private cloud: CloudRepository,
  ) {}

  newId() {
    return crypto.randomUUID();
  }

  async list() {
    const [cloud, local] = await Promise.all([this.cloud.list(), this.local.list()]);
    return [...cloud, ...local];
  }

  load(id: string) {
    return isCloudId(id) ? this.cloud.load(id) : this.local.load(id);
  }

  save(design: Design) {
    return isCloudId(design.id) ? this.cloud.save(design) : this.local.save(design);
  }

  remove(id: string) {
    return isCloudId(id) ? this.cloud.remove(id) : this.local.remove(id);
  }
}

export interface ScenarioSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Сценарии пространства — кабинету: кого звать на что, и не отстал ли снимок. */
export async function listScenarios(workspaceId: string): Promise<ScenarioSummary[]> {
  const rows = must(
    await db().from('scenarios').select('id, title, updated_at').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }),
  ) as { id: string; title: string; updated_at: string }[];
  return rows.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }));
}

/** Когда сценарий на сервере меняли последний раз — сверить со снимками собеседований. */
export async function scenarioUpdatedAt(id: string): Promise<string | null> {
  const row = must(await db().from('scenarios').select('updated_at').eq('id', id).maybeSingle()) as { updated_at: string } | null;
  return row?.updated_at ?? null;
}
