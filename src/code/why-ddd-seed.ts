import type { TreeFile } from './tree';

/**
 * Что главы про доменные сервисы и спецификацию оставили в сервисе.
 *
 * Главы после них показывают эти файлы как наследство (`seed`): сценарий
 * просрочки уже написан, и пустым каталог `overdue` выглядеть не должен. Код
 * один на все колоды, поэтому лежит здесь, а не копией в каждой.
 *
 * ПРАВИЛО то же, что в колодах: только английский, комментарии — ключи
 * `{{key}}`, переводы лежат в локализованном уроке.
 */

/** Факты домена вместе с начисленной пеней. */
export const eventsWithPenalty = `package events

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
`;

export const overdueSeed: TreeFile[] = [
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
    path: 'invoice/domains/invoice/rules/overdue.go',
    seed: true,
    lang: 'go',
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
  {
    path: 'invoice/applications/overdue/charge.go',
    seed: true,
    lang: 'go',
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
];
