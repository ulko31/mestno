"""Curated factual additions checked on 11 Oct 2026; not fabricated visitor reviews."""
from import_places import feature, source

def extend_catalogue(places, add):
    add('iva-orangery','Ива · кофейня в оранжерее','cafe','Потёмкинская улица, 2Г',
        'https://tavr-orangery.ru/kofeynya',['green_interior'],
        'Второй этаж оранжереи с видом на растения. У входа в оранжерею и заказа в кофейне отдельные условия; проверь их перед визитом.',
        ['оранжерея','пальмы','растения','кофе'])
    add('third-place','Третье место','space','Литейный проспект, 62','https://third.place/',
        ['historic_interior','art_interior','exhibitions','cinema_events'],
        'Особняк с искусством во дворе и культурной программой. У кинопоказов, выставок и двора разные условия посещения. Архив событий не означает, что выставка идёт сегодня.',
        ['современное искусство','особняк','двор','кино'])
    p=add('myth','MYTH Gallery','gallery','улица Чайковского, 61','https://mythgallery.art/kontaktyi',
        ['exhibitions','historic_interior'],
        'Современное искусство в доме с сохранённой лепниной и финской печью. Вход через домофон 55. Стандартный билет 200 ₽; текущую экспозицию проверь в афише.',
        ['современное искусство','модерн','исторический интерьер'])
    p.update(price_max=200,price_scope='visit',price_source_url=p['website'])
    p=add('artmuza','АРТМУЗА','museum','13-я линия Васильевского острова, 70–72','https://artmuza.spb.ru/',
        ['exhibitions','free_entry'],
        'Музей современного искусства с несколькими выставками. Обычный вход в музей бесплатный; отдельные занятия и события могут оплачиваться.',
        ['современное искусство','живопись','скульптура'])
    p.update(price_max=0,price_scope='visit',price_source_url=p['website'])
    add('artist','Artist · арт-кафе','cafe','13-я линия Васильевского острова, 70, 3-й этаж',
        'https://artist.artmuza.spb.ru/',['chamber_space'],
        'Кафе на третьем этаже АРТМУЗЫ; в описании указано 30 мест. Можно совместить с музеем. Небольшой зал сам по себе не подтверждает тишину.',
        ['кофе','музей','небольшой зал'])
    add('artcherdak','Чердак художника','restaurant','улица Ломоносова, 1/28','https://artcherdakrest.ru/',
        ['panoramic_view','art_interior','waterfront'],
        'Ресторан при галерее: панорамная терраса, вид на канал и произведения искусства в интерьере. Для посещения террасы уточни бронь и условия заказа.',
        ['фондю','терраса','канал','антиквариат'])
    add('bookcoffee','Книги и кофе','cafe','Гагаринская улица, 20','https://www.bookcoffee.ru/',
        ['chamber_space','live_music'],
        'Арт-кафе с гостиной и камерным залом. Вечернее мероприятие может менять обстановку. Малый зал может быть занят частной встречей; уточни доступность.',
        ['литература','концерты','книги'])
    add('palma','Особняк Пальма','space','переулок Пирогова, 18','https://palma.spb.ru/',
        ['historic_interior'],
        'Исторический особняк с творческими резидентами и залами для мероприятий. Выбирай конкретное открытое событие: аренда пространства не означает свободный вход.',
        ['архитектура','особняк','локальные бренды'])
    add('smena','Смена','cafe','Басков переулок, 20','https://smenacafeyo.tilda.ws/',[],
        'Кофейня с завтраками. На сайте указано, что столики не бронируют. Работа с ноутбуком, розетки и уровень шума отдельно не подтверждены.',
        ['кофе','завтраки'])

    # Independent branch IDs matter; two libraries in one building are distinct venues.
    lib_url='https://kr-cbs.ru/libraries'
    libraries=[
        ('rzhevskaya','Ржевская','Индустриальный проспект, 35к1','https://kr-cbs.ru/libraries/rzhevskaya',
         ['reading_space','laptop_work','child_friendly'],
         'Есть два коворкинга и детская игровая зона. Перед работой уточни регистрацию читателя и доступность нужного пространства.'),
        ('kub','КУБ','проспект Маршака, 24к1','https://kr-cbs.ru/libraries/kub',
         ['reading_space','lounge','laptop_work','child_friendly'],
         'Есть лаунж-зона для чтения и коворкинг. Это разные зоны; уточни, где можно разговаривать или работать.'),
        ('shkaf','ШКАФ','улица Маршала Тухачевского, 31','https://kr-cbs.ru/libraries/shkaf',
         ['reading_space'], 'Библиотека и арт-резиденция. Для работы в отдельном кабинете проверь правила бронирования; наличие библиотеки не гарантирует свободную переговорную.'),
        ('sovremennik-28','Современник · Заневский, 28','Заневский проспект, 28',lib_url,[],None),
        ('sovremennik-32','Современник · Заневский, 32','Заневский проспект, 32',lib_url,[],None),
        ('sfera','СФЕРА','улица Лагоды, 7, строение 1',lib_url,[],None),
        ('nota','НОТА','проспект Косыгина, 28к1',lib_url,[],None),
        ('les','ЛЕС','Чарушинская улица, 26к1',lib_url,[],None),
        ('okhtinskaya','Охтинская','проспект Энергетиков, 30к5',lib_url,[],None),
        ('malookhtinskaya','Малоохтинская','Новочеркасский проспект, 49/20',lib_url,[],None),
        ('porokhovskaya','Пороховская','улица Лазо, 8к1',lib_url,[],None),
        ('kit','КиТ','Индустриальный проспект, 15',lib_url,[],None),
        ('gorod','ГОРОД','Индустриальный проспект, 35к1',lib_url,[],None),
    ]
    for ident,name,address,url,keys,notes in libraries:
        add('lib-'+ident,'Библиотека '+name,'library',address,url,keys,
            notes or 'Адрес действующего филиала указан библиотечной сетью. Состав услуг, мероприятия и доступ к рабочим местам уточни на странице филиала.',
            ['книги','библиотека'])
    for ident,title,url in [
        ('novoorlovsky','Заказник Новоорловский','https://oopt.kpoos.gov.spb.ru/protected_area/novoorlovskiy/'),
        ('yuntolovsky','Заказник Юнтоловский','https://oopt.kpoos.gov.spb.ru/protected_area/yuntolovskiy-2/'),
    ]:
        add(ident,title,'park',None,url,['nature'],
            'Природная территория в черте города. Маршрут и разрешённые тропы выбирай по карте дирекции; у заказника нет одного входа по почтовому адресу.',
            ['природа','лес','экотропа','прогулка'])
    for ident,title,address in [
        ('kochneva','Дом Кочневой','набережная реки Фонтанки, 41'),
        ('ekaterininskoe','Екатерининское собрание','набережная канала Грибоедова, 88–90'),
    ]:
        add(ident,title,'theatre',address,'https://petroconcert.spb.ru/',['live_music'],
            'Концертная площадка Петербург-концерта. Выбирай программу и дату: наличие зала не означает, что можно прийти без билета или события.',
            ['концерт','музыка'])

    for p in places:
        ident=p['id'].removeprefix('seed:')
        if ident=='coffee3':
            p['features'] += [feature('lounge',True,p['website']),feature('panoramic_view',True,p['website'])]
            p['notes']='Есть рабочая зона и отдельная чилаут-зона с подушками и панорамным видом. Для мечтательного настроения выбирай именно чилаут. В пятницу–воскресенье бронь ограничена двумя часами.'
        if ident=='annanova':
            url='https://www.annanova-gallery.ru/exhibitions/161/overview/'
            p['sources'].append(source(url,'Текущая выставка','Fact-only reference; no copied text/photos','official'))
            p['features'].append({**feature('imaginative_exhibition',True,url),
                'valid_from':'2026-10-09T00:00:00+03:00','valid_until':'2026-11-15T23:59:59+03:00'})
            p['notes']='До 15 ноября 2026 идёт выставка Димы Филиппова о воображении, свете и изменении взгляда. Поэтому она предлагается для мечтаний. После окончания этот признак отключится; следующую тему нужно проверить.'
            p.update(price_max=250,price_scope='visit',price_source_url=url,price_valid_until='2026-11-15T23:59:59+03:00')
        if ident=='borey':
            p['notes']='Независимая галерея с программой современного искусства. Предлагается для знакомства с искусством; мечтательное настроение или тишина по одной категории не выводятся.'
        if ident=='benua':
            p['features'].append(feature('garden',True,p['website']))
            p['notes']='Пространство с садом и художественными проектами. Для мечтаний учитывается наличие сада; архив выставок не подтверждает действующую экспозицию.'
        if ident in ('hermitage','erarta'):p['is_landmark']=True
        if ident=='kolokol':
            for f in p['features']:f['status']='pending_review'

