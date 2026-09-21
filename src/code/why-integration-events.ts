import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';
import { eventsWithPenalty, overdueSeed } from './why-ddd-seed.ts';
import posterSpec from './why-integration-events.poster.ts';

/**
 * Колода урока про межсервисные события.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Сервис тот же, что в главах про DDD: домен, порты и адаптеры достались от
 * них и помечены `seed`. Здесь появляется граница наружу: контракт, конверт,
 * перевод и приём чужих сообщений.
 */

/** Постер каталога: суть проблемы одной схемой. */
export const poster = posterSpec;

/** Обложка в каталоге: акварель — факт как есть на шине и треснувшая башня соседа. */
export const cover = 'covers/why-integration-events.svg';

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    /* Проблема: структура домена уехала на шину как есть. */
    leak: { open: 'invoice/infrastructure/postgres/outbox.go', view: 'file' },
    contract: { open: 'invoice/infrastructure/broker/contracts/v1/events.go', view: 'file' },
    envelope: { open: 'invoice/infrastructure/broker/contracts/v1/envelope.go', view: 'file' },
    translate: { open: 'invoice/infrastructure/broker/outbound.go', view: 'file' },
    /* Проблема вторая: нам тоже присылают, и присылают дважды. */
    inbound: { open: 'invoice/applications/payment/pay.go', view: 'file' },
    consume: { open: 'invoice/applications/payment/transport/consumer/received.go', view: 'file' },
    inbox: { open: 'invoice/infrastructure/postgres/inbox.go', view: 'file' },
    /* Шаг про версии контракта файлов не меняет: разговор о том же коде. */
    evolve: { view: 'file' },
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
      path: 'invoice/domains/invoice/uow.go',
      seed: true,
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
      path: 'invoice/domains/invoice/load.go',
      seed: true,
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
      seed: true,
      lang: 'go',
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

	return u.uow.Do(ctx, func(ctx context.Context) error {
		if err := u.invoices.Save(ctx, issued); err != nil {
			return err
		}

		return u.publisher.Publish(ctx, issued.Events()...)
	})
}
`,
    },
    {
      path: 'invoice/applications/payment/pay.go',
      seed: true,
      lang: 'go',
      code: `package payment

