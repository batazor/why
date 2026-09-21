import type { CodeDeck } from './types';
import { inherit, type FileTreeSpec } from './tree.ts';
import * as prev from './why-ddd-transport.ts';
import posterSpec from './why-cqrs.poster.ts';

/**
 * Колода урока про CQRS.
 *
 * ПРАВИЛО: код и дерево общие для всех локалей, поэтому в них только
 * английский, а комментарии — ключи `{{key}}`. Проза и переводы комментариев
 * лежат в локализованном уроке.
 *
 * Сервис тот же, что в главах про DDD: дерево унаследовано от главы про
 * транспорт (`inherit`). Здесь появляются команда, хендлер под неё и запрос со
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
    ...inherit(
      prev.tree,
      {
        'invoice/applications/issuing/issue.go': [
          {
            from: 'handler',
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

// {{handleCmd}}
func (u *UseCase) Handle(ctx context.Context, cmd IssueInvoice) error {
	if err := cmd.Validate(); err != nil {
		return err
	}

	issued, err := invoice.Issue(cmd.Number, cmd.Customer, cmd.Lines, cmd.DueOn)
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
        ],
        'invoice/applications/issuing/transport/http/handler.go': [
          {
            from: 'handler',
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

	// {{hCommand}}
	cmd := issuing.IssueInvoice{
		Number:   args.Number,
		Customer: args.Customer,
		Lines:    args.Lines,
		DueOn:    args.DueOn,
	}

	// {{hCall}}
	err := h.issue.Handle(r.Context(), cmd)
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
        ],
      },
    ),
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

/** Обложка в каталоге: акварель, public/covers/why-cqrs.svg (scripts/covers/build.py). */
export const cover = 'covers/why-cqrs.svg';
