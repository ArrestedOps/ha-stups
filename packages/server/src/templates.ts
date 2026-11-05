/**
 * Eingebaute Board-Vorlagen: Spalten, Kategorien und Beispielkarten, zweisprachig. Beim Anlegen eines Boards wird eine Vorlage
 * in der Sprache der Person aufgelöst (`resolveTemplate`) und zu einem ganz normalen Board. Eigene Vorlagen (Tabelle
 * `board_templates`) haben dieselbe Form mit einfachen Texten (die Sprache des Speichernden).
 */
export type Lang = 'de' | 'en';
type L = Record<Lang, string>;
const l = (de: string, en: string): L => ({ de, en });

/** Die Farben der Kategorien (wie in der Oberfläche, packages/web/src/lib/colors.ts) */
export const CATEGORY_COLOR_NAMES = ['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'indigo', 'brown', 'gray', 'mint'] as const;

export type TemplatePriority = 'low' | 'medium' | 'high';
export type TemplateEffort = 'small' | 'medium' | 'large';

/** Eine Vorlage mit einfachen Texten: das, was beim Anlegen gebraucht und bei eigenen Vorlagen gespeichert wird */
export interface TemplateData {
  columns: { name: string; done: boolean; planned: boolean }[];
  categories: { name: string; color: string }[];
  cards: {
    title: string;
    description: string | null;
    /** Index in `columns`; ein Termin nach heute schickt die Karte von selbst in „Geplant" */
    column: number;
    /** Indizes in `categories` */
    categories: number[];
    checklist: string[];
    priority: TemplatePriority | null;
    effort: TemplateEffort | null;
    recurrence: Record<string, unknown> | null;
    /** Termin in ganzen Tagen ab heute (um die Standardzeit); null = ohne Termin */
    dueInDays: number | null;
    /** Symbol und Farbe der Karte (Symbol-Bibliothek der Oberfläche); ältere eigene Vorlagen haben beides nicht */
    icon?: string | null;
    iconColor?: string | null;
  }[];
}

interface BuiltinCard {
  title: L;
  description?: L;
  column?: number;
  categories?: number[];
  checklist?: L[];
  priority?: TemplatePriority;
  effort?: TemplateEffort;
  recurrence?: Record<string, unknown>;
  dueInDays?: number;
  icon?: string;
}

export interface BuiltinTemplate {
  id: string;
  name: L;
  description: L;
  columns: { name: L; done?: boolean; planned?: boolean }[];
  categories: { name: L; color: (typeof CATEGORY_COLOR_NAMES)[number] }[];
  cards: BuiltinCard[];
}

const OPEN = { name: l('Offen', 'Open') };
const PLANNED = { name: l('Geplant', 'Planned'), planned: true };
const DOING = { name: l('In Arbeit', 'In progress') };
const DONE = { name: l('Erledigt', 'Done'), done: true };

const weekly = (...weekdays: number[]) => ({ type: 'fixed', freq: 'weekly', every: 1, weekdays });
const afterWeeks = (every: number) => ({ type: 'after_completion', every, unit: 'weeks' });
const afterDays = (every: number) => ({ type: 'after_completion', every, unit: 'days' });

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'household',
    name: l('Haushalt', 'Household'),
    description: l('Die typischen wiederkehrenden Aufgaben im Haus: Müll, Wäsche, Staubsaugen, Bad, Einkauf.', 'The usual recurring chores at home: rubbish, laundry, vacuuming, bathroom, shopping.'),
    columns: [OPEN, PLANNED, DOING, DONE],
    categories: [
      { name: l('Küche', 'Kitchen'), color: 'orange' },
      { name: l('Bad', 'Bathroom'), color: 'blue' },
      { name: l('Wäsche', 'Laundry'), color: 'purple' },
      { name: l('Einkauf', 'Shopping'), color: 'pink' },
      { name: l('Garten', 'Garden'), color: 'green' },
    ],
    cards: [
      { title: l('Müll rausbringen', 'Take out the rubbish'), icon: 'trash-can-outline', categories: [0], effort: 'small', recurrence: weekly(2), dueInDays: 1 },
      { title: l('Wäsche waschen', 'Do the laundry'), icon: 'washing-machine', categories: [2], effort: 'medium', recurrence: weekly(6), dueInDays: 2 },
      { title: l('Staubsaugen', 'Vacuum'), icon: 'vacuum-outline', effort: 'medium', recurrence: weekly(6), dueInDays: 2 },
      { title: l('Bad putzen', 'Clean the bathroom'), icon: 'water-outline', categories: [1], effort: 'medium', recurrence: afterWeeks(2), dueInDays: 3 },
      {
        title: l('Einkaufen', 'Go shopping'),
        icon: 'cart-outline',
        categories: [3],
        effort: 'medium',
        recurrence: weekly(5),
        dueInDays: 1,
        checklist: [l('Milch', 'Milk'), l('Brot', 'Bread'), l('Obst und Gemüse', 'Fruit and vegetables')],
      },
      { title: l('Blumen gießen', 'Water the plants'), icon: 'watering-can-outline', categories: [4], effort: 'small', recurrence: afterDays(3), dueInDays: 1 },
      {
        title: l('Frühjahrsputz', 'Spring cleaning'),
        icon: 'spray-bottle',
        description: l('Fenster, Schränke und Keller. Ohne Termin: verteil es auf mehrere Wochenenden.', 'Windows, cupboards and basement. No due date: spread it over a few weekends.'),
        effort: 'large',
      },
    ],
  },
  {
    id: 'move',
    name: l('Umzug', 'Moving house'),
    description: l('Vom Kündigen bis zum Ummelden: alles, was bei einem Umzug ansteht.', 'From giving notice to registering the new address: everything that comes with a move.'),
    columns: [OPEN, PLANNED, DOING, DONE],
    categories: [
      { name: l('Organisieren', 'Organising'), color: 'blue' },
      { name: l('Packen', 'Packing'), color: 'orange' },
      { name: l('Behörden und Verträge', 'Authorities and contracts'), color: 'red' },
      { name: l('Neue Wohnung', 'New home'), color: 'green' },
    ],
    cards: [
      { title: l('Umzugsunternehmen anfragen', 'Ask moving companies for quotes'), categories: [0], priority: 'high', effort: 'small', dueInDays: 7 },
      { title: l('Kartons und Packmaterial besorgen', 'Get boxes and packing material'), categories: [1], effort: 'small', dueInDays: 7 },
      {
        title: l('Nachsendeauftrag einrichten', 'Set up mail forwarding'),
        categories: [2],
        effort: 'small',
        dueInDays: 14,
      },
      {
        title: l('Strom, Gas und Internet ummelden', 'Move electricity, gas and internet'),
        categories: [2],
        priority: 'high',
        effort: 'medium',
        dueInDays: 14,
        checklist: [l('Zählerstände notieren', 'Note the meter readings'), l('Anbieter informieren', 'Tell the providers'), l('Internet-Termin vereinbaren', 'Book the internet appointment')],
      },
      {
        title: l('Beim Einwohnermeldeamt ummelden', 'Register the new address'),
        categories: [2],
        effort: 'medium',
        dueInDays: 30,
        checklist: [l('Termin buchen', 'Book an appointment'), l('Ausweis und Mietvertrag einpacken', 'Bring ID and rental contract')],
      },
      { title: l('Küche packen', 'Pack the kitchen'), categories: [1], effort: 'large', dueInDays: 21 },
      { title: l('Wohnungsübergabe mit Protokoll', 'Hand over the old flat with a report'), categories: [3], effort: 'medium', dueInDays: 35 },
      { title: l('Neue Wohnung ausmessen', 'Measure the new home'), categories: [3], effort: 'small' },
    ],
  },
  {
    id: 'renovation',
    name: l('Renovierung', 'Renovation'),
    description: l('Von der Planung über Angebote bis zur Abnahme.', 'From planning and quotes to the final inspection.'),
    columns: [OPEN, PLANNED, DOING, DONE],
    categories: [
      { name: l('Planung', 'Planning'), color: 'blue' },
      { name: l('Material', 'Materials'), color: 'brown' },
      { name: l('Handwerker', 'Tradespeople'), color: 'orange' },
      { name: l('Selber machen', 'DIY'), color: 'green' },
    ],
    cards: [
      { title: l('Budget festlegen', 'Set the budget'), categories: [0], priority: 'high', effort: 'small' },
      { title: l('Angebote einholen', 'Collect quotes'), categories: [2], effort: 'medium', dueInDays: 7, checklist: [l('Drei Firmen anfragen', 'Ask three companies'), l('Angebote vergleichen', 'Compare the quotes')] },
      { title: l('Farben und Bodenbelag aussuchen', 'Choose colours and flooring'), categories: [0, 1], effort: 'medium', dueInDays: 10 },
      { title: l('Material bestellen', 'Order the materials'), categories: [1], effort: 'medium', dueInDays: 14 },
      { title: l('Möbel abdecken und Räume ausräumen', 'Cover furniture and clear the rooms'), categories: [3], effort: 'large', dueInDays: 21 },
      { title: l('Wände streichen', 'Paint the walls'), categories: [3], effort: 'large', dueInDays: 28 },
      { title: l('Abnahme mit dem Handwerker', 'Final inspection with the tradesperson'), categories: [2], effort: 'small', dueInDays: 45 },
    ],
  },
  {
    id: 'packing',
    name: l('Urlaub packen', 'Packing for a trip'),
    description: l('Eine Packliste zum Abhaken: Kleidung, Hygiene, Technik, Dokumente.', 'A packing list to tick off: clothes, toiletries, tech, documents.'),
    columns: [{ name: l('Noch packen', 'Still to pack') }, { name: l('Eingepackt', 'Packed'), done: true }],
    categories: [
      { name: l('Dokumente', 'Documents'), color: 'red' },
      { name: l('Kleidung', 'Clothes'), color: 'blue' },
      { name: l('Hygiene', 'Toiletries'), color: 'teal' },
      { name: l('Technik', 'Tech'), color: 'indigo' },
    ],
    cards: [
      { title: l('Reisepass und Tickets', 'Passport and tickets'), categories: [0], priority: 'high', effort: 'small' },
      { title: l('Versicherungen und Kreditkarte', 'Insurance and credit card'), categories: [0], effort: 'small' },
      { title: l('Kleidung für die Reise', 'Clothes for the trip'), categories: [1], effort: 'medium', checklist: [l('Unterwäsche und Socken', 'Underwear and socks'), l('Regenjacke', 'Rain jacket'), l('Badesachen', 'Swimwear')] },
      { title: l('Kulturbeutel', 'Toiletry bag'), categories: [2], effort: 'small', checklist: [l('Zahnbürste', 'Toothbrush'), l('Sonnencreme', 'Sunscreen'), l('Medikamente', 'Medication')] },
      { title: l('Ladekabel und Adapter', 'Chargers and adapters'), categories: [3], effort: 'small' },
    ],
  },
  {
    id: 'baby',
    name: l('Baby kommt', 'Baby on the way'),
    description: l('Ausstattung, Anträge und Termine, damit nichts untergeht.', 'Gear, applications and appointments, so nothing gets lost.'),
    columns: [OPEN, PLANNED, DONE],
    categories: [
      { name: l('Ausstattung', 'Gear'), color: 'pink' },
      { name: l('Organisation', 'Paperwork'), color: 'blue' },
      { name: l('Gesundheit', 'Health'), color: 'green' },
    ],
    cards: [
      { title: l('Kinderärztin oder Kinderarzt aussuchen', 'Choose a paediatrician'), categories: [2], effort: 'small', dueInDays: 30 },
      { title: l('Elternzeit beantragen', 'Apply for parental leave'), categories: [1], priority: 'high', effort: 'medium', dueInDays: 60 },
      { title: l('Babyzimmer einrichten', 'Set up the nursery'), categories: [0], effort: 'large', dueInDays: 45 },
      { title: l('Klinik anmelden', 'Register at the hospital'), categories: [1], effort: 'small', dueInDays: 21 },
      {
        title: l('Kliniktasche packen', 'Pack the hospital bag'),
        categories: [0],
        effort: 'medium',
        dueInDays: 50,
        checklist: [l('Unterlagen und Mutterpass', 'Documents and maternity file'), l('Kleidung für das Baby', 'Clothes for the baby'), l('Ladekabel', 'Charger')],
      },
      { title: l('Autositz besorgen', 'Get a car seat'), categories: [0], effort: 'medium', dueInDays: 40 },
    ],
  },
  {
    id: 'ideas',
    name: l('Ideen und Unternehmungen', 'Ideas and outings'),
    description: l('Was ihr gern mal machen wollt: Restaurants, Ausflüge, Abende zu Hause.', 'What you would like to do sometime: restaurants, trips, evenings at home.'),
    columns: [{ name: l('Ideen', 'Ideas') }, PLANNED, { name: l('Erlebt', 'Done together'), done: true }],
    categories: [
      { name: l('Essen gehen', 'Eating out'), color: 'orange' },
      { name: l('Ausflug', 'Trip'), color: 'green' },
      { name: l('Kultur', 'Culture'), color: 'purple' },
      { name: l('Zuhause', 'At home'), color: 'brown' },
    ],
    cards: [
      { title: l('Neues Restaurant ausprobieren', 'Try a new restaurant'), categories: [0], effort: 'small' },
      { title: l('Wanderung am Wochenende', 'Weekend hike'), categories: [1], effort: 'medium', dueInDays: 10 },
      { title: l('Kinoabend', 'Cinema night'), categories: [2], effort: 'small' },
      { title: l('Brettspielabend', 'Board game night'), categories: [3], effort: 'small' },
      { title: l('Picknick im Park', 'Picnic in the park'), categories: [1, 3], effort: 'small' },
    ],
  },
];

/** Die Vorlage in einer Sprache als einfache Texte (so wie sie angelegt und gespeichert wird) */
export function resolveTemplate(t: BuiltinTemplate, lang: Lang): TemplateData {
  return {
    columns: t.columns.map((c) => ({ name: c.name[lang], done: c.done === true, planned: c.planned === true })),
    categories: t.categories.map((c) => ({ name: c.name[lang], color: c.color })),
    cards: t.cards.map((c) => ({
      title: c.title[lang],
      description: c.description ? c.description[lang] : null,
      column: c.column ?? 0,
      categories: c.categories ?? [],
      checklist: (c.checklist ?? []).map((i) => i[lang]),
      priority: c.priority ?? null,
      effort: c.effort ?? null,
      recurrence: c.recurrence ?? null,
      dueInDays: c.dueInDays ?? null,
      icon: c.icon ?? null,
      iconColor: null,
    })),
  };
}
