import type { CodeDeck } from './types';
import type { FileTreeSpec } from './tree';
import posterSpec from './why-ddd-transport.poster.ts';

/**
 * Колода последней части: входящий вызов и сборка приложения.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Всё, что было к этому шагу, досталось от предыдущих глав и помечено `seed`.
 * Здесь появляются одна ручка со своим DTO и `cmd/api`, который всё это
 * связывает.
 */

/** Постер каталога: суть главы одной схемой. */
export const poster = posterSpec;

export const tree: FileTreeSpec = {
  root: 'billing',
  steps: {
    /* Проблема: сценарий готов, а позвать его некому и собрать некому. */
    entry: { open: 'invoice/applications/issuing/issue.go', view: 'file' },
    dto: { open: 'invoice/applications/issuing/transport/http/dto/issue.go', view: 'file' },
    handler: { open: 'invoice/applications/issuing/transport/http/handler.go', view: 'file' },
    errors: { open: 'invoice/applications/issuing/transport/http/errors.go', view: 'file' },
    router: { open: 'invoice/applications/issuing/transport/http/routes.go', view: 'file' },
    /* Проблема вторая: сборка руками растёт быстрее, чем сервис. */
    wiring: { open: 'invoice/cmd/api/main.go', view: 'file' },
    wire: { open: 'invoice/cmd/api/wire.go', view: 'file' },
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
    {
      path: 'invoice/applications/issuing/transport/http/dto/issue.go',
      from: 'dto',
      lang: 'go',
      code: `package dto

import (
	"errors"
	"time"

	"billing/invoice/domains/invoice"
	"billing/invoice/domains/invoice/vo"
)

// {{dtoWhat}}
type IssueRequest struct {
	Number   string    \`json:"number"\`
	Customer string    \`json:"customer"\`
	DueOn    time.Time \`json:"due_on"\`
	Lines    []Line    \`json:"lines"\`
}

// {{dtoLine}}
type Line struct {
	AmountMinor int64 \`json:"amount_minor"\`
}

var ErrEmptyNumber = errors.New("dto: number is empty")

// {{dtoValidate}}
func (r IssueRequest) Validate() error {
	if r.Number == "" {
		return ErrEmptyNumber
	}

	return nil
}

// {{dtoDomain}}
type Issue struct {
	Number   invoice.Number
	Customer invoice.CustomerID
	Lines    []invoice.Line
	DueOn    time.Time
}

// {{dtoToDomain}}
func (r IssueRequest) ToDomain() Issue {
	lines := make([]invoice.Line, 0, len(r.Lines))
	for _, item := range r.Lines {
		lines = append(lines, invoice.NewLine(vo.NewMoney(item.AmountMinor)))
	}

	return Issue{
		Number:   invoice.Number(r.Number),
		Customer: invoice.CustomerID(r.Customer),
		Lines:    lines,
		DueOn:    r.DueOn,
	}
}
`,
    },
    {
      path: 'invoice/applications/issuing/transport/http/handler.go',
      from: 'handler',
      lang: 'go',
      code: `package http

import (
	"encoding/json"
	"net/http"

	"billing/invoice/applications/issuing"
	"billing/invoice/applications/issuing/transport/http/dto"
)

// {{hWhat}}
type Handler struct {
	issue *issuing.UseCase
}

func NewHandler(issue *issuing.UseCase) *Handler {
	return &Handler{issue: issue}
}

// {{hIssue}}
func (h *Handler) Issue(w http.ResponseWriter, r *http.Request) {
	var body dto.IssueRequest

	// {{hDecode}}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "malformed json", http.StatusBadRequest)

		return
	}

	if err := body.Validate(); err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)

		return
	}

	// {{hToDomain}}
	args := body.ToDomain()

	// {{hCall}}
	err := h.issue.Run(r.Context(), args.Number, args.Customer, args.Lines, args.DueOn)
	if err != nil {
		// {{hFail}}
		fail(w, err)

		return
	}

	// {{hCreated}}
	w.WriteHeader(http.StatusCreated)
}
`,
    },
    {
      path: 'invoice/applications/issuing/transport/http/errors.go',
      from: 'errors',
      lang: 'go',
      code: `package http

import (
	"errors"
	"log/slog"
	"net/http"

	"billing/invoice/domains/invoice"
)

// {{errWhat}}
func fail(w http.ResponseWriter, err error) {
	switch {
	// {{errRule}}
	case errors.Is(err, invoice.ErrNoLines):
		http.Error(w, "invoice has no lines", http.StatusUnprocessableEntity)
	case errors.Is(err, invoice.ErrAlreadyPaid):
		http.Error(w, "invoice is already paid", http.StatusConflict)
	default:
		// {{errUnknown}}
		slog.Error("issue invoice", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}
`,
    },
    {
      path: 'invoice/applications/issuing/transport/http/routes.go',
      from: 'router',
      lang: 'go',
      code: `package http

import "net/http"

// {{routeWhat}}
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /invoices", h.Issue)
}
`,
    },
    {
      path: 'invoice/cmd/api/main.go',
      from: 'wiring',
      lang: 'go',
      code: `package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"

	"billing/invoice/infrastructure/postgres"
	"billing/invoice/applications/issuing"
	issuinghttp "billing/invoice/applications/issuing/transport/http"
)

// {{mainByHand}}
func main() {
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}

	// {{mainAdapters}}
	uow := postgres.NewUnitOfWork(db)
	invoices := postgres.NewInvoices(db)
	outbox := postgres.NewOutbox(db)

	// {{mainWire}}
	handler := issuinghttp.NewHandler(issuing.New(uow, invoices, outbox))

	mux := http.NewServeMux()
	handler.Register(mux)

	log.Fatal(http.ListenAndServe(":8080", mux))
}
`,
      edits: [
        {
          from: 'wire',
          code: `package main

import (
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"
)

// {{mainWired}}
func main() {
	handler, err := initHandler(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	handler.Register(mux)

	log.Fatal(http.ListenAndServe(":8080", mux))
}
`,
        },
      ],
    },
    {
      path: 'invoice/cmd/api/wire.go',
      from: 'wire',
      lang: 'go',
      code: `//go:build wireinject

package main

import (
	"database/sql"

	"github.com/google/wire"

	"billing/invoice/domains/invoice"
	"billing/invoice/infrastructure/postgres"
	"billing/invoice/applications/issuing"
	issuinghttp "billing/invoice/applications/issuing/transport/http"
)

// {{wireSet}}
var adapters = wire.NewSet(
	postgres.NewUnitOfWork,
	postgres.NewInvoices,
	postgres.NewOutbox,
	// {{wireBind}}
	wire.Bind(new(invoice.UnitOfWork), new(*postgres.UnitOfWork)),
	wire.Bind(new(invoice.Repository), new(*postgres.Invoices)),
	wire.Bind(new(invoice.Publisher), new(*postgres.Outbox)),
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
  /**
   * Каталоги, которые проблема называет раньше кода: пустой `cmd` и есть та
   * самая «сборки нет», а `payment` ждёт второй ручки.
   */
  dirs: [
    { path: 'invoice/cmd/api', from: 'entry' },
    { path: 'invoice/applications/overdue', seed: true },
  ],
};

const deck: CodeDeck = [
  { id: 'entry' },
  { id: 'dto' },
  { id: 'handler' },
  { id: 'errors' },
  { id: 'router' },
  { id: 'wiring' },
  { id: 'wire' },
  { id: 'files' },
];

export default deck;

/** Обложка в каталоге: акварель, public/covers/why-ddd-transport.svg (scripts/covers/build.py). */
export const cover = 'covers/why-ddd-transport.svg';
