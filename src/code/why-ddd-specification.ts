import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';
import posterSpec from './why-ddd-specification.poster.ts';

/**
 * Колода четвёртой главы: спецификация.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Домен и модуль просрочки достались от предыдущих глав и помечены `seed`.
 * Здесь предикат «просрочен» получает имя и место, а сценарий начинает
 * спрашивать у него, а не предполагать.
 */

/** Постер каталога: суть проблемы одной схемой. */
export const poster = posterSpec;

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    problem: { open: 'invoice/applications/overdue/charge.go', view: 'file' },
    spec: { open: 'invoice/domains/invoice/rules/overdue.go', view: 'file' },
    usage: { open: 'invoice/applications/overdue/charge.go', view: 'file' },
    combine: { open: 'invoice/domains/invoice/rules/overdue.go', view: 'file' },
    /* Шаг про цену файлов не меняет: разговор о том же коде. */
    cost: { view: 'file' },
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
      path: 'invoice/domains/invoice/charged.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import (
	"billing/invoice/domains/invoice/events"
	"billing/invoice/domains/invoice/vo"
)

// {{aggCharge}}
func (i *Invoice) ChargePenalty(amount vo.Money) error {
	if i.status == StatusPaid {
		return ErrAlreadyPaid
	}

	if amount.Equal(vo.NewMoney(0)) {
		return nil
	}

	i.lines = append(i.lines, Line{Quantity: 1, Price: amount})
	i.total = i.total.Add(amount)

	// {{aggRecord}}
	i.facts = append(i.facts, events.PenaltyCharged{
		Number: string(i.number),
		Amount: amount,
	})

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

// {{eventPenalty}}
type PenaltyCharged struct {
	Number string
	Amount vo.Money
}

func (PenaltyCharged) FactName() string { return "invoice.penalty_charged" }
`,
    },
    {
      path: 'invoice/domains/invoice/calendar.go',
      seed: true,
      lang: 'go',
      code: `package invoice

import "time"

// {{svcCalendar}}
type Calendar interface {
	Workdays(from time.Time, to time.Time) int
}
`,
    },
    {
      path: 'invoice/domains/invoice/services/penalty/penalty.go',
      seed: true,
      lang: 'go',
      code: `package penalty

import (
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/vo"
)

// {{svcPenalty}}
func Amount(
	overdue *invoice.Invoice,
	now time.Time,
	perWorkday vo.Money,
	calendar invoice.Calendar,
) vo.Money {
	// {{svcFromAggregate}}
	late := calendar.Workdays(overdue.DueOn(), now)
	if late <= 0 {
		return vo.NewMoney(0)
	}

	return vo.NewMoney(perWorkday.Get() * int64(late))
}
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
      path: 'invoice/domains/invoice/rules/overdue.go',
      from: 'spec',
      lang: 'go',
      code: `package rules

import (
	"time"

	"billing/invoice/domains/invoice"
)

// {{specWhat}}
type Overdue struct {
	now      time.Time
	calendar invoice.Calendar
}

func NewOverdue(now time.Time, calendar invoice.Calendar) Overdue {
	return Overdue{now: now, calendar: calendar}
}

// {{specSatisfied}}
func (o Overdue) IsSatisfiedBy(inv *invoice.Invoice) bool {
	if inv.Status() == invoice.StatusPaid {
		return false
	}

	return o.calendar.Workdays(inv.DueOn(), o.now) > 0
}
`,
      edits: [
        {
          from: 'combine',
          code: `package rules

import (
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/vo"
)

// {{specIface}}
type Specification interface {
	IsSatisfiedBy(inv *invoice.Invoice) bool
}

// {{specWhat}}
type Overdue struct {
	now      time.Time
	calendar invoice.Calendar
}

func NewOverdue(now time.Time, calendar invoice.Calendar) Overdue {
	return Overdue{now: now, calendar: calendar}
}

// {{specSatisfied}}
func (o Overdue) IsSatisfiedBy(inv *invoice.Invoice) bool {
	if inv.Status() == invoice.StatusPaid {
		return false
	}

	return o.calendar.Workdays(inv.DueOn(), o.now) > 0
}

// {{specBig}}
type OverBudget struct {
	limit vo.Money
}

func NewOverBudget(limit vo.Money) OverBudget {
	return OverBudget{limit: limit}
}

func (b OverBudget) IsSatisfiedBy(inv *invoice.Invoice) bool {
	return inv.Total().Get() > b.limit.Get()
}

// {{specAll}}
type All struct {
	specs []Specification
}

func AllOf(specs ...Specification) All {
	return All{specs: specs}
}

func (a All) IsSatisfiedBy(inv *invoice.Invoice) bool {
	for _, spec := range a.specs {
		if !spec.IsSatisfiedBy(inv) {
			return false
		}
	}

	return true
}
`,
        },
      ],
    },
    {
      path: 'invoice/applications/overdue/charge.go',
      seed: true,
      lang: 'go',
      code: `package overdue

import (
	"context"
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/services/penalty"
	"billing/invoice/domains/invoice/vo"
)

// {{ucOverdueDeps}}
type UseCase struct {
	invoices   invoice.Repository
	publisher  invoice.Publisher
	calendar   invoice.Calendar
	perWorkday vo.Money
}

func New(
	invoices invoice.Repository,
	publisher invoice.Publisher,
	calendar invoice.Calendar,
	perWorkday vo.Money,
) *UseCase {
	return &UseCase{
		invoices:   invoices,
		publisher:  publisher,
		calendar:   calendar,
		perWorkday: perWorkday,
	}
}

// {{ucOverdueRun}}
func (u *UseCase) Run(ctx context.Context, number invoice.Number, now time.Time) error {
	overdue, err := u.invoices.ByNumber(ctx, number)
	if err != nil {
		return err
	}

	// {{ucOverdueCall}}
	amount := penalty.Amount(overdue, now, u.perWorkday, u.calendar)

	// {{ucOverdueApply}}
	if err := overdue.ChargePenalty(amount); err != nil {
		return err
	}

	if err := u.invoices.Save(ctx, overdue); err != nil {
		return err
	}

	return u.publisher.Publish(ctx, overdue.Events()...)
}
`,
      edits: [
        {
          from: 'usage',
          code: `package overdue

import (
	"context"
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/rules"
	"billing/invoice/domains/invoice/services/penalty"
	"billing/invoice/domains/invoice/vo"
)

// {{ucOverdueDeps}}
type UseCase struct {
	invoices   invoice.Repository
	publisher  invoice.Publisher
	calendar   invoice.Calendar
	perWorkday vo.Money
}

func New(
	invoices invoice.Repository,
	publisher invoice.Publisher,
	calendar invoice.Calendar,
	perWorkday vo.Money,
) *UseCase {
	return &UseCase{
		invoices:   invoices,
		publisher:  publisher,
		calendar:   calendar,
		perWorkday: perWorkday,
	}
}

// {{ucOverdueRun}}
func (u *UseCase) Run(ctx context.Context, number invoice.Number, now time.Time) error {
	overdue, err := u.invoices.ByNumber(ctx, number)
	if err != nil {
		return err
	}

	// {{ucSpecGuard}}
	if !rules.NewOverdue(now, u.calendar).IsSatisfiedBy(overdue) {
		return nil
	}

	// {{ucOverdueCall}}
	amount := penalty.Amount(overdue, now, u.perWorkday, u.calendar)

	// {{ucOverdueApply}}
	if err := overdue.ChargePenalty(amount); err != nil {
		return err
	}

	if err := u.invoices.Save(ctx, overdue); err != nil {
		return err
	}

	return u.publisher.Publish(ctx, overdue.Events()...)
}
`,
        },
      ],
    },
  ],
  /** Модули выставления и оплаты наполняет следующая глава. */
  dirs: [
    { path: 'invoice/applications/issuing', seed: true },
    { path: 'invoice/applications/payment', seed: true },
  ],
};

const deck: CodeDeck = [
  { id: 'problem' },
  { id: 'spec' },
  { id: 'usage' },
  { id: 'combine' },
  { id: 'cost' },
  { id: 'files' },
];

export default deck;
