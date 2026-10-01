import { shuffle } from "./game";
import { artwork } from "./artwork";
export type ObjectId =
  | "eiffel"
  | "pyramid"
  | "liberty"
  | "clock"
  | "rocket"
  | "airbus"
  | "titanic"
  | "pitch"
  | "whale"
  | "trex"
  | "bus"
  | "giraffe"
  | "elephant"
  | "hoop"
  | "sequoia"
  | "unity"
  | "iss"
  | "squid";
export type GameObject = {
  id: ObjectId;
  name: string;
  label: string;
  size: number;
  width: number;
  height: number;
  axis: "x" | "y";
  note: string;
  source: string;
  illustration?: {
    src: string;
    imageWidth: number;
    imageHeight: number;
    crop: [number, number, number, number];
  };
};
export const objects: Record<ObjectId, GameObject> = {
  eiffel: {
    id: "eiffel",
    name: "Эйфелева башня",
    label: "Париж, Франция",
    size: 330,
    width: 126,
    height: 330,
    axis: "y",
    note: "Высота вместе с антенной — 330 м.",
    source: "https://www.toureiffel.paris/en/the-monument/key-figures",
  },
  pyramid: {
    id: "pyramid",
    name: "Пирамида Хеопса",
    label: "Первоначальная высота",
    size: 146.6,
    width: 230.3,
    height: 146.6,
    axis: "y",
    note: "Сравниваем первоначальную высоту пирамиды — 146,6 м. Сегодня она ниже: вершина и часть облицовки утрачены.",
    source: "https://www.si.edu/spotlight/ancient-egypt/pyramid",
  },
  liberty: {
    id: "liberty",
    name: "Статуя Свободы",
    label: "Вместе с пьедесталом",
    size: 93,
    width: 32,
    height: 93,
    axis: "y",
    note: "93 м — от земли до факела, вместе с пьедесталом. Сама статуя заметно ниже.",
    source: "https://www.nps.gov/places/000/statue-front.htm",
  },
  clock: {
    id: "clock",
    name: "Биг-Бен",
    label: "Башня Елизаветы, Лондон",
    size: 96,
    width: 16,
    height: 96,
    axis: "y",
    note: "Сравниваем башню Елизаветы высотой 96 м. Биг-Бен — название её большого колокола.",
    source:
      "https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/",
  },
  rocket: {
    id: "rocket",
    name: "Ракета «Фалькон-9»",
    label: "С головным обтекателем",
    size: 70,
    width: 5.2,
    height: 70,
    axis: "y",
    note: "Высота ракеты в конфигурации со стандартным головным обтекателем — 70 м.",
    source:
      "https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf",
  },
  airbus: {
    id: "airbus",
    name: "Аэробус А380",
    label: "Вид сбоку · от носа до хвоста",
    size: 72.7,
    width: 72.7,
    height: 24.1,
    axis: "x",
    note: "Длина двухпалубного А380 — 72,7 м. Здесь сравнивается длина, а не размах крыльев.",
    source:
      "https://www.airbus.com/sites/g/files/jlcbta136/files/2021-10/EN-Airbus-A380-Facts-and-Figures_0.pdf",
  },
  titanic: {
    id: "titanic",
    name: "«Титаник»",
    label: "От носа до кормы",
    size: 269,
    width: 269,
    height: 53.3,
    axis: "x",
    note: "Длина лайнера — около 269 м. Это больше двух с половиной футбольных полей.",
    source:
      "https://www.ireland.com/en/magazine/long-reads/belfasts-titanic-legacy/",
  },
  pitch: {
    id: "pitch",
    name: "Футбольное поле",
    label: "Рекомендуемый размер ФИФА",
    size: 105,
    width: 105,
    height: 68,
    axis: "x",
    note: "Берём поле 105 × 68 м — размер, рекомендованный ФИФА. Сравниваем длинную сторону.",
    source:
      "https://publications.fifa.com/es/football-stadiums-guidelines/technical-guideline/stadium-guidelines/pitch-dimensions-and-surrounding-areas/",
  },
  whale: {
    id: "whale",
    name: "Синий кит",
    label: "Крупный взрослый · от головы до хвоста",
    size: 30,
    ...artwork.whale,
    axis: "x",
    note: "Здесь сравниваем крупного синего кита длиной 30 м. Размеры зависят от популяции: антарктические киты могут быть ещё длиннее.",
    source: "https://www.fisheries.noaa.gov/species/blue-whale",
  },
  trex: {
    id: "trex",
    name: "Тираннозавр",
    label: "Взрослый · от носа до кончика хвоста",
    size: 12,
    ...artwork.trex,
    axis: "x",
    note: "Взрослый тираннозавр — около 12 м от носа до кончика хвоста. Это оценка по ископаемым остаткам, а не размер каждого динозавра.",
    source: "https://www.nhm.ac.uk/discover/dino-directory/tyrannosaurus.html",
  },
  bus: {
    id: "bus",
    name: "Лондонский автобус",
    label: "Классический Routemaster RM · длина",
    size: 8.38,
    ...artwork.bus,
    axis: "x",
    note: "Короткий классический Routemaster RM имеет длину 27 футов 6 дюймов — примерно 8,38 м. Более длинный RML здесь не используется.",
    source: "https://routemaster.org.uk/pages/history-51-RMF",
  },
  giraffe: {
    id: "giraffe",
    name: "Жираф",
    label: "Взрослый самец · до верхушки рожек",
    size: 5,
    ...artwork.giraffe,
    axis: "y",
    note: "Для сравнения взят взрослый самец высотой 5 м. Это пример: самцы жирафов могут достигать примерно 5,5 м.",
    source: "https://animals.sandiegozoo.org/animals/giraffe",
  },
  elephant: {
    id: "elephant",
    name: "Африканский слон",
    label: "Взрослый самец · высота в плечах",
    size: 3.2,
    ...artwork.elephant,
    axis: "y",
    note: "Сравниваем самца высотой 3,2 м в плечах. Это верхняя граница среднего диапазона 3–3,2 м, приведённого зоопарком Сан-Диего.",
    source: "https://animals.sandiegozoo.org/animals/elephant",
  },
  hoop: {
    id: "hoop",
    name: "Баскетбольное кольцо",
    label: "От пола до верхнего края кольца",
    size: 3.05,
    ...artwork.hoop,
    axis: "y",
    note: "Верхний край баскетбольного кольца находится на высоте 3,05 м. Сравниваем именно кольцо: щит и опора выше него.",
    source:
      "https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf",
  },
  sequoia: {
    id: "sequoia",
    name: "Секвойя Генерал Шерман",
    label: "Высота живого дерева",
    size: 83.8,
    width: 32.5,
    height: 83.8,
    axis: "y",
    note: "Высота дерева Генерал Шерман — 83,8 м. Оно выше ракеты «Фалькон-9».",
    source: "https://www.nps.gov/seki/learn/nature/sherman.htm",
  },
  unity: {
    id: "unity",
    name: "Статуя Единства",
    label: "Индия · высота самой статуи",
    size: 182,
    width: 46,
    height: 182,
    axis: "y",
    note: "Статуя Сардара Пателя достигает 182 м. В игре не учитываем основание и смотровую площадку.",
    source: "https://gujarattourism.com/central-zone/narmada/statue-of-unity.html",
  },
  iss: {
    id: "iss",
    name: "МКС",
    label: "Размах от края до края",
    size: 109,
    width: 109,
    height: 23,
    axis: "x",
    note: "Солнечные батареи Международной космической станции раскинулись примерно на 109 м. Здесь сравниваем размах станции, а не длину жилых модулей.",
    source: "https://www.nasa.gov/reference/international-space-station/",
  },
  squid: {
    id: "squid",
    name: "Гигантский кальмар",
    label: "Рекордный экземпляр · со щупальцами",
    size: 13,
    width: 13,
    height: 3.1,
    axis: "x",
    note: "Самый длинный зарегистрированный гигантский кальмар достигал почти 13 м с вытянутыми щупальцами. Это рекорд, а не обычная длина взрослого кальмара.",
    source: "https://ocean.si.edu/ocean-life/invertebrates/giant-squid",
  },
};
export type Pair = {
  id: string;
  reference: ObjectId;
  target: ObjectId;
  title: string;
};
export const pairs: Pair[] = [
  {
    id: "ny-london",
    reference: "liberty",
    target: "clock",
    title: "Биг-Бен рядом со Статуей Свободы",
  },
  {
    id: "plane-pitch",
    reference: "airbus",
    target: "pitch",
    title: "Поле рядом с самолётом",
  },
  {
    id: "paris-egypt",
    reference: "eiffel",
    target: "pyramid",
    title: "Париж и Древний Египет",
  },
  {
    id: "paris-ny",
    reference: "eiffel",
    target: "liberty",
    title: "Два символа, один масштаб",
  },
  {
    id: "paris-space",
    reference: "eiffel",
    target: "rocket",
    title: "Башня и ракета",
  },
  {
    id: "london-space",
    reference: "clock",
    target: "rocket",
    title: "Ракета рядом с Биг-Беном",
  },
  {
    id: "egypt-space",
    reference: "pyramid",
    target: "rocket",
    title: "Ракета у пирамиды",
  },
  {
    id: "egypt-london",
    reference: "pyramid",
    target: "clock",
    title: "Камень и часы",
  },
  {
    id: "ship-plane",
    reference: "titanic",
    target: "airbus",
    title: "Гиганты моря и неба",
  },
  {
    id: "ship-pitch",
    reference: "titanic",
    target: "pitch",
    title: "Футбол на палубе",
  },
  {
    id: "plane-whale",
    reference: "airbus",
    target: "whale",
    title: "Кит рядом с авиалайнером",
  },
  {
    id: "whale-trex",
    reference: "whale",
    target: "trex",
    title: "Хищник рядом с китом",
  },
  {
    id: "whale-bus",
    reference: "whale",
    target: "bus",
    title: "Сколько автобусов в одном ките?",
  },
  {
    id: "bus-trex",
    reference: "bus",
    target: "trex",
    title: "Тираннозавр на автобусной остановке",
  },
  {
    id: "pitch-whale",
    reference: "pitch",
    target: "whale",
    title: "Кит на футбольном поле",
  },
  {
    id: "giraffe-elephant",
    reference: "giraffe",
    target: "elephant",
    title: "Слон рядом с жирафом",
  },
  {
    id: "giraffe-hoop",
    reference: "giraffe",
    target: "hoop",
    title: "Жираф на баскетбольной площадке",
  },
  {
    id: "elephant-hoop",
    reference: "elephant",
    target: "hoop",
    title: "Слон и баскетбольное кольцо",
  },
  { id: "tree-rocket", reference: "sequoia", target: "rocket", title: "Дерево выше ракеты?" },
  { id: "tree-clock", reference: "sequoia", target: "clock", title: "Биг-Бен рядом с секвойей" },
  { id: "tree-liberty", reference: "sequoia", target: "liberty", title: "Статуя Свободы и живая секвойя" },
  { id: "unity-pyramid", reference: "unity", target: "pyramid", title: "Пирамида рядом со Статуей Единства" },
  { id: "unity-eiffel", reference: "eiffel", target: "unity", title: "Самая высокая статуя рядом с башней" },
  { id: "unity-clock", reference: "unity", target: "clock", title: "Биг-Бен рядом с гигантом" },
  { id: "iss-pitch", reference: "pitch", target: "iss", title: "Футбольное поле и МКС" },
  { id: "iss-airbus", reference: "iss", target: "airbus", title: "Авиалайнер рядом с МКС" },
  { id: "iss-titanic", reference: "titanic", target: "iss", title: "Космическая станция рядом с лайнером" },
  { id: "squid-trex", reference: "trex", target: "squid", title: "Кальмар длиннее тираннозавра?" },
  { id: "squid-bus", reference: "squid", target: "bus", title: "Автобус рядом с гигантским кальмаром" },
  { id: "squid-whale", reference: "whale", target: "squid", title: "Кальмар рядом с синим китом" },
];

function selectDistinct(candidates: Pair[], count: number): Pair[] | null {
  function visit(start: number, selected: Pair[], used: Set<ObjectId>): Pair[] | null {
    if (selected.length === count) return selected;
    for (let i = start; i < candidates.length; i++) {
      const pair = candidates[i];
      if (used.has(pair.reference) || used.has(pair.target)) continue;
      const next = visit(i + 1, [...selected, pair], new Set([...used, pair.reference, pair.target]));
      if (next) return next;
    }
    return null;
  }
  return visit(0, [], new Set());
}

export function chooseRounds(recentPairIds: readonly string[] = []): Pair[] {
  const chosen: Pair[] = [];
  for (const [axis, count] of [
    ["y", 3],
    ["x", 2],
  ] as const) {
    const candidates = shuffle(pairs.filter((p) => objects[p.reference].axis === axis));
    const fresh = candidates.filter((p) => !recentPairIds.includes(p.id));
    const selected = selectDistinct(fresh, count) ?? selectDistinct(candidates, count);
    if (!selected) throw new Error(`Недостаточно разных сравнений для оси ${axis}`);
    chosen.push(...selected);
  }
  return shuffle(chosen);
}
