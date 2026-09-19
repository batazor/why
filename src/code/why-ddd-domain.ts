import type { CodeDeck } from './types';
import posterSpec from './why-ddd-domain.poster.ts';
import type { FileTreeSpec } from './tree';

/**
 * Колода второй части: домен в коде.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Схем здесь нет: часть целиком живёт в редакторе. Словарь и каталоги модулей
 * достались от первой части — они помечены `seed` и новыми не считаются.
 */

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    domain: { open: 'invoice/domains/invoice/invoice.go', view: 'file' },
    /* Шаг про проблемы файл не меняет: разговор о том же коде, что на экране.
       Подсвечены строки, про которые этот разговор: открытые поля, `float64`
       в деньгах, состояние строкой и итог параметром. */
    problems: { view: 'file', lines: [7, 8, 9, 10, 11, 12, 17, 25, 32] },
    money: { open: 'invoice/domains/invoice/vo/money.go', view: 'file' },
    values: { open: 'invoice/domains/invoice/invoice.go', view: 'file' },
    /* Шаг про агрегат смотрит на тот же файл: правка уже приехала. */
    aggregate: { view: 'file' },
    transition: { open: 'invoice/domains/invoice/paid.go', view: 'file' },
    port: { open: 'invoice/domains/invoice/repository.go', view: 'file' },
    events: { open: 'invoice/domains/invoice/events/event.go', view: 'file' },
    recording: { open: 'invoice/domains/invoice/paid.go', view: 'file' },
    publisher: { open: 'invoice/domains/invoice/publisher.go', view: 'file' },
    /* Итог: дерево и файл рядом — по любому файлу можно щёлкнуть и прочитать. */
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
      from: 'domain',
      lang: 'go',
      code: `package invoice

import "time"

// {{naiveShape}}
type Invoice struct {
	Number     string
	CustomerID string
	Lines      []Line
	Total      float64
	DueOn      time.Time
	Status     string
}

type Line struct {
	Quantity int
	Price    float64
}

// {{naiveIssue}}
func Issue(
	number string,
	customer string,
	lines []Line,
	total float64,
	dueOn time.Time,
) *Invoice {
	return &Invoice{
		Number:     number,
		CustomerID: customer,
		Lines:      lines,
		Total:      total,
		DueOn:      dueOn,
		Status:     "issued",
	}
}
`,
      edits: [
        {
          from: 'values',
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

	return &Invoice{
		number:   number,
		customer: customer,
		// {{aggCopy}}
		lines:    append([]Line(nil), lines...),
		total:    total,
		dueOn:    dueOn,
		status:   StatusIssued,
	}, nil
}

func (i *Invoice) Total() vo.Money  { return i.total }
func (i *Invoice) DueOn() time.Time { return i.dueOn }
func (i *Invoice) Status() Status   { return i.status }
`,
        },
        {
          from: 'recording',
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
      ],
    },
    {
      path: 'invoice/domains/invoice/paid.go',
      from: 'transition',
      lang: 'go',
      code: `package invoice

import "billing/invoice/domains/invoice/events"

// {{aggPaid}}
func (i *Invoice) MarkPaid() error {
	if i.status == StatusPaid {
		return ErrAlreadyPaid
	}

	i.status = StatusPaid

	return nil
}
`,
      edits: [
        {
          from: 'recording',
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
      ],
    },
    {
      path: 'invoice/domains/invoice/events/event.go',
      from: 'events',
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
      from: 'port',
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
      from: 'publisher',
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
      from: 'money',
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
  ],
  /** Каталоги модулей завела первая часть. */
  dirs: [
    { path: 'invoice/applications/issuing', seed: true },
    { path: 'invoice/applications/payment', seed: true },
    { path: 'invoice/applications/overdue', seed: true },
  ],
};

/** Постер каталога: суть главы одной схемой. */
export const poster = posterSpec;

const deck: CodeDeck = [
  { id: 'domain' },
  { id: 'problems' },
  { id: 'money' },
  { id: 'values' },
  { id: 'aggregate' },
  { id: 'transition' },
  { id: 'port' },
  { id: 'events' },
  { id: 'recording' },
  { id: 'publisher' },
  { id: 'files' },
];

export default deck;

/** Обложка в каталоге: акварель, public/covers/why-ddd-domain.svg (scripts/covers/build.py). */
export const cover = 'covers/why-ddd-domain.svg';
