import type { CodeDeck } from './types';
import flowSpec from './why-dictionaries.flow.ts'; // расширение обязательно: колоду импортирует ещё и node-скрипт проверки

/**
 * Урок про словари (справочники) в админке.
 *
 * Сюжет — оформление заказа в интернет-магазине: страна из адреса доставки
 * определяет зону доставки и то, можно ли платить при получении. Таблица стран
 * сначала живёт константой в коде, потом переезжает в словарь админки.
 *
 * Ведущий элемент — схема: путь запроса наверху не меняется, меняется то, что
 * под ним. Код показывает решения, ради которых урок: ключ, копия в памяти,
 * проверка всей пачки, ответ на незнакомую страну.
 *
 * ПРАВИЛО (как и везде): код, вывод и подписи на схеме общие для всех локалей,
 * значит только английские. Проза — в `narration` локализованного урока,
 * комментарии к коду — placeholder'ами `{{ключ}}` в `comments`.
 */
export const flow = flowSpec;

/** Обложка в каталоге: акварель, public/covers/why-dictionaries.svg (scripts/covers/build.py). */
export const cover = 'covers/why-dictionaries.svg';

const deck: CodeDeck = [
  {
    id: 'hardcode',
    lang: 'go',
    caption: 'checkout/countries.go',
    code: `var shippingZones = map[string]string{
	"DE": "eu",
	"FR": "eu",
	"PL": "eu",
	"CZ": "eu",
	// {{thirtyMore}}
	"NO": "intl",
	"CH": "intl",
	"GE": "remote",
}

// {{codWasSmall}}
// [!code highlight]
var codCountries = []string{"DE", "PL"}

func CODAllowed(country string) bool {
	return slices.Contains(codCountries, country)
}`,
    output: `$ git log --oneline -- checkout/countries.go
a41c9e0 ship to Georgia
7d2b513 move Norway to the intl zone
c90f4aa ship to Czechia
5e61d07 ship to Slovakia
2f7a8c1 ship to Poland

cash on delivery launched in Czechia: CODAllowed("CZ") == false`,
    outputTone: 'bad',
  },
  {
    id: 'dictionary',
    lang: 'json',
    caption: 'admin › dictionaries › shipping_countries',
    code: `{
  "slug": "shipping_countries",
  "fields": [
    { "key": "country", "type": "string", "required": true, "pattern": "^[A-Z]{2}$" },
    { "key": "zone",    "type": "enum",   "required": true, "values": ["eu", "intl", "remote"] },
    { "key": "cod",     "type": "bool",   "default": false }
  ],
  "items": [
    { "country": "DE", "zone": "eu",     "cod": true },
    { "country": "CZ", "zone": "eu",     "cod": true },
    { "country": "NO", "zone": "intl",   "cod": false },
    { "country": "GE", "zone": "remote", "cod": false }
  ]
}`,
  },
  {
    id: 'key',
    lang: 'go',
    caption: 'checkout/countries/countries.go',
    code: `const Slug = "shipping_countries"

var isoCode = regexp.MustCompile(\`^[A-Z]{2}$\`)

type Country struct {
	// {{isoIsKey}}
	// [!code highlight]
	Code string \`json:"country"\`
	Zone Zone   \`json:"zone"\`
	COD  bool   \`json:"cod"\`
}

func (c Country) validate() error {
	if !isoCode.MatchString(c.Code) {
		return fmt.Errorf("%w: %q", ErrBadCode, c.Code)
	}
	// {{zoneClosedSet}}
	// [!code highlight]
	if !c.Zone.Valid() {
		return fmt.Errorf("%s: %w: %q", c.Code, ErrBadZone, c.Zone)
	}
	return nil
}`,
  },
  {
    id: 'offpath',
    lang: 'go',
    caption: 'checkout/countries/store.go',
    code: `func (s *Store) Run(ctx context.Context, every time.Duration) {
	// {{firstLoad}}
	s.reload(ctx)

	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.reload(ctx)
		}
	}
}

func (s *Store) reload(ctx context.Context) {
	items, err := dictionary.Fetch[Country](ctx, s.admin, Slug)
	if err == nil {
		err = s.replace(items)
	}
	if err != nil {
		// [!code highlight]
		slog.Warn("shipping_countries: keeping previous copy", "err", err)
		s.reloadFailures.Inc()
	}
}`,
    output: `level=INFO msg="shipping_countries loaded" items=41
level=WARN msg="shipping_countries: keeping previous copy" err="admin: 502 Bad Gateway"
level=INFO msg="checkout" orders=312 errors=0`,
  },
  {
    id: 'swap',
    lang: 'go',
    caption: 'checkout/countries/store.go',
    code: `type Store struct {
	current atomic.Pointer[map[string]Country]
	// ...
}

// {{replaceAllOrNothing}}
func (s *Store) replace(items []Country) error {
	next := make(map[string]Country, len(items))
	for _, c := range items {
		if err := c.validate(); err != nil {
			return err
		}
		if _, dup := next[c.Code]; dup {
			return fmt.Errorf("%w: %s", ErrDuplicate, c.Code)
		}
		next[c.Code] = c
	}
	// {{oneSwap}}
	// [!code highlight]
	s.current.Store(&next)
	return nil
}`,
    output: `level=WARN msg="shipping_countries: keeping previous copy" err="duplicate country: CZ"`,
    outputTone: 'bad',
  },
  {
    id: 'unknown',
    lang: 'go',
    caption: 'checkout/delivery.go',
    code: `func (s *Store) Lookup(code string) (Country, bool) {
	m := s.current.Load()
	if m == nil {
		return Country{}, false
	}
	c, ok := (*m)[code]
	return c, ok
}

func (s *Service) DeliveryOptions(country string) ([]Option, error) {
	c, ok := s.countries.Lookup(country)
	if !ok {
		s.unknownCountries.WithLabelValues(country).Inc()
		// {{noZoneNoPrice}}
		// [!code highlight]
		return nil, ErrNotShippable
	}

	opts := zoneOptions[c.Zone]
	// {{codDefaultsOff}}
	if c.COD {
		opts = append(opts, CashOnDelivery)
	}
	return opts, nil
}`,
  },
  {
    id: 'owner',
    lang: 'go',
    caption: 'dictionary/fetch.go',
    code: `// {{onlyTransportShared}}
func Fetch[T any](ctx context.Context, admin *Client, slug string) ([]T, error) {
	url := admin.base + "/dictionaries/" + slug + "/items"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := admin.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", slug, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: admin: %s", slug, resp.Status)
	}

	var body struct {
		Items []T \`json:"items"\`
	}
	// [!code highlight]
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("%s: decode: %w", slug, err)
	}
	return body.Items, nil
}`,
  },
];

export default deck;
