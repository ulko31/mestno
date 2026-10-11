#!/usr/bin/env python3
"""Research snapshot. Rebuilding it must never pretend to recheck sources."""
from import_places import base, source, feature, write_catalogue, ROOT
from research_oct2026 import extend_catalogue
CHECKED_AT = '2026-10-11T00:00:00+00:00'

rows = [
 ('yasnaya','Ясная Поляна','coworking','улица Льва Толстого, 1–3','https://www.coworkingspb.ru/'),
 ('okhta8','Охта-8','library','Большеохтинский проспект, 8','https://www.culture.ru/institutes/58682/biblioteka-okhta-8'),
 ('okhtalib','Охта Lib','library','Брантовская дорога, 3','https://www.culture.ru/institutes/38450/biblioteka-okhta-lib'),
 ('gbs','Коворкинг библиотеки для слепых и слабовидящих','library',None,'https://www.gbs.spb.ru/ru/pages/proekty/nepreryvnoe_obrazovanie_v_biblioteke/kovorking_prostranstvo_v_biblioteke/'),
 ('brusnitsyn','Брусницын','space','Кожевенная линия, 30','https://brusnitsyn.spb.ru/about'),
 ('levashovsky','Левашовский Хлебозавод','space','Барочная улица, 4А/1','https://visit-petersburg.ru/en/leisure/places/levashovskiy-khlebozavod/'),
 ('seno','SENO','space',None,'https://visit-petersburg.ru/leisure/places/obshchestvennoe-prostranstvo-seno/'),
 ('levashovsky-nature','Заказник Левашовский','park',None,'https://oopt.kpoos.gov.spb.ru/protected_area/levashovsky/'),
 ('hermitage','Государственный Эрмитаж','museum','Дворцовая площадь, 2','https://visit-petersburg.ru/leisure/places/'),
 ('erarta','Эрарта','museum','29-я линия В.О., 2А','https://visit-petersburg.ru/leisure/places/'),
]
catalogue = 'https://www.visit-petersburg.ru/en/leisure/?PAGEN_1=13&subcategory=4470'
rows += [
 ('orion','Спортивно-стрелковый клуб Орион','activity','Пионерская улица, 21',catalogue),
 ('rc-club','RC Club','activity','улица Маршала Говорова, 35/4',catalogue),
 ('tramontana','Скалодром Трамонтана','activity','Бронницкая улица, 24',catalogue),
 ('treetotree','TreeToTree Озерки','activity','Ереванская улица, 10',catalogue),
 ('workshops','Открытые мастерские','activity','Лиговский проспект, 99',catalogue),
 ('brain','Музей мозга','museum','улица Марата, 86',catalogue),
 ('comics','Библиотека комиксов','library','7-я Красноармейская улица, 30',catalogue),
 ('grand-canyon','Гранд Каньон Айс','activity','Суздальский проспект, 29А',catalogue),
 ('avtovo-circus','Цирк в Автово','activity','Автовская улица, 1А',catalogue),
]
places = []
for ident, title, category, address, url in rows:
    p = base('seed:' + ident, title, category, address, None, None,
             [source(url, 'Официальная страница', 'Fact-only reference; no copied text/photos', 'official')])
    p['notes'] = 'Название и категория сверены с источником. Цены, часы работы и атмосфера не проверены.'
    if ident in ('yasnaya','okhta8','gbs'):
        p['features'].append(feature('coworking', True, url))
    if ident == 'levashovsky-nature':
        p['notes'] = 'Перед посещением проверьте правила особо охраняемой территории и маршрут.'
    places.append(p)
# Context-rich additions; descriptions are original factual summaries.
def add(ident, title, category, address, url, keys, notes, tags=(), refs=()):
    p = base('seed:' + ident, title, category, address, None, None,
             [source(url, 'Сайт места', 'Fact-only reference; no copied text/photos', 'official'), *refs], url)
    p['features'] = [feature(key, True, url) for key in keys]
    p['notes'] = notes
    p['tags'] = list(tags)
    p['discovery_priority'] = 3
    places.append(p)
    return p

add('coffee3', 'Coffee 3', 'cafe', 'набережная реки Карповки, 5АК', 'https://cafecoffee3.ru/',
    ['laptop_work','coworking','workshops','social_events','child_friendly'],
    'В кафе выделена рабочая зона; также есть кофейные встречи и мастер-классы. На сайте для пятницы–воскресенья указано ограничение брони в два часа. Уточни условия длительной работы.',
    ['кофе','учеба','рабочая зона','каппинг'])
