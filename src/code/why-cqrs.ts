import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';
import posterSpec from './why-cqrs.poster.ts';

/**
 * Колода урока про CQRS.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Сервис тот же, что в трёх главах про DDD: домен и сценарии достались от них
 * и помечены `seed`. Здесь появляются команда, хендлер под неё и запрос со
 * своей моделью чтения.
 */

/** Постер каталога: суть проблемы одной схемой. */
export const poster = posterSpec;

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    problem: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    command: { open: 'invoice/applications/issuing/command.go', view: 'file' },
    handler: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    query: { open: 'invoice/applications/views/card.go', view: 'file' },
    reading: { open: 'invoice/infrastructure/postgres/cards.go', view: 'file' },
    /* Шаг про разделение файлов не меняет: разговор о том же коде. */
    split: { view: 'file' },
    files: { view: 'both', standalone: true, wide: true, summary: true },
  },
  files: [
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
      code: `package events

import "billing/invoice/domains/invoice/vo"

// {{eventWhat}}
type Event interface {
	FactName() string
}

// {{eventIssued}}
type Issued struct {
	Number   string
	Customer string
	Total    vo.Money
}

func (Issued) FactName() string { return "invoice.issued" }

// {{eventPaid}}
type Paid struct {
	Number string
}

func (Paid) FactName() string { return "invoice.paid" }
`,
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
      path: 'invoice/applications/payment/pay.go',
      seed: true,
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
      path: 'invoice/applications/issuing/issue.go',
      seed: true,
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
          from: 'handler',
          code: `package issuing

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

// {{handleCmd}}
func (u *UseCase) Handle(ctx context.Context, cmd IssueInvoice) error {
	if err := cmd.Validate(); err != nil {
		return err
	}

	issued, err := invoice.Issue(cmd.Number, cmd.Customer, cmd.Lines, cmd.DueOn)
	if err != nil {
		return err
	}

	if err := u.invoices.Save(ctx, issued); err != nil {
		return err
	}

	return u.publisher.Publish(ctx, issued.Events()...)
}
`,
        },
      ],
    },
    {
      path: 'invoice/applications/issuing/command.go',
      from: 'command',
      lang: 'go',
      code: `package issuing

import (
	"errors"
	"time"

	"billing/invoice/domains/invoice"
)

// {{cmdWhat}}
type IssueInvoice struct {
	Number   invoice.Number
	Customer invoice.CustomerID
	Lines    []invoice.Line
	DueOn    time.Time
}

var ErrNoNumber = errors.New("issuing: invoice number is empty")

// {{cmdValidate}}
func (c IssueInvoice) Validate() error {
	if c.Number == "" {
		return ErrNoNumber
	}

	return nil
}
`,
    },
    {
      path: 'invoice/applications/views/card.go',
      from: 'query',
      lang: 'go',
      code: `package views

import (
	"context"

	"billing/invoice/domains/invoice"
)

// {{cardWhat}}
type Card struct {
	Number  string
	Total   int64
	Status  string
	Overdue bool
}

// {{queryWhat}}
type CardQuery struct {
	Number invoice.Number
}

// {{cardPort}}
type Cards interface {
	Card(ctx context.Context, query CardQuery) (Card, error)
}
`,
    },
    {
      path: 'invoice/infrastructure/postgres/cards.go',
      from: 'reading',
      lang: 'go',
      code: `package postgres

import (
	"context"
	"database/sql"

	"billing/invoice/applications/views"
	"billing/invoice/domains/invoice"
)

// {{cardsSQL}}
const selectCard = \`
SELECT number,
       total_minor,
       status,
       due_on < now() AND status <> 'paid' AS overdue
  FROM invoices
 WHERE number = $1\`

// {{cardsWhat}}
type Cards struct {
	db *sql.DB
}

func NewCards(db *sql.DB) *Cards {
	return &Cards{db: db}
}

// {{cardsRead}}
func (c *Cards) Card(ctx context.Context, query views.CardQuery) (views.Card, error) {
	var card views.Card

	// {{cardsScan}}
	err := c.db.QueryRowContext(ctx, selectCard, string(query.Number)).
		Scan(&card.Number, &card.Total, &card.Status, &card.Overdue)
	if err != nil {
		return views.Card{}, err
	}

	return card, nil
}
`,
    },
  ],
  dirs: [{ path: 'invoice/applications/overdue', seed: true }],
};

const deck: CodeDeck = [
  { id: 'problem' },
  { id: 'command' },
  { id: 'handler' },
  { id: 'query' },
  { id: 'reading' },
  { id: 'split' },
  { id: 'files' },
];

export default deck;
