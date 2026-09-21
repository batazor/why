import type { CodeDeck } from './types';
import { inherit, type FileTreeSpec } from './tree.ts';
import * as prev from './why-ddd-infrastructure.ts';
import posterSpec from './why-ddd-transport.poster.ts';

/**
 * Колода шестой главы: входящий вызов и сборка приложения.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Всё, что было к этому шагу, унаследовано от главы про инфраструктуру
 * (`inherit`).
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
    ...inherit(prev.tree),
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
   * самая «сборки нет».
   */
  dirs: [
    { path: 'invoice/cmd/api', from: 'entry' },
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