add('bench', 'Бэнч', 'cafe', 'шоссе Революции, 3к2', 'https://benchplace.ru/',
    ['laptop_work','wifi','power_outlets','board_games','rpg','social_events','meetups'],
    'Дневная работа с ноутбуком, розетки и Wi-Fi описаны на сайте. Вечером бывают игры и митапы; проверь афишу и запись, если идёшь знакомиться.',
    ['кофе','учеба','D&D','DevOps','книжный клуб','митап','программирование'])
for ident, address in [('brynza-karavannaya','Караванная улица, 24'),('brynza-moskovsky','Московский проспект, 86')]:
    p = add(ident, 'Брынза · ' + address, 'cafe', address,
        'https://cafebrynza.ru/addressa/kafe-dlya-raboty-s-noutbukom/',
        ['laptop_work','wifi','power_outlets','child_friendly'],
        'Точка включена в список кафе для работы. Заведение просит делать заказы при длительном посещении. Более тихая обстановка описана для первой половины дня в будни, а не для любого времени.',
        ['кофе','учеба','работа'])
    p['features'].append(feature('quiet',True,p['website'],'weekday_morning'))
add('gaga','Playloft GaGa','anticafe','Малая Морская улица, 15/7','https://playloftgaga.ru/',
    ['board_games','rpg','social_events','laptop_work','workshops'],
    'Есть настольные игры, рабочий формат и открытая афиша. Для знакомства выбирай общую игротеку или событие, а не аренду отдельного помещения. Тариф и запись — на сайте.',
    ['настолки','D&D','чтение','мастер-класс'])
p = add('mechtatut','МечтаТут','anticafe','улица Есенина, 1к1','https://me4tut.ru/',
    ['board_games','social_events'],
    'Свободное посещение: минимальный чек 300 ₽, поминутная оплата и дневной максимум 950 ₽. Чай, печенье и игры входят в этот тариф. Аренда залов считается отдельно; на игротеку уточни запись.',
    ['настолки','мафия','игротека','найти компанию'])
p.update(price_max=950,price_scope='visit',price_source_url=p['website'],price_checked_at=CHECKED_AT)
add('roger','Клуб Роджер','activity','Зверинская улица, 36','https://rogerclub.ru/',
    ['board_games','war_games','rpg','social_events'],
    'Клуб специализируется на варгеймах и помогает найти соперника. Посещение по предварительной записи; события и правила участия уточняются в клубе.',
    ['Warhammer','варгейм','НРИ','настолки'])
add('doigralis','Доигрались','activity',None,'https://doigralis.ru/',
    ['board_games','rpg','social_events'],
    'Открытые наборы на настольные ролевые игры и кампании. Можно прийти без своей группы. До записи проверь место встречи, систему, возраст участников и стоимость конкретной игры.',
    ['D&D','НРИ','ролевые игры','ваншот'])
add('taledice', "Tale’n’Dice",'activity','улица Мира, 16','https://taledice.ru/',
    ['board_games','rpg'],
    'Официальное описание указывает настольные и ролевые игры. Доступность страницы и текущую запись на игру нужно уточнить; карточка не подтверждает свободные места сегодня.',
    ['D&D','НРИ','настолки'])
add('borey','Арт-центр Борей','gallery','Литейный проспект, 58','https://borey.ru/gallery/',
    ['exhibitions'],
    'Небольшая галерея с собственной программой. Для размышлений и вдохновения предлагается по формату, не по измеренному уровню шума. Текущую экспозицию и часы уточни в афише.',
    ['современное искусство','живопись','графика'])
add('annanova','Anna Nova Gallery','gallery','улица Жуковского, 28','https://www.annanova-gallery.ru/',
    ['exhibitions'],
    'Галерея современного искусства. Вариант для неспешного знакомства с искусством; тему выставки, часы и условия входа проверяй по текущей программе.',
    ['современное искусство','инсталляции'])
add('blank','Blank','club','Арсенальная набережная, 1','https://blankclub.ru/about',
    ['dance'],
    'Клуб электронной музыки. Смотри дату вечеринки, возрастные ограничения, правила входа и билеты: наличие танцпола не означает событие в любой день.',
    ['электронная музыка','DJ','танцы'])
p=add('leon','Leon Club','billiards','улица Оптиков, 4','https://leonclub.ru/biliard',
    ['billiards'],
    'Пул, русский бильярд и снукер. В прайсе указана платная игра; бесплатное первое занятие секции не означает бесплатную аренду стола. Тариф зависит от стола и времени.')
p['features'].append(feature('free_billiards',False,p['website'],'game'))
p=add('almak','Альмак','billiards','Новолитовская улица, 15А','https://almakclub.ru/',
    ['billiards','wifi'],
    'Бильярдный и развлекательный центр с русской пирамидой и пулом. Бесплатная парковка не подтверждает бесплатную игру. Условия и тарифы проверь на сайте.')
