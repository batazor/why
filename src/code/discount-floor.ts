import type { CodeDeck } from './types';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './discount-floor.poster.ts';
import flowSpec from './discount-floor.flow.ts';

/**
 * Урок «скидки не должны пробивать закупочную цену».
 *
 * Весь Lean-код скомпилирован Lean 4.34, весь вывод снят с настоящего
 * компилятора — включая обе ошибки и оба доказательства. В уроке про язык,
 * где код либо собирается, либо нет, выдуманный вывод недопустим.
 *
 * ПРАВИЛО (как везде): код, вывод и подписи схемы общие для всех локалей,
 * значит только английские. Проза — в `narration` локализованного урока.
 */
export const poster = posterSpec;
export const flow = flowSpec;

const deck: CodeDeck = [
  {
    id: 'one',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `structure Item where
  price : Nat   -- retail, cents
  cost  : Nat   -- what we paid, cents

inductive Promo where
  | percent (p : Nat)
  | fixed   (cents : Nat)

def cut (price : Nat) : Promo → Nat
  | .percent p => price * p / 100
  | .fixed c   => c

def naive (price : Nat) : List Promo → Nat
  | []      => price
  | p :: ps => naive (price - cut price p) ps

def sneakers : Item := { price := 5000, cost := 3200 }

#eval naive sneakers.price [.percent 20]`,
    output: `4000

paid 40.00, cost 32.00 — fine`,
    outputTone: 'ok',
  },
  {
    id: 'stack',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- category sale, set up by one marketer
-- coupon, set up by another, three weeks later

-- [!code highlight]
#eval naive sneakers.price [.percent 50, .percent 60]`,
    output: `1000

paid 10.00, cost 32.00 — 22.00 lost on every pair of sneakers`,
    outputTone: 'bad',
  },
  {
    id: 'clamp',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `def clamped (i : Item) (ps : List Promo) : Nat :=
  -- [!code ++]
  max i.cost (naive i.price ps)

def reported (i : Item) (ps : List Promo) : Nat :=
  i.price - naive i.price ps

#eval clamped sneakers promos                    -- customer pays
#eval reported sneakers promos                   -- discount per the report
#eval sneakers.price - clamped sneakers promos   -- discount actually given`,
    output: `3200
4000
1800`,
    outputTone: 'bad',
  },
  {
    id: 'rule',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- The rule, written once, about every item and every set of promos.
theorem naive_breaks_the_rule :
    ¬ ∀ (i : Item) (ps : List Promo), i.cost ≤ naive i.price ps := by
  intro rule
  -- [!code highlight]
  have bad := rule sneakers [.percent 50, .percent 60]
  exact absurd bad (by decide)`,
    output: `Pricing.lean: no errors

the counterexample is now part of the build`,
    outputTone: 'ok',
  },
  {
    id: 'budget',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `def margin (i : Item) : Nat := i.price - i.cost

-- Every promo draws from the same pool and cannot overdraw it.
def spend (price : Nat) : Nat → List Promo → Nat
  | budget, []      => budget
  -- [!code highlight]
  | budget, p :: ps => spend price (budget - min (cut price p) budget) ps

def checkout (i : Item) (ps : List Promo) : Nat :=
  -- [!code highlight]
  i.cost + spend i.price (margin i) ps

theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _

#eval checkout sneakers [.percent 20]
#eval checkout sneakers [.percent 50, .percent 60]
#eval checkout sneakers [.percent 50, .fixed 9000, .percent 90]`,
    output: `4000
3200
3200`,
    outputTone: 'ok',
  },
  {
    id: 'evolve',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `inductive Promo where
  | percent  (p : Nat)
  | fixed    (cents : Nat)
  -- [!code ++]
  | cashback (p : Nat)

def cut (price : Nat) : Promo → Nat
  | .percent p => price * p / 100
  | .fixed c   => c`,
    output: `error: Missing cases:
(Promo.cashback _)`,
    outputTone: 'ok',
  },
];

export default deck;
