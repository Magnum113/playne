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
  | "motherland"
  | "iss"
  | "squid"
  | "burj"
  | "ostankino"
  | "skytree"
  | "pisa"
  | "christ"
  | "moai"
  | "saturnv"
  | "washington"
  | "angel"
  | "arc"
  | "ostrich"
  | "penguin"
  | "tajmahal"
  | "spaceneedle"
  | "sphinx"
  | "concorde"
  | "shuttle"
  | "perseverance"
  | "lunarrover"
  | "sr71"
  | "an225"
  | "queenmary2"
  | "seawise"
  | "crocodile"
  | "whaleshark"
  | "cybertruck"
  | "beetle"
  | "container"
  | "tennis"
  | "komodo";
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
  motherland: {
    id: "motherland",
    name: "Родина-мать зовёт!",
    label: "Волгоград · вместе с мечом",
    size: 85,
    ...artwork.motherland,
    axis: "y",
    note: "Высота скульптуры вместе с мечом — 85 м. Это всего на 1,2 м выше секвойи Генерал Шерман.",
    source: "https://stalingrad-battle.ru/about/about-museum-inner/2302/",
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
  burj: {
    id: "burj",
    name: "Бурдж-Халифа",
    label: "Дубай · вместе со шпилем",
    size: 828,
    ...artwork.burj,
    axis: "y",
    note: "Высота Бурдж-Халифы вместе со шпилем — 828 м. Это примерно две с половиной Эйфелевы башни.",
    source: "https://www.emaar.com/en/other-emaar-businesses/burj-khalifa",
  },
  ostankino: {
    id: "ostankino",
    name: "Останкинская телебашня",
    label: "Москва · вместе с флагштоком",
    size: 540.1,
    ...artwork.ostankino,
    axis: "y",
    note: "Высота Останкинской телебашни вместе с флагштоком — 540,1 м. Смотровая площадка находится значительно ниже вершины.",
    source: "https://opb.group/proekty/stu/ostankinskaya-telebashnya/",
  },
  skytree: {
    id: "skytree",
    name: "Токийская телебашня Skytree",
    label: "Токио · до вершины антенны",
    size: 634,
    ...artwork.skytree,
    axis: "y",
    note: "Полная высота Tokyo Skytree — 634 м. Внизу башня имеет треугольное основание, а выше её сечение становится круглым.",
    source: "https://www.tokyo-skytree.jp/about/outline/",
  },
  pisa: {
    id: "pisa",
    name: "Пизанская башня",
    label: "Италия · около 56 м над землёй",
    size: 56,
    ...artwork.pisa,
    axis: "y",
    note: "Для сравнения берём округлённую высоту над землёй — 56 м. Из-за наклона высота двух сторон различается; подземный фундамент не учитываем.",
    source: "https://www.visittuscany.com/it/attrazioni/the-leaning-tower/",
  },
  christ: {
    id: "christ",
    name: "Христос-Искупитель",
    label: "Рио-де-Жанейро · без пьедестала",
    size: 30,
    ...artwork.christ,
    axis: "y",
    note: "Сама статуя Христа-Искупителя имеет высоту 30 м. Её восьмиметровый пьедестал в сравнение не входит.",
    source: "https://riotur.rio/que_fazer/cristoredentor/",
  },
  moai: {
    id: "moai",
    name: "Моаи Паро",
    label: "Остров Пасхи · реконструкция без пукао",
    size: 9.8,
    ...artwork.moai,
    axis: "y",
    note: "Паро имеет длину 9,8 м от основания до макушки. Показываем его вертикальную реконструкцию без каменного головного убора: сегодня статуя лежит поваленной.",
    source: "https://www.isladepascua.uchile.cl/moai.html",
  },
  saturnv: {
    id: "saturnv",
    name: "Ракета «Сатурн-5»",
    label: "С кораблём «Аполлон» и аварийной башней",
    size: 110.6,
    ...artwork.saturnv,
    axis: "y",
    note: "Высота «Сатурна-5» в лунной конфигурации — 110,6 м, включая корабль «Аполлон» и башню аварийного спасения.",
    source: "https://www.nasa.gov/wp-content/uploads/2015/03/167718main_early_years.pdf?emrc=8bba53",
  },
  washington: {
    id: "washington",
    name: "Монумент Вашингтону",
    label: "Вашингтон · историческая высота",
    size: 169.3,
    ...artwork.washington,
    axis: "y",
    note: "Историческая высота обелиска — около 169,3 м (555 футов 5⅛ дюйма). Разные способы выбора нижней точки измерения дают небольшое расхождение.",
    source: "https://www.nps.gov/wamo/learn/historyculture/index.htm",
  },
  angel: {
    id: "angel",
    name: "Ангел Севера",
    label: "Гейтсхед · высота стальной скульптуры",
    size: 20,
    ...artwork.angel,
    axis: "y",
    note: "Высота Ангела Севера — 20 м, а размах крыльев — 54 м. Здесь сравниваем высоту, а не размах.",
    source: "https://lamesleyparishcouncil.gov.uk/the-angel-of-the-north/",
  },
  arc: {
    id: "arc",
    name: "Триумфальная арка",
    label: "Париж · на площади Шарля де Голля",
    size: 50,
    ...artwork.arc,
    axis: "y",
    note: "Высота парижской Триумфальной арки — 50 м. Она почти вдвое ниже башни Елизаветы в Лондоне.",
    source: "https://www.paris.fr/pages/a-la-place-de-l-arc-de-triomphe-devait-troner-un-elephant-18396",
  },
  ostrich: {
    id: "ostrich",
    name: "Африканский страус",
    label: "Крупный взрослый самец · стоя",
    size: 2.7,
    ...artwork.ostrich,
    axis: "y",
    note: "Берём крупного взрослого самца высотой 2,7 м. Это верхняя граница диапазона 2,1–2,7 м, а не обычный размер любого страуса.",
    source: "https://animals.sandiegozoo.org/animals/ostrich?qt-animals_page_content_tabs=0",
  },
  penguin: {
    id: "penguin",
    name: "Императорский пингвин",
    label: "Крупный взрослый · высота стоя",
    size: 1.2,
    ...artwork.penguin,
    axis: "y",
    note: "Сравниваем крупного взрослого пингвина высотой 1,2 м стоя. Аквариум Тихого океана приводит диапазон 0,9–1,2 м; длина от клюва до хвоста — другая величина.",
    source: "https://www.aquariumofpacific.org/onlinelearningcenter/species/emperor_penguin",
  },
  tajmahal: {
    id: "tajmahal",
    name: "Тадж-Махал",
    label: "Агра · мавзолей с навершием",
    size: 73,
    ...artwork.tajmahal,
    axis: "y",
    note: "Полная высота мавзолея до кончика навершия — около 73 м. В изображении учитываем его мраморное основание; четыре отдельных минарета не показаны.",
    source: "https://www.gia.edu/gems-gemology/fall-2019-era-of-the-taj-mahal-and-mughals",
  },
  spaceneedle: {
    id: "spaceneedle",
    name: "Спейс-Нидл",
    label: "Сиэтл · до вершины шпиля",
    size: 184.4,
    ...artwork.spaceneedle,
    axis: "y",
    note: "Высота башни Спейс-Нидл — 605 футов, или около 184,4 м. Её узнаваемая «летающая тарелка» находится ниже кончика шпиля.",
    source: "https://www.spaceneedle.com/wp-content/uploads/2018/08/Space-Needle-Debuts-Dramatic-360-Degree-Spacelift.pdf",
  },
  sphinx: {
    id: "sphinx",
    name: "Большой сфинкс",
    label: "Гиза · от основания до макушки",
    size: 20,
    ...artwork.sphinx,
    axis: "y",
    note: "Высота Большого сфинкса от земли до макушки — около 20 м. Его тело вытянуто на 73,5 м, но здесь сравниваем высоту.",
    source: "https://sis.gov.eg/en/egypt/tourism/landmarks/sphinx/",
  },
  concorde: {
    id: "concorde",
    name: "«Конкорд»",
    label: "Серийный самолёт · от носа до хвоста",
    size: 61.66,
    ...artwork.concorde,
    axis: "x",
    note: "Длина серийного «Конкорда» — 61,66 м. Прототипы были короче, а в полёте нагретый фюзеляж немного удлинялся.",
    source: "https://airandspace.si.edu/collection-objects/concorde-fox-alpha-air-france/nasm_A20030139000",
  },
  shuttle: {
    id: "shuttle",
    name: "Космический шаттл",
    label: "Орбитальный корабль · без ракеты-носителя",
    size: 37.24,
    ...artwork.shuttle,
    axis: "x",
    note: "Длина орбитального корабля Space Shuttle — 37,24 м. Внешний топливный бак и стартовые ускорители в сравнение не входят.",
    source: "https://ntrs.nasa.gov/api/citations/19810022734/downloads/19810022734.pdf",
  },
  perseverance: {
    id: "perseverance",
    name: "Марсоход Perseverance",
    label: "Длина корпуса · манипулятор сложен",
    size: 3,
    ...artwork.perseverance,
    axis: "x",
    note: "Длина марсохода Perseverance — около 3 м. Двухметровый манипулятор здесь сложен: его вылет не добавляем к длине корпуса.",
    source: "https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/",
  },
  lunarrover: {
    id: "lunarrover",
    name: "Лунный автомобиль «Аполлона»",
    label: "LRV · длина рамы",
    size: 3.1,
    ...artwork.lunarrover,
    axis: "x",
    note: "Длина рамы лунного автомобиля LRV — 3,1 м. Эти электромобили использовали астронавты «Аполлонов-15, -16 и -17».",
    source: "https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html",
  },
  sr71: {
    id: "sr71",
    name: "Самолёт SR-71 Blackbird",
    label: "Разведчик · от носа до хвоста",
    size: 32.74,
    ...artwork.sr71,
    axis: "x",
    note: "Длина SR-71A — 107 футов 5 дюймов, или около 32,74 м. Этот узкий разведчик длиннее крупного синего кита из игры.",
    source: "https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/198054/AFmuseum/lockheed-sr-71a/",
  },
  an225: {
    id: "an225",
    name: "Ан-225 «Мрия»",
    label: "Исторический самолёт · длина",
    size: 84,
    ...artwork.an225,
    axis: "x",
    note: "Длина Ан-225 «Мрия» — 84 м: на 11,3 м больше, чем у А380 из игры. Показываем исторический облик самолёта.",
    source: "https://www.antonov.com/en/history/an-225-mriya",
  },
  queenmary2: {
    id: "queenmary2",
    name: "Лайнер Queen Mary 2",
    label: "От носа до кормы",
    size: 345,
    ...artwork.queenmary2,
    axis: "x",
    note: "Длина трансатлантического лайнера Queen Mary 2 — около 345 м. Он примерно на 76 м длиннее «Титаника».",
    source: "https://my.cunard.com/en-gb/cruise-ships/queen-mary-2/9",
  },
  seawise: {
    id: "seawise",
    name: "Танкер Seawise Giant",
    label: "Исторический супертанкер · полная длина",
    size: 458.45,
    ...artwork.seawise,
    axis: "x",
    note: "Длина супертанкера Seawise Giant после удлинения — 458,45 м. В 2010 году судно разобрали; его также знали под именами Jahre Viking и Knock Nevis.",
    source: "https://www.guinnessworldrecords.com/world-records/116229-largest-ship-ever",
  },
  crocodile: {
    id: "crocodile",
    name: "Крокодил Лолонг",
    label: "Гребнистый крокодил · измеренный экземпляр",
    size: 6.17,
    ...artwork.crocodile,
    axis: "x",
    note: "Гребнистого крокодила Лолонга измерили в 2011 году: 6,17 м от носа до хвоста. Это конкретный гигантский экземпляр, а не средний размер крокодила.",
    source: "https://www.guinnessworldrecords.com/news/2013/2/worlds-largest-crocodile-in-captivity-dies",
  },
  whaleshark: {
    id: "whaleshark",
    name: "Китовая акула",
    label: "Рекордная оценка · от головы до хвоста",
    size: 18.8,
    ...artwork.whaleshark,
    axis: "x",
    note: "Для сравнения берём рекордную оценку 18,8 м, приведённую в научной литературе. Обычные китовые акулы гораздо меньше; точность рекордных измерений у этого вида ограничена.",
    source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4304853/",
  },
  cybertruck: {
    id: "cybertruck",
    name: "Tesla Cybertruck",
    label: "Серийный пикап · полная длина",
    size: 5.6829,
    ...artwork.cybertruck,
    axis: "x",
    note: "Полная длина серийного Cybertruck — 5,6829 м по руководству Tesla.",
    source: "https://www.tesla.com/ownersmanual/cybertruck/en_us/GUID-12A976DD-EB60-431B-AFF1-5A37E95006DB.html",
  },
  beetle: {
    id: "beetle",
    name: "Volkswagen «Жук»",
    label: "Классический Käfer 1200/1200 L",
    size: 4.07,
    ...artwork.beetle,
    axis: "x",
    note: "Длина классического Volkswagen Käfer 1200/1200 L — 4,07 м. Это старый «Жук», а не более крупные New Beetle или Beetle XXI века.",
    source: "https://www.volkswagen-newsroom.com/en/vehicle-data-beetle-kaefer-12001200l-profile-19585",
  },
  container: {
    id: "container",
    name: "Морской контейнер",
    label: "40 футов · наружная длина",
    size: 12.192,
    ...artwork.container,
    axis: "x",
    note: "Наружная длина стандартного 40-футового контейнера — 12,192 м. Внутреннее пространство короче: сравниваем именно внешний габарит.",
    source: "https://www.maersk.com/~/media_sc9/maersk/local-information/files/asia-pacific/korea/export/forms/soc-acceptance-guidance-for-customer-korean-v4.pdf",
  },
  tennis: {
    id: "tennis",
    name: "Теннисный корт",
    label: "Парный корт · от линии до линии",
    size: 23.77,
    ...artwork.tennis,
    axis: "x",
    note: "Длина теннисного корта — 23,77 м, ширина для парной игры — 10,97 м. Зоны для разбега за пределами линий не учитываем.",
    source: "https://www.itftennis.com/en/about-us/organisation/tennis-glossary/",
  },
  komodo: {
    id: "komodo",
    name: "Комодский варан",
    label: "Крупный взрослый · с хвостом",
    size: 3,
    ...artwork.komodo,
    axis: "x",
    note: "Берём крупного комодского варана длиной 3 м вместе с хвостом. Это верхняя граница, приведённая зоопарком Сан-Диего, а не средний размер каждого варана.",
    source: "https://animals.sandiegozoo.org/animals/lizard",
  },
};
export type Pair = {
  id: string;
  reference: ObjectId;
  target: ObjectId;
  title: string;
};
const legacyPairs: Pair[] = [
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
  { id: "tree-motherland", reference: "sequoia", target: "motherland", title: "Родина-мать рядом с секвойей" },
  { id: "rocket-motherland", reference: "rocket", target: "motherland", title: "Родина-мать и ракета" },
  { id: "unity-motherland", reference: "unity", target: "motherland", title: "Две огромные статуи" },
  { id: "liberty-motherland", reference: "liberty", target: "motherland", title: "Статуя Свободы и Родина-мать" },
  { id: "iss-pitch", reference: "pitch", target: "iss", title: "Футбольное поле и МКС" },
  { id: "iss-airbus", reference: "iss", target: "airbus", title: "Авиалайнер рядом с МКС" },
  { id: "iss-titanic", reference: "titanic", target: "iss", title: "Космическая станция рядом с лайнером" },
  { id: "squid-trex", reference: "trex", target: "squid", title: "Кальмар длиннее тираннозавра?" },
  { id: "squid-bus", reference: "squid", target: "bus", title: "Автобус рядом с гигантским кальмаром" },
  { id: "squid-whale", reference: "whale", target: "squid", title: "Кальмар рядом с синим китом" },
];

