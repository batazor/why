import type { CodeDeck } from './types';
import { inherit, type FileTreeSpec } from './tree.ts';
import * as prev from './why-cqrs.ts';
import posterSpec from './why-aggregate-versioning.poster.ts';

/**
 * Колода урока про версию агрегата.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Сервис тот же, что в главах про DDD: дерево унаследовано от главы про CQRS
 * (`inherit`). Здесь у счёта появляется версия, у порта — конфликт,
 * а у сценария — повтор.
 */

/** Постер каталога: суть проблемы одной схемой. */
export const poster = posterSpec;

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    /* Проблема: два вызова прочитали одно состояние, записал последний. */
    lost: { open: 'invoice/applications/payment/pay.go', view: 'file' },
    /* Проблема вторая: блокировка строки лечит не всё и стоит дорого. */
    locks: { open: 'invoice/infrastructure/postgres/invoices.go', view: 'file' },
    version: { open: 'invoice/domains/invoice/invoice.go', view: 'file' },
    conflict: { open: 'invoice/domains/invoice/repository.go', view: 'file' },
    update: { open: 'invoice/infrastructure/postgres/invoices.go', view: 'file' },
    retry: { open: 'invoice/applications/payment/pay.go', view: 'file' },
    /* Шаг про границу наружу файлов не меняет: разговор о том же коде. */
    handover: { view: 'file' },
    /* Итог: дерево и файл рядом — по любому файлу можно щёлкнуть и прочитать. */
    files: { view: 'both', standalone: true, wide: true, summary: true },
  },
  files: [
    ...inherit(
      prev.tree,
      {
        'invoice/domains/invoice/invoice.go': [
          {
            from: 'version',
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
	// {{aggVersion}}
	version  int
	facts    []events.Event
}

// {{aggIssueVer}}
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

// {{aggVersionGet}}
func (i *Invoice) Version() int { return i.version }
`,
          },
        ],
        'invoice/domains/invoice/repository.go': [
          {
            from: 'conflict',
            code: `package invoice

import (
	"context"
	"errors"
)

// {{errConflict}}
var ErrConflict = errors.New("invoice: invoice changed since it was loaded")

// {{portRepo}}
type Repository interface {
	ByNumber(ctx context.Context, number Number) (*Invoice, error)
	// {{portSaveConflict}}
	Save(ctx context.Context, invoice *Invoice) error
}
`,
          },
        ],
        'invoice/domains/invoice/load.go': [
          {
            from: 'version',
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
	// {{aggRestoreVer}}
	version int,
) *Invoice {
	return &Invoice{
		number:   number,
		customer: customer,
		lines:    lines,
		total:    total,
		dueOn:    dueOn,
		status:   status,
		version:  version,
	}
}
`,
          },
        ],
        'invoice/applications/payment/pay.go': [
          {
            from: 'retry',
            code: `package payment

import (
	"context"
	"errors"

	"billing/invoice/domains/invoice"
)

// {{ucAttempts}}
const attempts = 3

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

// {{ucRetryRun}}
func (u *UseCase) Run(ctx context.Context, number invoice.Number) error {
	var err error

	for attempt := 0; attempt < attempts; attempt++ {
		err = u.pay(ctx, number)

		// {{ucRetryConflict}}
		if errors.Is(err, invoice.ErrConflict) {
			continue
		}

		return err
	}

	return err
}

// {{ucRetryOnce}}
func (u *UseCase) pay(ctx context.Context, number invoice.Number) error {
	return u.uow.Do(ctx, func(ctx context.Context) error {
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

		return u.publisher.Publish(ctx, paid.Events()...)
	})
}
`,
          },
        ],
        'invoice/infrastructure/postgres/invoices.go': [
          {
            from: 'update',
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

// {{repoLoadVer}}
func (r *Invoices) ByNumber(ctx context.Context, number invoice.Number) (*invoice.Invoice, error) {
	var (
		customer string
		minor    int64
		dueOn    time.Time
		status   string
		version  int
	)

	err := conn(ctx, r.db).
		QueryRowContext(ctx, selectInvoice, string(number)).
		Scan(&customer, &minor, &dueOn, &status, &version)
	if err != nil {
		return nil, err
	}

	lines, err := r.lines(ctx, number)
	if err != nil {
		return nil, err
	}

	return invoice.Load(
		number,
		invoice.CustomerID(customer),
		lines,
		vo.NewMoney(minor),
		dueOn,
		invoice.Status(status),
		version,
	), nil
}

// {{repoSaveVer}}
func (r *Invoices) Save(ctx context.Context, saved *invoice.Invoice) error {
	db := conn(ctx, r.db)

	// {{repoInsert}}
	if saved.Version() == 0 {
		if _, err := db.ExecContext(ctx, insertInvoice, saved); err != nil {
			return err
		}

		_, err := db.ExecContext(ctx, replaceLines, saved)

		return err
	}

	// {{repoUpdateVer}}
	result, err := db.ExecContext(ctx, updateInvoice, saved, saved.Version())
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}

	// {{repoNoRows}}
	if rows == 0 {
		return invoice.ErrConflict
	}

	_, err = db.ExecContext(ctx, replaceLines, saved)

	return err
}
`,
          },
        ],
      },
    ),
  ],
};

const deck: CodeDeck = [
  { id: 'lost' },
  { id: 'locks' },
  { id: 'version' },
  { id: 'conflict' },
  { id: 'update' },
  { id: 'retry' },
  { id: 'handover' },
  { id: 'files' },
];

export default deck;

/** Обложка в каталоге: акварель, public/covers/why-aggregate-versioning.svg (scripts/covers/build.py). */
export const cover = 'covers/why-aggregate-versioning.svg';