import (
	"context"

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

// {{ucPayRun}}
func (u *UseCase) Run(ctx context.Context, number invoice.Number) error {
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
    {
      path: 'invoice/infrastructure/postgres/invoices.go',
      seed: true,
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
      seed: true,
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
      edits: [
        {
          from: 'consume',
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
	// {{uowNested}}
	if _, ok := ctx.Value(txKey{}).(*sql.Tx); ok {
		return work(ctx)
	}

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
      ],
    },
    {
      path: 'invoice/infrastructure/postgres/outbox.go',
      seed: true,
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
		// {{outboxAsIs}}
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
      edits: [
        {
          from: 'translate',
          code: `package postgres

import (
	"context"
	"database/sql"
)

// {{outboxWhat}}
type Outbox struct {
	db *sql.DB
}

func NewOutbox(db *sql.DB) *Outbox {
	return &Outbox{db: db}
}

// {{outboxAppend}}
func (o *Outbox) Append(ctx context.Context, messageType string, key string, body []byte) error {
	// {{outboxRowKey}}
	_, err := conn(ctx, o.db).ExecContext(ctx, insertOutbox, messageType, key, body)

	return err
}
`,
        },
      ],
    },
    {
      path: 'invoice/infrastructure/broker/contracts/v1/events.go',
      from: 'contract',
      lang: 'go',
      code: `package v1

// {{intTypes}}
const (
	InvoiceIssuedType = "billing.invoice.issued.v1"
	InvoicePaidType   = "billing.invoice.paid.v1"
)

// {{intIssued}}
type InvoiceIssued struct {
	Number     string \`json:"number"\`
	Customer   string \`json:"customer"\`
	TotalMinor int64  \`json:"total_minor"\`
}

// {{intPaid}}
type InvoicePaid struct {
	Number string \`json:"number"\`
}
`,
    },
    {
      path: 'invoice/infrastructure/broker/contracts/v1/envelope.go',
      from: 'envelope',
      lang: 'go',
      code: `package v1

import (
	"encoding/json"
	"time"
)

// {{envWhat}}
type Envelope struct {
	ID         string          \`json:"id"\`
	Type       string          \`json:"type"\`
	OccurredAt time.Time       \`json:"occurred_at"\`
	// {{envKey}}
	Key     string          \`json:"key"\`
	Payload json.RawMessage \`json:"payload"\`
}
`,
    },
    {
      path: 'invoice/infrastructure/broker/publisher.go',
      from: 'translate',
      lang: 'go',
      code: `package broker

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"

	"billing/invoice/domains/invoice/events"
)

// {{pubAppender}}
type Appender interface {
	Append(ctx context.Context, messageType string, key string, body []byte) error
}

// {{pubWhat}}
type Publisher struct {
	rows Appender
}

func NewPublisher(rows Appender) *Publisher {
	return &Publisher{rows: rows}
}

// {{pubPublish}}
func (p *Publisher) Publish(ctx context.Context, facts ...events.Event) error {
	for _, fact := range facts {
		message, err := Contract(fact, uuid.NewString(), time.Now().UTC())

		// {{pubSkip}}
		if errors.Is(err, ErrInternalFact) {
			continue
		}

		if err != nil {
			return err
		}

		body, err := json.Marshal(message)
		if err != nil {
			return err
		}

		// {{pubAppend}}
		if err := p.rows.Append(ctx, message.Type, message.Key, body); err != nil {
			return err
		}
	}

	return nil
}
`,
    },
    {
      path: 'invoice/infrastructure/broker/outbound.go',
      from: 'translate',
      lang: 'go',
      code: `package broker

import (
	"encoding/json"
	"errors"
	"time"

	v1 "billing/invoice/infrastructure/broker/contracts/v1"
	"billing/invoice/domains/invoice/events"
)

// {{transInternal}}
var ErrInternalFact = errors.New("broker: fact is not published outside")

// {{transWhat}}
func Contract(fact events.Event, id string, at time.Time) (v1.Envelope, error) {
	var (
		messageType string
		key         string
		payload     any
	)

	switch event := fact.(type) {
	// {{transIssued}}
	case events.Issued:
		messageType = v1.InvoiceIssuedType
		key = event.Number
		payload = v1.InvoiceIssued{
			Number:     event.Number,
			Customer:   event.Customer,
			TotalMinor: event.Total.Get(),
		}
	case events.Paid:
		messageType = v1.InvoicePaidType
		key = event.Number
		payload = v1.InvoicePaid{Number: event.Number}
	// {{transSkip}}
	default:
		return v1.Envelope{}, ErrInternalFact
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return v1.Envelope{}, err
	}

	return v1.Envelope{
		ID:         id,
		Type:       messageType,
		OccurredAt: at,
		Key:        key,
		Payload:    body,
	}, nil
}
`,
    },
    {
      path: 'invoice/applications/payment/transport/consumer/received.go',
      from: 'consume',
      lang: 'go',
      code: `package consumer

import (
	"context"
	"encoding/json"
	"errors"

	v1 "billing/invoice/infrastructure/broker/contracts/v1"
	"billing/invoice/domains/invoice"
	"billing/invoice/applications/payment"
)

// {{inWhat}}
type PaymentReceived struct {
	InvoiceNumber string \`json:"invoice_number"\`
	AmountMinor   int64  \`json:"amount_minor"\`
}

// {{inInbox}}
type Inbox interface {
	Remember(ctx context.Context, id string) (bool, error)
}

// {{inDeps}}
type Handler struct {
	uow   invoice.UnitOfWork
	inbox Inbox
	pay   *payment.UseCase
}

func NewHandler(uow invoice.UnitOfWork, inbox Inbox, pay *payment.UseCase) *Handler {
	return &Handler{uow: uow, inbox: inbox, pay: pay}
}

// {{inHandle}}
func (h *Handler) Handle(ctx context.Context, message v1.Envelope) error {
	var received PaymentReceived
	if err := json.Unmarshal(message.Payload, &received); err != nil {
		return err
	}

	return h.uow.Do(ctx, func(ctx context.Context) error {
		// {{inFirstTime}}
		first, err := h.inbox.Remember(ctx, message.ID)
		if err != nil {
			return err
		}

		if !first {
			return nil
		}

		err = h.pay.Run(ctx, invoice.Number(received.InvoiceNumber))

		// {{inAlreadyPaid}}
		if errors.Is(err, invoice.ErrAlreadyPaid) {
			return nil
		}

		return err
	})
}
`,
    },
    {
      path: 'invoice/infrastructure/postgres/inbox.go',
      from: 'inbox',
      lang: 'go',
      code: `package postgres

import (
	"context"
	"database/sql"
)

// {{inboxWhat}}
type Inbox struct {
	db *sql.DB
}

func NewInbox(db *sql.DB) *Inbox {
	return &Inbox{db: db}
}

// {{inboxRemember}}
func (i *Inbox) Remember(ctx context.Context, id string) (bool, error) {
	result, err := conn(ctx, i.db).ExecContext(ctx, insertHandled, id)
	if err != nil {
		return false, err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}

	// {{inboxRows}}
	return rows == 1, nil
}
`,
    },
  ],
};

const deck: CodeDeck = [
  { id: 'leak' },
  { id: 'contract' },
  { id: 'envelope' },
  { id: 'translate' },
  { id: 'inbound' },
  { id: 'consume' },
  { id: 'inbox' },
  { id: 'evolve' },
  { id: 'files' },
];

export default deck;
