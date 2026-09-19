import type { CodeDeck } from './types';
// Расширение обязательно: колоду импортирует ещё и node-скрипт проверки.
import posterSpec from './discount-floor.poster.ts';
import flowSpec from './discount-floor.flow.ts';

/**
 * Урок «скидки не должны пробивать закупочную цену».
 *
 * Шаги складываются в один файл Pricing.lean, который собирается целиком.
 * Исключение — разбор доказательства: шаги refute/instantiate/contradict
 * показывают один и тот же блок трижды, подсвечивая по строке за раз, поэтому
 * в файл он идёт один раз, а не три. Собирается целиком:
 * Lean 4.34, ноль ошибок, все #eval дают показанные числа. В `output`
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
    id: 'cut',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{oneCut}}
def cut (price : Nat) : Promo → Nat
  | .percent p => price * p / 100
  | .fixed c   => c`,
  },
  {
    id: 'engine',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{sequential}}
def stack (price : Nat) : List Promo → Nat
  | []      => price
  -- [!code highlight]
  | p :: ps => stack (price - cut price p) ps`,
  },
  {
    id: 'one',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `def categorySale : Promo := .percent 25
def coupon : Promo := .percent 25

-- {{oneTest}}
-- [!code pass]
example : stack sneakers.price [categorySale] = 3750 := by decide
-- [!code pass]
example : stack sneakers.price [coupon] = 3750 := by decide`,
    output: `Pricing.lean: no errors`,
    outputTone: 'ok',
  },
  {
    id: 'stack',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `def promos : List Promo := [categorySale, coupon]

-- [!code highlight]
#eval stack sneakers.price promos`,
    output: `2813`,
    outputTone: 'bad',
  },
  {
    id: 'clamp',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{clampIt}}
def clamped (i : Item) (ps : List Promo) : Nat :=
  max i.cost (stack i.price ps)

-- {{reportAsks}}
def reported (i : Item) (ps : List Promo) : Nat :=
  i.price - stack i.price ps

#eval clamped sneakers promos
#eval reported sneakers promos
#eval sneakers.price - clamped sneakers promos`,
    output: `3200
2187
1800`,
    outputTone: 'bad',
  },
  {
    id: 'rule',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{rulePromise}}
-- {{ruleInWords}}
def never_below_cost : Prop :=
  ∀ (i : Item) (ps : List Promo), i.cost ≤ stack i.price ps`,
  },
  {
    id: 'refute',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{counterExample}}
theorem stack_breaks_the_rule : ¬ never_below_cost := by
  -- {{assumeIt}}
  -- [!code highlight]
  intro rule
  -- {{pickThePair}}
  have bad := rule sneakers promos
  -- {{contradiction}}
  -- {{contradictionEnd}}
  exact absurd bad (by decide)`,
  },
  {
    id: 'instantiate',
    repeatsPrevious: true,
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{counterExample}}
theorem stack_breaks_the_rule : ¬ never_below_cost := by
  -- {{assumeIt}}
  intro rule
  -- {{pickThePair}}
  -- [!code highlight]
  have bad := rule sneakers promos
  -- {{contradiction}}
  -- {{contradictionEnd}}
  exact absurd bad (by decide)`,
  },
  {
    id: 'contradict',
    repeatsPrevious: true,
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{counterExample}}
theorem stack_breaks_the_rule : ¬ never_below_cost := by
  -- {{assumeIt}}
  intro rule
  -- {{pickThePair}}
  have bad := rule sneakers promos
  -- {{contradiction}}
  -- {{contradictionEnd}}
  -- [!code highlight]
  exact absurd bad (by decide)`,
    output: `Pricing.lean: no errors`,
    outputTone: 'ok',
  },
  {
    id: 'budget',
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{pool}}
-- [!code highlight]
def margin (i : Item) : Nat := i.price - i.cost

-- {{noOverdraw}}
def spend (price : Nat) : Nat → List Promo → Nat
  | budget, []      => budget
  | budget, p :: ps =>
      let taken := min (cut price p) budget
      spend (price - taken) (budget - taken) ps

-- {{finalPrice}}
def checkout (i : Item) (ps : List Promo) : Nat :=
  i.cost + spend i.price (margin i) ps

theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _

#eval checkout sneakers [categorySale]
#eval checkout sneakers promos
#eval checkout sneakers [.percent 50, .fixed 9000, .percent 90]`,
    output: `3750
3200
3200`,
    outputTone: 'ok',
  },
  {
    id: 'spend',
    repeatsPrevious: true,
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{pool}}
def margin (i : Item) : Nat := i.price - i.cost

-- {{noOverdraw}}
def spend (price : Nat) : Nat → List Promo → Nat
  | budget, []      => budget
  -- [!code highlight]
  | budget, p :: ps =>
      let taken := min (cut price p) budget
      spend (price - taken) (budget - taken) ps

-- {{finalPrice}}
def checkout (i : Item) (ps : List Promo) : Nat :=
  i.cost + spend i.price (margin i) ps

theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _

#eval checkout sneakers [categorySale]
#eval checkout sneakers promos
#eval checkout sneakers [.percent 50, .fixed 9000, .percent 90]`,
    output: `3750
3200
3200`,
    outputTone: 'ok',
  },
  {
    id: 'proof',
    repeatsPrevious: true,
    lang: 'lean',
    caption: 'Pricing.lean',
    code: `-- {{pool}}
def margin (i : Item) : Nat := i.price - i.cost

-- {{noOverdraw}}
def spend (price : Nat) : Nat → List Promo → Nat
  | budget, []      => budget
  | budget, p :: ps =>
      let taken := min (cut price p) budget
      spend (price - taken) (budget - taken) ps

-- {{finalPrice}}
def checkout (i : Item) (ps : List Promo) : Nat :=
  i.cost + spend i.price (margin i) ps

-- [!code highlight]
theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _

#eval checkout sneakers [categorySale]
#eval checkout sneakers promos
#eval checkout sneakers [.percent 50, .fixed 9000, .percent 90]`,
    output: `3750
3200
3200`,
    outputTone: 'ok',
  },
  {
    id: 'evolve',
    // Правка, а не новый код: в файле уже есть Promo, и кешбэк дописывается в
    // него. Тогда `cut` перестаёт покрывать все случаи — ровно ошибка из output.
    playground: [
      { find: '  | fixed   (cents : Nat)', replace: '  | fixed   (cents : Nat)\n  | cashback (p : Nat)' },
    ],
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
  {
    id: 'declare',
    lang: 'lean',
    caption: 'Pricing.lean',
    // Те же две правки, что и в evolve, плюс закрывающая ветка: файл снова
    // собирается, и открыть в песочнице надо именно собирающийся.
    playground: [
      { find: '  | fixed   (cents : Nat)', replace: '  | fixed   (cents : Nat)\n  | cashback (p : Nat)' },
      { find: '  | .fixed c   => c', replace: '  | .fixed c   => c\n  | .cashback _ => 0' },
    ],
    code: `inductive Promo where
  | percent  (p : Nat)
  | fixed    (cents : Nat)
  | cashback (p : Nat)

def cut (price : Nat) : Promo → Nat
  | .percent p => price * p / 100
  | .fixed c   => c
  -- {{cashbackShare}}
  -- [!code ++]
  | .cashback _ => 0

-- {{proofUntouched}}
theorem checkout_never_below_cost (i : Item) (ps : List Promo) :
    i.cost ≤ checkout i ps :=
  Nat.le_add_right _ _`,
    output: `Pricing.lean: no errors`,
    outputTone: 'ok',
  },
];

export default deck;

/** Обложка в каталоге: акварель, public/covers/discount-floor.svg (scripts/covers/build.py). */
export const cover = 'covers/discount-floor.svg';
