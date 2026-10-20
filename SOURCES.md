# Размеры и иллюстрации

Первый набор проверен при подготовке MVP 16 сентября 2026 года; последующие дополнения описаны ниже. Размеры округлены для игры; допуск полного попадания — 2% по отношению размеров.

| Объект | Размер в игре | Что сравниваем | Источник |
| --- | --- | --- | --- |
| Эйфелева башня | 330 м | Высота с антенной | [Официальный сайт башни](https://www.toureiffel.paris/en/the-monument/key-figures) |
| Пирамида Хеопса | 146,6 м | Первоначальная высота; около 481 фута | [Смитсоновский институт](https://www.si.edu/spotlight/ancient-egypt/pyramid) |
| Статуя Свободы | 93 м | От земли до факела, с пьедесталом | [Служба национальных парков США](https://www.nps.gov/places/000/statue-front.htm) |
| Биг-Бен | 96 м | Высота башни Елизаветы, не колокола | [Парламент Великобритании](https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/) |
| «Фалькон-9» | 70 м | Ракета со стандартным обтекателем | [Руководство SpaceX](https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf) |
| Аэробус А380 | 72,7 м | Длина от носа до хвоста | [Airbus: Facts and Figures](https://www.airbus.com/sites/g/files/jlcbta136/files/2021-10/EN-Airbus-A380-Facts-and-Figures_0.pdf) |
| «Титаник» | 269 м | Общая длина | [Tourism Ireland](https://www.ireland.com/en/magazine/long-reads/belfasts-titanic-legacy/) |
| Футбольное поле | 105 м | Длина рекомендованного поля 105 × 68 м | [Рекомендации ФИФА](https://publications.fifa.com/es/football-stadiums-guidelines/technical-guideline/stadium-guidelines/pitch-dimensions-and-surrounding-areas/) |

Первые восемь силуэтов нарисованы кодом в `src/Silhouette.tsx`; графика Magnitudle не копировалась. Используются упрощённые контуры. Ширина и второстепенные детали высоких объектов служат визуальным представлением; ответ оценивается только по явно указанной высоте или длине.

## Проверка пропорций иллюстраций

16 сентября 2026 года все восемь рисунков переведены из растягиваемого квадрата в собственные координаты. При масштабировании ширина и высота теперь изменяются с одним коэффициентом.

| Рисунок | Исправление |
| --- | --- |
| Эйфелева башня | Сужение башни к вершине, решётка, площадки и нижняя арка нарисованы в общих координатах. |
| Пирамида | Треугольный фасад с исходным соотношением основания и высоты; убрана условная боковая грань, искажавшая восприятие контура. |
| Статуя Свободы | Исправлены пропорции фигуры и пьедестала, положение руки с факелом, корона и книга. |
| Биг-Бен | Круглый циферблат диаметром 7 м; стрелки и отметки не растягиваются. |
| «Фалькон-9» | Непрерывный корпус, обтекатель и узкие стыки вместо разрывов между частями. |
| А380 | Боковой профиль, два ряда окон, стреловидные крылья, двигатели и круглые колёса. |
| «Титаник» | Профиль корпуса, четыре трубы, мачты и круглые иллюминаторы. |
| Футбольное поле | Круг центра и разметка построены в одной шкале по длине и ширине. |

Уточняющие источники: [диаметр циферблата — Парламент Великобритании](https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/), [высота фигуры и пьедестала — NPS](https://www.nps.gov/stli/learn/statue-of-liberty-facts.htm), [габариты и диаметр фюзеляжа А380 — Airbus](https://www.airbus.com/sites/g/files/jlcbta136/files/2021-12/EN-Airbus-A380-Facts-and-Figures-December-2021_0.pdf).

Визуальная галерея проверена для всех восьми объектов. Размеры круглых деталей дополнительно сверены в браузере; на игровом поле проверены большой и маленький Биг-Бен, а также результат на узком экране. Силуэты остаются стилизованными: архитектурные и конструктивные детали не претендуют на точность чертежа.

## Новые сравнения: животные, автобус и баскетбол

Добавлено 10 пар, всего 22. Партия по-прежнему состоит из пяти раундов. В каталоге 14 объектов.

| Объект | Размер в игре | Уточнение и источник |
| --- | --- | --- |
| Синий кит | 30 м | Выбран крупный взрослый экземпляр. Размеры меняются в зависимости от популяции; это не среднее для всех китов. [NOAA](https://www.fisheries.noaa.gov/species/blue-whale). |
| Тираннозавр | 12 м | Оценка длины взрослого животного по ископаемым остаткам. [Музей естественной истории, Лондон](https://www.nhm.ac.uk/discover/dino-directory/tyrannosaurus.html). |
| Автобус Routemaster RM | 8,38 м | Короткая модификация: 27 футов 6 дюймов. [Routemaster Association](https://routemaster.org.uk/pages/history-51-RMF). |
| Жираф | 5 м | Пример взрослого самца; источник указывает высоту самцов до 5,5 м. [Зоопарк Сан-Диего](https://animals.sandiegozoo.org/animals/giraffe). |
| Африканский слон | 3,2 м | Самец, высота в плечах; источник приводит средний диапазон 3–3,2 м. [Зоопарк Сан-Диего](https://animals.sandiegozoo.org/animals/elephant). |
| Баскетбольное кольцо | 3,05 м | От пола до верхнего края обода, а не до верха щита. [FIBA, оборудование 2024, §1.2.4](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf). |

Шесть новых PNG-иллюстраций созданы встроенным imagegen. Первые версии с дефектами прозрачности отклонены; финальные имеют чистый чёрный рисунок на белом фоне. В приложении SVG-маска убирает фон и окрашивает рисунок в цвет роли. Исходные PNG хранятся в `public/art/`, задания генерации — в `artifacts/generated-artwork-prompts.json`.

Изображения не растягиваются: кадр и измеряемый размер задают один общий коэффициент масштаба. Размеры по второстепенной оси следуют пропорциям рисунка и не являются отдельными измеренными характеристиками объекта. У стойки отдельно отмечен уровень кольца: пиксель Y=367 при нижней границе Y=1238 соответствует 3,05 м. Генеративные иллюстрации стилизованы и не заменяют технические чертежи или научные реконструкции.

## «Родина-мать зовёт!»

Добавлена 6 октября 2026 года. Высота волгоградской скульптуры вместе с мечом — **85 м**, по [официальному сайту музея-заповедника «Сталинградская битва»](https://stalingrad-battle.ru/about/about-museum-inner/2302/). Измеряем от основания фигуры до острия меча; холм не учитывается. Новые пары: секвойя Генерал Шерман, «Фалькон-9», Статуя Единства и Статуя Свободы. Всего в каталоге 19 объектов и 34 пары.

Стилизованный силуэт создан встроенным imagegen и сохранён в `public/art/motherland.png`: 512 × 768 пикселей, 93 КБ. Задание: узнаваемая фигура реального монумента в полный рост с поднятым мечом, вытянутой второй рукой и развевающимся платьем; чёрный силуэт с тонкими белыми линиями складок на белом фоне, без пейзажа, надписей и теней. Кадр `[116, 11, 360, 738]` охватывает фигуру и весь меч. Высота кадра соответствует 85 м; обе оси масштабируются одним коэффициентом.

## 30 объектов: октябрь 2026

Добавлены 20 октября 2026 года: 15 объектов с измерением высоты и 15 с измерением длины. В каталоге теперь 49 объектов и 94 пары; исходные 19 объектов и 34 пары сохранены. Правила выбора экземпляров и границ измерения описаны в [NAGLAZ_CONTENT_2026_10.md](NAGLAZ_CONTENT_2026_10.md).

| Объект | Размер в игре | Что сравниваем | Источник |
| --- | --- | --- | --- |
| Бурдж-Халифа | 828 м | Дубай · вместе со шпилем | [Emaar, Burj Khalifa](https://www.emaar.com/en/other-emaar-businesses/burj-khalifa) |
| Останкинская телебашня | 540,1 м | Москва · вместе с флагштоком | [Группа ОПБ, проект противопожарной безопасности телебашни для РТРС](https://opb.group/proekty/stu/ostankinskaya-telebashnya/) |
| Токийская телебашня Skytree | 634 м | Токио · до вершины антенны | [Tokyo Skytree, Outline](https://www.tokyo-skytree.jp/about/outline/) |
| Пизанская башня | 56 м | Италия · около 56 м над землёй | [Visit Tuscany, Torre Pendente di Pisa](https://www.visittuscany.com/it/attrazioni/the-leaning-tower/) |
| Христос-Искупитель | 30 м | Рио-де-Жанейро · без пьедестала | [Riotur, Cristo Redentor](https://riotur.rio/que_fazer/cristoredentor/) |
| Моаи Паро | 9,8 м | Остров Пасхи · реконструкция без пукао | [Universidad de Chile, Moai](https://www.isladepascua.uchile.cl/moai.html) |
| Ракета «Сатурн-5» | 110,6 м | С кораблём «Аполлон» и аварийной башней | [NASA, Information Summaries: The Early Years](https://www.nasa.gov/wp-content/uploads/2015/03/167718main_early_years.pdf?emrc=8bba53) |
| Монумент Вашингтону | 169,3 м | Вашингтон · историческая высота | [US National Park Service, Washington Monument History & Culture](https://www.nps.gov/wamo/learn/historyculture/index.htm) |
| Ангел Севера | 20 м | Гейтсхед · высота стальной скульптуры | [Lamesley Parish Council, The Angel of the North](https://lamesleyparishcouncil.gov.uk/the-angel-of-the-north/) |
| Триумфальная арка | 50 м | Париж · на площади Шарля де Голля | [Ville de Paris, Arc de triomphe](https://www.paris.fr/pages/a-la-place-de-l-arc-de-triomphe-devait-troner-un-elephant-18396) |
| Африканский страус | 2,7 м | Крупный взрослый самец · стоя | [San Diego Zoo Wildlife Alliance, Ostrich](https://animals.sandiegozoo.org/animals/ostrich?qt-animals_page_content_tabs=0) |
| Императорский пингвин | 1,2 м | Крупный взрослый · высота стоя | [Aquarium of the Pacific, Emperor Penguin](https://www.aquariumofpacific.org/onlinelearningcenter/species/emperor_penguin) |
| Тадж-Махал | 73 м | Агра · мавзолей с навершием | [Gemological Institute of America, исследование Тадж-Махала](https://www.gia.edu/gems-gemology/fall-2019-era-of-the-taj-mahal-and-mughals) |
| Спейс-Нидл | 184,4 м | Сиэтл · до вершины шпиля | [Space Needle, official renovation press release](https://www.spaceneedle.com/wp-content/uploads/2018/08/Space-Needle-Debuts-Dramatic-360-Degree-Spacelift.pdf) |
| Большой сфинкс | 20 м | Гиза · от основания до макушки | [Egypt State Information Service, Sphinx](https://sis.gov.eg/en/egypt/tourism/landmarks/sphinx/) |
| «Конкорд» | 61,66 м | Серийный самолёт · от носа до хвоста | [Smithsonian National Air and Space Museum, Concorde Fox Alpha](https://airandspace.si.edu/collection-objects/concorde-fox-alpha-air-france/nasm_A20030139000) |
| Космический шаттл | 37,24 м | Орбитальный корабль · без ракеты-носителя | [NASA, Space Transportation System Reference Information, Orbiter](https://ntrs.nasa.gov/api/citations/19810022734/downloads/19810022734.pdf) |
| Марсоход Perseverance | 3 м | Длина корпуса · манипулятор сложен | [NASA Science, Perseverance Rover Components](https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/) |
| Лунный автомобиль «Аполлона» | 3,1 м | LRV · длина рамы | [NASA NSSDC, The Apollo Lunar Roving Vehicle](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html) |
| Самолёт SR-71 Blackbird | 32,74 м | Разведчик · от носа до хвоста | [National Museum of the US Air Force, Lockheed SR-71A](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/198054/AFmuseum/lockheed-sr-71a/) |
| Ан-225 «Мрия» | 84 м | Исторический самолёт · длина | [Antonov Company, AN-225 Mriya](https://www.antonov.com/en/history/an-225-mriya) |
| Лайнер Queen Mary 2 | 345 м | От носа до кормы | [Cunard, Queen Mary 2](https://my.cunard.com/en-gb/cruise-ships/queen-mary-2/9) |
| Танкер Seawise Giant | 458,45 м | Исторический супертанкер · полная длина | [Guinness World Records, Largest ship ever](https://www.guinnessworldrecords.com/world-records/116229-largest-ship-ever) |
| Крокодил Лолонг | 6,17 м | Гребнистый крокодил · измеренный экземпляр | [Guinness World Records, Lolong](https://www.guinnessworldrecords.com/news/2013/2/worlds-largest-crocodile-in-captivity-dies) |
| Китовая акула | 18,8 м | Рекордная оценка · от головы до хвоста | [McClain et al., Sizing ocean giants, PeerJ 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4304853/) |
| Tesla Cybertruck | 5,6829 м | Серийный пикап · полная длина | [Tesla Cybertruck Owner's Manual, Dimensions](https://www.tesla.com/ownersmanual/cybertruck/en_us/GUID-12A976DD-EB60-431B-AFF1-5A37E95006DB.html) |
| Volkswagen «Жук» | 4,07 м | Классический Käfer 1200/1200 L | [Volkswagen Newsroom, Käfer 1200/1200L vehicle data](https://www.volkswagen-newsroom.com/en/vehicle-data-beetle-kaefer-12001200l-profile-19585) |
| Морской контейнер | 12,192 м | 40 футов · наружная длина | [Maersk, SOC acceptance guidance](https://www.maersk.com/~/media_sc9/maersk/local-information/files/asia-pacific/korea/export/forms/soc-acceptance-guidance-for-customer-korean-v4.pdf) |
| Теннисный корт | 23,77 м | Парный корт · от линии до линии | [International Tennis Federation, Tennis Glossary](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/) |
| Комодский варан | 3 м | Крупный взрослый · с хвостом | [San Diego Zoo Wildlife Alliance, Lizard](https://animals.sandiegozoo.org/animals/lizard) |

Размеры животных обозначают выбранный крупный или конкретный рекордный экземпляр. Значение 18,8 м для китовой акулы — историческая оценка из научного обзора, не современное прямое измерение. Для исторических кораблей, самолётов и монументов указан конкретный облик или способ измерения.