p=add('maximatic','МАКСИматик','billiards','проспект Космонавтов, 55','https://billclub.ru/',
    ['billiards'],
    'Пул, русский бильярд и снукер с почасовыми тарифами. Не относится к бесплатной игре. Выбор стола, бронь и итоговую стоимость уточни в клубе.')
p['features'].append(feature('free_billiards',False,p['website'],'game'))
p=add('broken-hearts','Бар разбитых сердец','bar','набережная канала Грибоедова, 30–32Ч','https://razbitye-serdtsa.clients.site/',
    ['billiards'],
    'На сайте заведения подтверждён бильярд. Restoclub описывает бесплатный пул по очереди, но указывает другой адрес — Садовая, 19. Условия игры и адрес требуют уточнения; бесплатность не подтверждена.',
    ['пул','коктейли'],
    [source('https://www.restoclub.ru/spb/place/bar-razbityh-serdec','Restoclub · требует уточнения','Fact-only reference; no copied text/photos','editorial')])
p['features'].append({**feature('free_billiards',True,'https://www.restoclub.ru/spb/place/bar-razbityh-serdec','game'),'status':'pending_review'})
add('elagin','Парк на Елагином острове','park','Елагин остров, 4','https://elaginpark.org/central-park/park-na-elaginom-ostrove-segodnya/',
    ['waterfront'],
    'Прогулка на острове у воды. У парка, выставок и мастер-классов разные правила посещения; стоимость входа и доступность отдельных объектов уточни перед выходом.',
    ['прогулка','природа','река'])
add('benua','Сад Бенуа','space','Тихорецкий проспект, 17','https://benua1890.ru/',
    ['exhibitions'],
    'Общественное пространство с садом и программой искусства. Для мечтательного настроения предлагается по формату. Проверь действующий проект: архив выставок не является текущей афишей.',
    ['паблик-арт','прогулка','современное искусство'])
add('kolokol','Колокол · Рубинштейна','activity','улица Рубинштейна, 36','https://spb.kolokol.school/',
    ['workshops'],
    'Гончарная школа предлагает запись на мастер-классы через контакты. На момент проверки сайт временно недоступен; адрес из прежней официальной программы нужно подтвердить перед записью.',
    ['керамика','гончарный круг'],
    [source('https://spb.kolokol.school/programs/20096','Программа школы · адрес уточнить','Fact-only reference; no copied text/photos','official')])
add('learning-group','Разговорные встречи Learning Group','activity',None,'https://learning-group.ru/speaking-clubs',
    ['social_events','speaking_club','english_club','board_games'],
    'Встречи для практики английского с играми и совместными занятиями. Локация зависит от события; выбирай уровень языка, дату и адрес в расписании, а не юридический адрес школы.',
    ['английский','языки','разговорный клуб'])

extend_catalogue(places, add)

for p in places:
    ident=p['id'].removeprefix('seed:')
    if ident=='coffee3': p['discovery_priority']=5
    if ident=='bench': p['discovery_priority']=6
    if ident.startswith('brynza-'): p['discovery_priority']=1
    if ident=='tramontana':
        p['category']='sport'
        url='https://www.climbingcenter.ru/'
        p['sources'].append(source(url,'Сайт скалодрома','Fact-only reference; no copied text/photos','official'))
        p['features'] += [feature('sports',True,url),feature('climbing',True,url)]
        p['notes']='Скалодром и боулдеринг. Перед первым занятием уточни инструктаж, запись и снаряжение. Стоимость не указана без проверки выбранного занятия.'
    if ident in ('orion','rc-club','grand-canyon','treetotree'):
        p['category']='sport'
        p['features'].append(feature('sports',True,p['sources'][0]['url']))
    if ident in ('hermitage','erarta'):
        p['features'].append(feature('exhibitions',True,p['sources'][0]['url']))
        p['discovery_priority']=-4
    if ident in ('yasnaya','okhta8','gbs'):
        p['features'].append(feature('laptop_work',True,p['sources'][0]['url']))
    if ident=='levashovsky':
        p['features'].append(feature('exhibitions',True,p['sources'][0]['url']))
    for ref in p['sources']: ref['retrieved_at']=CHECKED_AT
    for f in p['features']: f['checked_at']=CHECKED_AT
    if p.get('price_max') is not None:p['price_checked_at']=CHECKED_AT
    p['updated_at']=CHECKED_AT
write_catalogue(places, ROOT / 'dist' / 'places.json')
print('Starter records:', len(places))
