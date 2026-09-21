import type { CodeDeck } from './types';
import posterSpec from './why-ddd-infrastructure.poster.ts';
import type { FileTreeSpec } from './tree';
import { eventsWithPenalty, overdueSeed } from './why-ddd-seed.ts';

/**
 * Колода пятой главы: сценарии и инфраструктура.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Домен достался от предыдущих глав целиком, вместе со сценарием просрочки:
 * файлы помечены `seed` и стоят в дереве с первого шага в том виде, в каком
 * их оставили главы про домен, доменные сервисы и спецификацию.
 */

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    issuing: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    paying: { open: 'invoice/applications/payment/pay.go', view: 'file' },
    /* Проблема первая: порты объявлены, а за ними ничего нет. */
    storage: { open: 'invoice/domains/invoice/repository.go', view: 'file' },
    restore: { open: 'invoice/domains/invoice/load.go', view: 'file' },
    repo: { open: 'invoice/infrastructure/postgres/invoices.go', view: 'file' },
    /* Проблема вторая: сохранили и опубликовали — а границы между ними нет. */
    broken: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    uow: { open: 'invoice/domains/invoice/uow.go', view: 'file' },
    transaction: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    outbox: { open: 'invoice/infrastructure/postgres/outbox.go', view: 'file' },
    /* Итог: дерево и файл рядом — по любому файлу можно щёлкнуть и прочитать. */
    files: { view: 'both', standalone: true, wide: true, summary: true },
  },
  files: [
    ...overdueSeed,
    {
      path: 'GLOSSARY.md',
      seed: true,
      lang: 'markdown',
    },
    {
      path: 'invoice/domains/invoice/invoice.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import (
	"time"

	"billing/invoice/domains/invoice/events"
	"billing/invoice/domains/invoice/vo"
)

// {{aggRoot}}
type Invoice struct {
	number   Number
	customer CustomerID
	lines    []Line
	total    vo.Money
	dueOn    time.Time
	status   Status
	facts    []events.Event
}

// {{aggIssue}}
func Issue(
	number Number,
	customer CustomerID,
	lines []Line,
	dueOn time.Time,
) (*Invoice, error) {
	if len(lines) == 0 {
		return nil, ErrNoLines
	}

	total := vo.NewMoney(0)
	for _, line := range lines {
		total = total.Add(line.Amount())
	}

	invoice := &Invoice{
		number:   number,
		customer: customer,
		// {{aggCopy}}
		lines:    append([]Line(nil), lines...),
		total:    total,
		dueOn:    dueOn,
		status:   StatusIssued,
	}

	// {{aggRecord}}
	invoice.facts = append(invoice.facts, events.Issued{
		Number:   string(number),
		Customer: string(customer),
		Total:    total,
	})

	return invoice, nil
}

// {{aggEvents}}
func (i *Invoice) Events() []events.Event { return i.facts }

func (i *Invoice) Total() vo.Money  { return i.total }
func (i *Invoice) DueOn() time.Time { return i.dueOn }
func (i *Invoice) Status() Status   { return i.status }
`,
    },
    {
      path: 'invoice/domains/invoice/paid.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import "billing/invoice/domains/invoice/events"

// {{aggPaid}}
func (i *Invoice) MarkPaid() error {
	if i.status == StatusPaid {
		return ErrAlreadyPaid
	}

	i.status = StatusPaid

	// {{aggRecord}}
	i.facts = append(i.facts, events.Paid{Number: string(i.number)})

	return nil
}
`,
    },
    {
      path: 'invoice/domains/invoice/events/event.go',
      seed: true,
      lang: 'go',
      code: eventsWithPenalty,
    },
    {
      path: 'invoice/domains/invoice/repository.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import "context"

// {{portRepo}}
type Repository interface {
	ByNumber(ctx context.Context, number Number) (*Invoice, error)
	Save(ctx context.Context, invoice *Invoice) error
}
`,
    },
    {
      path: 'invoice/domains/invoice/publisher.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import (
	"context"

	"billing/invoice/domains/invoice/events"
)

// {{portPublisher}}
type Publisher interface {
	Publish(ctx context.Context, facts ...events.Event) error
}
`,
    },
    {
      path: 'invoice/domains/invoice/vo/money.go',
      seed: true,
      lang: 'go',
      code: `package vo

// {{moneyMinor}}
type Money struct {
	minor int64
}

func NewMoney(minor int64) Money {
	return Money{minor: minor}
}

func (m Money) Add(other Money) Money {
	return Money{minor: m.minor + other.minor}
}

func (m Money) Equal(other Money) bool {
	return m.minor == other.minor
}

func (m Money) Get() int64 {
	return m.minor
}
`,
    },
    {
      path: 'invoice/applications/issuing/issue.go',
      from: 'issuing',
      lang: 'go',
      code: `package issuing

import (
	"context"
	"time"

	"billing/invoice/domains/invoice"
)

// {{ucDeps}}
type UseCase struct {
	invoices  invoice.Repository
	publisher invoice.Publisher
}

func New(invoices invoice.Repository, publisher invoice.Publisher) *UseCase {
	return &UseCase{invoices: invoices, publisher: publisher}
}

// {{ucIssueRun}}
func (u *UseCase) Run(
	ctx context.Context,
	number invoice.Number,
	customer invoice.CustomerID,
	lines []invoice.Line,
	dueOn time.Time,
) error {
	issued, err := invoice.Issue(number, customer, lines, dueOn)
	if err != nil {
		return err
	}

	if err := u.invoices.Save(ctx, issued); err != nil {
		return err
	}

	// {{ucPublish}}
	return u.publisher.Publish(ctx, issued.Events()...)
}
`,
      edits: [
        {
          from: 'transaction',
          code: `package issuing

import (
	"context"
	"time"

	"billing/invoice/domains/invoice"
)

// {{ucTxDeps}}
type UseCase struct {
	uow       invoice.UnitOfWork
	invoices  invoice.Repository
	publisher invoice.Publisher
}

func New(
	uow invoice.UnitOfWork,
	invoices invoice.Repository,
	publisher invoice.Publisher,
) *UseCase {
	return &UseCase{uow: uow, invoices: invoices, publisher: publisher}
}

// {{ucTxRun}}
func (u *UseCase) Run(
	ctx context.Context,
	number invoice.Number,
	customer invoice.CustomerID,
	lines []invoice.Line,
	dueOn time.Time,
) error {
	issued, err := invoice.Issue(number, customer, lines, dueOn)
	if err != nil {
		return err
	}

	// {{ucTxDo}}
	return u.uow.Do(ctx, func(ctx context.Context) error {
		if err := u.invoices.Save(ctx, issued); err != nil {
			return err
		}

		return u.publisher.Publish(ctx, issued.Events()...)
	})
}
`,
        },
      ],
    },
    {
      path: 'invoice/applications/payment/pay.go',
      from: 'paying',
      lang: 'go',
      code: `package payment

import (
	"context"

	"billing/invoice/domains/invoice"
)

// {{ucDeps}}
type UseCase struct {
	invoices  invoice.Repository
	publisher invoice.Publisher
}

func New(invoices invoice.Repository, publisher invoice.Publisher) *UseCase {
	return &UseCase{invoices: invoices, publisher: publisher}
}

// {{ucPayRun}}
func (u *UseCase) Run(ctx context.Context, number invoice.Number) error {
	paid, err := u.invoices.ByNumber(ctx, number)
	if err != nil {
		return err
	}

	if err := paid.MarkPaid(); err != nil {
		return err
	}

	if err := u.invoices.Save(ctx, paid); err != nil {
		return err
	}

	// {{ucPublish}}
	return u.publisher.Publish(ctx, paid.Events()...)
}
`,
    },
    {
      path: 'invoice/domains/invoice/load.go',
      from: 'restore',
      lang: 'go',
      code: `package invoice

import (
	"time"

	"billing/invoice/domains/invoice/vo"
)

// {{aggRestore}}
func Load(
	number Number,
	customer CustomerID,
	lines []Line,
	total vo.Money,
	dueOn time.Time,
	status Status,
) *Invoice {
	return &Invoice{
		number:   number,
		customer: customer,
		lines:    lines,
		total:    total,
		dueOn:    dueOn,
		status:   status,
	}
}
`,
    },
    {
      path: 'invoice/domains/invoice/uow.go',
      from: 'uow',
      lang: 'go',
      code: `package invoice

import "context"

// {{portUoW}}
type UnitOfWork interface {
	Do(ctx context.Context, work func(ctx context.Context) error) error
}
`,
    },
    {
      path: 'invoice/infrastructure/postgres/invoices.go',
      from: 'repo',
      lang: 'go',
      code: `package postgres

import (
	"context"
	"database/sql"
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/vo"
)

// {{repoWhat}}
type Invoices struct {
	db *sql.DB
}

func NewInvoices(db *sql.DB) *Invoices {
	return &Invoices{db: db}
}

// {{repoLoad}}
func (r *Invoices) ByNumber(ctx context.Context, number invoice.Number) (*invoice.Invoice, error) {
	var (
		customer string
		minor    int64
		dueOn    time.Time
		status   string
	)

	err := conn(ctx, r.db).
		QueryRowContext(ctx, selectInvoice, string(number)).
		Scan(&customer, &minor, &dueOn, &status)
	if err != nil {
		return nil, err
	}

	lines, err := r.lines(ctx, number)
	if err != nil {
		return nil, err
	}

	// {{repoRestore}}
	return invoice.Load(
		number,
		invoice.CustomerID(customer),
		lines,
		vo.NewMoney(minor),
		dueOn,
		invoice.Status(status),
	), nil
}

// {{repoSave}}
func (r *Invoices) Save(ctx context.Context, saved *invoice.Invoice) error {
	db := conn(ctx, r.db)

	if _, err := db.ExecContext(ctx, upsertInvoice, saved); err != nil {
		return err
	}

	_, err := db.ExecContext(ctx, replaceLines, saved)

	return err
}
`,
    },
    {
      path: 'invoice/infrastructure/postgres/uow.go',
      from: 'transaction',
      lang: 'go',
      code: `package postgres

import (
	"context"
	"database/sql"
)

type txKey struct{}

// {{uowWhat}}
type UnitOfWork struct {
	db *sql.DB
}

func NewUnitOfWork(db *sql.DB) *UnitOfWork {
	return &UnitOfWork{db: db}
}

// {{uowDo}}
func (u *UnitOfWork) Do(ctx context.Context, work func(ctx context.Context) error) error {
	tx, err := u.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	if err := work(context.WithValue(ctx, txKey{}, tx)); err != nil {
		// {{uowRollback}}
		_ = tx.Rollback()

		return err
	}

	return tx.Commit()
}

// {{uowConn}}
func conn(ctx context.Context, db *sql.DB) interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
} {
	if tx, ok := ctx.Value(txKey{}).(*sql.Tx); ok {
		return tx
	}

	return db
}
`,
    },
    {
      path: 'invoice/infrastructure/postgres/outbox.go',
      from: 'outbox',
      lang: 'go',
      code: `package postgres

import (
	"context"
	"database/sql"
	"encoding/json"

	"billing/invoice/domains/invoice/events"
)

// {{outboxWhat}}
type Outbox struct {
	db *sql.DB
}

func NewOutbox(db *sql.DB) *Outbox {
	return &Outbox{db: db}
}

// {{outboxPublish}}
func (o *Outbox) Publish(ctx context.Context, facts ...events.Event) error {
	db := conn(ctx, o.db)

	for _, event := range facts {
		body, err := json.Marshal(event)
		if err != nil {
			return err
		}

		// {{outboxRow}}
		if _, err := db.ExecContext(ctx, insertOutbox, event.FactName(), body); err != nil {
			return err
		}
	}

	return nil
}
`,
    },
  ],
};

/** Постер каталога: суть главы одной схемой. */
export const poster = posterSpec;

const deck: CodeDeck = [
  { id: 'issuing' },
  { id: 'paying' },
  { id: 'storage' },
  { id: 'restore' },
  { id: 'repo' },
  { id: 'broken' },
  { id: 'uow' },
  { id: 'transaction' },
  { id: 'outbox' },
  { id: 'files' },
];

export default deck;

/** Обложка в каталоге: акварель, public/covers/why-ddd-infrastructure.svg (scripts/covers/build.py). */
export const cover = 'covers/why-ddd-infrastructure.svg';
