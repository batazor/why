import type { CodeDeck } from './types';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './discount-floor.poster.ts';
import flowSpec from './discount-floor.flow.ts';

/**
 * Урок «скидки не должны пробивать закупочную цену».
 *
 * Шаги складываются в один файл Pricing.lean, который собирается целиком:
 * Lean 4.34, ноль ошибок, все восемь #eval дают показанные числа. В `output`
 * лежит только настоящий вывод компилятора — никаких пояснений от автора,
 * иначе обещание «весь вывод настоящий» перестаёт быть правдой.
 *
 * Комментарии в коде — placeholder'ы {{ключ}}: код общий для всех локалей,
 * а комментарий это проза, и проза переводится.
 */
export const poster = posterSpec;
export const flow = flowSpec;

const deck: CodeDeck = [
  {
    id: 'item',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{twoPrices}}
structure Item where
  price : Nat
  cost  : Nat

def sneakers : Item := { price := 5000, cost := 3200 }`,
  },
  {
    id: 'promo',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{mechanics}}
inductive Promo where
  | percent (p : Nat)
  | fixed   (cents : Nat)`,
  },
  {
    id: 'engine',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{oneCut}}
def cut (price : Nat) : Promo → Nat
  | .percent p => price * p / 100
  | .fixed c   => c

-- {{sequential}}
def naive (price : Nat) : List Promo → Nat
  | []      => price
  | p :: ps => naive (price - cut price p) ps`,
  },
  {
    id: 'one',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `#eval naive sneakers.price [.percent 20]`,
    output: `4000`,
    outputTone: 'ok',
  },
  {
    id: 'stack',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `def promos : List Promo := [.percent 50, .percent 60]

-- [!code highlight]
#eval naive sneakers.price promos`,
    output: `1000`,
    outputTone: 'bad',
  },
  {
    id: 'clamp',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{clampIt}}
def clamped (i : Item) (ps : List Promo) : Nat :=
  max i.cost (naive i.price ps)

-- {{reportAsks}}
def reported (i : Item) (ps : List Promo) : Nat :=
  i.price - naive i.price ps

#eval clamped sneakers promos
#eval reported sneakers promos
#eval sneakers.price - clamped sneakers promos`,
    output: `3200
4000
1800`,
    outputTone: 'bad',
  },
  {
    id: 'rule',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{rulePromise}}
theorem naive_breaks_the_rule :
    ¬ ∀ (i : Item) (ps : List Promo), i.cost ≤ naive i.price ps := by
  intro rule
  -- {{counterExample}}
  have bad := rule sneakers promos
  exact absurd bad (by decide)`,
    output: `Pricing.lean: no errors`,
    outputTone: 'ok',
  },
  {
    id: 'budget',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{pool}}
def margin (i : Item) : Nat := i.price - i.cost

-- {{noOverdraw}}
def spend (price : Nat) : Nat → List Promo → Nat
  | budget, []      => budget
  -- [!code highlight]
  | budget, p :: ps => spend price (budget - min (cut price p) budget) ps

-- {{finalPrice}}
def checkout (i : Item) (ps : List Promo) : Nat :=
  i.cost + spend i.price (margin i) ps

theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _

#eval checkout sneakers [.percent 20]
#eval checkout sneakers promos
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
  -- {{newMechanic}}
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