// Older open tabs know only these comparisons. The API uses this fixed pool
// unless a client explicitly sends the pair IDs included in its own bundle.
export const legacyPairIds: readonly string[] = Object.freeze(
  legacyPairs.map((pair) => pair.id),
);

export const pairs: Pair[] = [
  ...legacyPairs,
  { id: "skytree-burj", reference: "skytree", target: "burj", title: "Бурдж-Халифа рядом с Tokyo Skytree" },
  { id: "burj-ostankino", reference: "burj", target: "ostankino", title: "Останкинская башня и Бурдж-Халифа" },
  { id: "ostankino-skytree", reference: "ostankino", target: "skytree", title: "Две телебашни: Москва и Токио" },
  { id: "eiffel-ostankino", reference: "eiffel", target: "ostankino", title: "Останкинская башня рядом с Эйфелевой" },
  { id: "burj-eiffel", reference: "burj", target: "eiffel", title: "Эйфелева башня у Бурдж-Халифы" },
  { id: "liberty-pisa", reference: "liberty", target: "pisa", title: "Пизанская башня рядом со Статуей Свободы" },
  { id: "rocket-pisa", reference: "rocket", target: "pisa", title: "Ракета и наклонная башня" },
  { id: "angel-christ", reference: "angel", target: "christ", title: "Христос-Искупитель и Ангел Севера" },
  { id: "arc-christ", reference: "arc", target: "christ", title: "Статуя Христа рядом с Триумфальной аркой" },
  { id: "christ-moai", reference: "christ", target: "moai", title: "Моаи рядом со статуей Христа" },
  { id: "sphinx-moai", reference: "sphinx", target: "moai", title: "Каменные великаны Египта и Рапа-Нуи" },
  { id: "rocket-saturnv", reference: "rocket", target: "saturnv", title: "Две ракеты: «Фалькон-9» и «Сатурн-5»" },
  { id: "sequoia-saturnv", reference: "sequoia", target: "saturnv", title: "Лунная ракета рядом с секвойей" },
  { id: "pyramid-washington", reference: "pyramid", target: "washington", title: "Монумент Вашингтону и пирамида Хеопса" },
  { id: "unity-washington", reference: "unity", target: "washington", title: "Обелиск рядом со Статуей Единства" },
  { id: "arc-angel", reference: "arc", target: "angel", title: "Ангел Севера рядом с Триумфальной аркой" },
  { id: "sphinx-angel", reference: "sphinx", target: "angel", title: "Крылатый ангел и Большой сфинкс" },
  { id: "liberty-arc", reference: "liberty", target: "arc", title: "Триумфальная арка рядом со Статуей Свободы" },
  { id: "motherland-arc", reference: "motherland", target: "arc", title: "Парижская арка рядом с Родиной-матерью" },
  { id: "giraffe-ostrich", reference: "giraffe", target: "ostrich", title: "Страус рядом с жирафом" },
  { id: "elephant-ostrich", reference: "elephant", target: "ostrich", title: "Самая высокая птица рядом со слоном" },
  { id: "ostrich-penguin", reference: "ostrich", target: "penguin", title: "Две птицы: страус и пингвин" },
  { id: "hoop-penguin", reference: "hoop", target: "penguin", title: "Императорский пингвин у баскетбольного кольца" },
  { id: "rocket-tajmahal", reference: "rocket", target: "tajmahal", title: "Тадж-Махал рядом с ракетой" },
  { id: "motherland-tajmahal", reference: "motherland", target: "tajmahal", title: "Тадж-Махал рядом с Родиной-матерью" },
  { id: "unity-spaceneedle", reference: "unity", target: "spaceneedle", title: "Спейс-Нидл рядом со Статуей Единства" },
  { id: "eiffel-spaceneedle", reference: "eiffel", target: "spaceneedle", title: "Башни Сиэтла и Парижа" },
  { id: "liberty-sphinx", reference: "liberty", target: "sphinx", title: "Сфинкс рядом со Статуей Свободы" },
  { id: "christ-sphinx", reference: "christ", target: "sphinx", title: "Статуя Христа и Большой сфинкс" },
  { id: "washington-spaceneedle", reference: "washington", target: "spaceneedle", title: "Монумент Вашингтону и Спейс-Нидл" },
  { id: "airbus-concorde", reference: "airbus", target: "concorde", title: "«Конкорд» рядом с А380" },
  { id: "pitch-concorde", reference: "pitch", target: "concorde", title: "Сверхзвуковой самолёт на футбольном поле" },
  { id: "airbus-shuttle", reference: "airbus", target: "shuttle", title: "Космический шаттл рядом с авиалайнером" },
  { id: "concorde-shuttle", reference: "concorde", target: "shuttle", title: "Два крылатых символа скорости" },
  { id: "lunarrover-perseverance", reference: "lunarrover", target: "perseverance", title: "Лунный автомобиль и марсоход" },
  { id: "cybertruck-perseverance", reference: "cybertruck", target: "perseverance", title: "Марсоход рядом с Cybertruck" },
  { id: "beetle-lunarrover", reference: "beetle", target: "lunarrover", title: "Лунный автомобиль рядом с «Жуком»" },
  { id: "bus-lunarrover", reference: "bus", target: "lunarrover", title: "Лунный автомобиль на автобусной остановке" },
  { id: "whale-sr71", reference: "whale", target: "sr71", title: "Самолёт-разведчик рядом с синим китом" },
  { id: "shuttle-sr71", reference: "shuttle", target: "sr71", title: "SR-71 рядом с космическим шаттлом" },
  { id: "airbus-an225", reference: "airbus", target: "an225", title: "Два гиганта: А380 и «Мрия»" },
  { id: "pitch-an225", reference: "pitch", target: "an225", title: "«Мрия» на футбольном поле" },
  { id: "titanic-queenmary2", reference: "titanic", target: "queenmary2", title: "Queen Mary 2 рядом с «Титаником»" },
  { id: "queenmary2-seawise", reference: "queenmary2", target: "seawise", title: "Супертанкер рядом с океанским лайнером" },
  { id: "seawise-iss", reference: "seawise", target: "iss", title: "Космическая станция рядом с супертанкером" },
  { id: "bus-crocodile", reference: "bus", target: "crocodile", title: "Крокодил Лолонг рядом с автобусом" },
  { id: "trex-crocodile", reference: "trex", target: "crocodile", title: "Два хищника: тираннозавр и крокодил" },
  { id: "whale-whaleshark", reference: "whale", target: "whaleshark", title: "Китовая акула рядом с синим китом" },
  { id: "trex-whaleshark", reference: "trex", target: "whaleshark", title: "Китовая акула длиннее тираннозавра?" },
  { id: "bus-cybertruck", reference: "bus", target: "cybertruck", title: "Cybertruck рядом с лондонским автобусом" },
  { id: "trex-cybertruck", reference: "trex", target: "cybertruck", title: "Пикап рядом с тираннозавром" },
  { id: "bus-beetle", reference: "bus", target: "beetle", title: "Классический «Жук» рядом с автобусом" },
  { id: "crocodile-beetle", reference: "crocodile", target: "beetle", title: "Крокодил длиннее «Жука»?" },
  { id: "bus-container", reference: "bus", target: "container", title: "Морской контейнер рядом с автобусом" },
  { id: "trex-container", reference: "trex", target: "container", title: "Тираннозавр и сорокафутовый контейнер" },
  { id: "pitch-tennis", reference: "pitch", target: "tennis", title: "Теннисный корт на футбольном поле" },
  { id: "whale-tennis", reference: "whale", target: "tennis", title: "Синий кит на теннисном корте" },
  { id: "crocodile-komodo", reference: "crocodile", target: "komodo", title: "Крокодил и комодский варан" },
  { id: "trex-komodo", reference: "trex", target: "komodo", title: "Варан рядом с тираннозавром" },
  { id: "queenmary2-airbus", reference: "queenmary2", target: "airbus", title: "Авиалайнер на фоне Queen Mary 2" },
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

export function chooseRounds(
  recentPairIds: readonly string[] = [],
  supportedPairIds?: readonly string[],
): Pair[] {
  const supported = supportedPairIds ? new Set(supportedPairIds) : null;
  const chosen: Pair[] = [];
  for (const [axis, count] of [
    ["y", 3],
    ["x", 2],
  ] as const) {
    const candidates = shuffle(
      pairs.filter(
        (p) =>
          objects[p.reference].axis === axis &&
          (!supported || supported.has(p.id)),
      ),
    );
    const fresh = candidates.filter((p) => !recentPairIds.includes(p.id));
    const selected = selectDistinct(fresh, count) ?? selectDistinct(candidates, count);
    if (!selected) throw new Error(`Недостаточно разных сравнений для оси ${axis}`);
    chosen.push(...selected);
  }
  return shuffle(chosen);
}
