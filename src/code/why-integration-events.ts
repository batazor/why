import type { CodeDeck } from './types';
import { inherit, type FileTreeSpec } from './tree.ts';
import * as prev from './why-aggregate-versioning.ts';
import posterSpec from './why-integration-events.poster.ts';

/**
 * Колода урока про межсервисные события.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Сервис тот же, что в главах про DDD: дерево унаследовано от главы про
 * версию агрегата (`inherit`). Здесь появляется граница наружу: контракт, конверт,
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
    ...inherit(
      prev.tree,
      {
        'invoice/cmd/api/wire.go': [
          {
            from: 'translate',
            code: `//go:build wireinject

package main

import (
	"database/sql"

	"github.com/google/wire"

	"billing/invoice/domains/invoice"
	"billing/invoice/infrastructure/broker"
	"billing/invoice/infrastructure/postgres"
	"billing/invoice/applications/issuing"
	issuinghttp "billing/invoice/applications/issuing/transport/http"
)

// {{wireSet}}
var adapters = wire.NewSet(
	postgres.NewUnitOfWork,
	postgres.NewInvoices,
	postgres.NewOutbox,
	broker.NewPublisher,
	// {{wireBind}}
	wire.Bind(new(invoice.UnitOfWork), new(*postgres.UnitOfWork)),
	wire.Bind(new(invoice.Repository), new(*postgres.Invoices)),
	// {{wirePublisher}}
	wire.Bind(new(invoice.Publisher), new(*broker.Publisher)),
	wire.Bind(new(broker.Appender), new(*postgres.Outbox)),
)

// {{wireInject}}
func initHandler(dsn string) (*issuinghttp.Handler, error) {
	wire.Build(openDB, adapters, issuing.New, issuinghttp.NewHandler)

	// {{wireStub}}
	return nil, nil
}

func openDB(dsn string) (*sql.DB, error) {
	return sql.Open("postgres", dsn)
}
`,
          },
        ],
        'invoice/infrastructure/postgres/uow.go': [
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
        'invoice/infrastructure/postgres/outbox.go': [
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
        'invoice/infrastructure/postgres/outbox.go': `package postgres

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
      },
    ),
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
