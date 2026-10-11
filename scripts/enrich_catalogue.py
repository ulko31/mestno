#!/usr/bin/env python3
"""Apply a dated, researched enrichment without replacing the OSM catalogue."""
import json
import sys
from pathlib import Path
from urllib.parse import quote
from import_places import write_catalogue
ROOT=Path(__file__).resolve().parents[1]
CHECKED='2026-10-11T00:00:00+00:00'

def price(amount,source,label,kind='admission',scope='visit',**extra):
    return dict(amount=amount,currency='RUB',scope=scope,kind=kind,label=label,source_url=source,checked_at=CHECKED,**extra)

def offer(id,title,description,activities,source,amount=None,format='open_group',booking=None,**extra):
    return dict(id=id,title=title,description=description,activities=activities,format=format,source_url=source,
                booking_url=booking or source,checked_at=CHECKED,price=price(amount,source,title) if amount is not None else None,**extra)

def new_place(id,title,address,source,notes,offers,category='activity',prices=None):
    return dict(id='research:'+id,title=title,address=address,city='Санкт-Петербург',category=category,lat=None,lon=None,
                sources=[dict(url=source,label='Организатор',kind='official',retrieved_at=CHECKED,license='Fact-only reference; original summary')],
                features=[],documents=[],notes=notes,offers=offers,prices=prices or [],status='catalogue',updated_at=CHECKED,discovery_priority=5,is_landmark=False)

def enrich(catalogue):
    patches=[]
    def patch(id,**fields): patches.append(dict(id=id,**fields))
    patch('seed:coffee3',prices=[price(2000,'https://cafecoffee3.ru/','Средний чек, опубликованный заведением',kind='average_check',
        note='Это ориентир по заказу, а не минимальный расход и не предел стоимости.')])
    patch('seed:bench',prices=[price(290,'https://benchplace.ru/','Капучино 190 мл',kind='menu_order',
        note='Цена одного напитка. Еда, дополнительные заказы и участие в событиях оплачиваются отдельно.')],offers=[
        offer('bench-meetups','Митапы и клубные встречи','Кофейня публикует IT-митапы и встречи сообщества. Дату и правила присоединения уточни в актуальной афише.',
            ['meetups'],'https://benchplace.ru/',booking='https://benchplace.ru/#events',schedule_note='Регулярные встречи · дата в афише'),
        offer('bench-books','Книжный клуб','Совместное обсуждение прочитанного в кофейне. Проверяй актуальную книгу, дату и запись; пример расписания на сайте не является подтверждённой датой.',
            ['book_club'],'https://benchplace.ru/',booking='https://benchplace.ru/#events'),
        offer('bench-speaking','Разговорный английский','Разговорный клуб: общение на английском в группе. Уровень, дату и цену уточни в афише.',
            ['speaking_club','english_club'],'https://benchplace.ru/',booking='https://benchplace.ru/#events')])
    # The Coffee 3 description suggests spontaneous acquaintances, not an open booked workshop.
    patch('seed:coffee3',social_feature_pending=True)
    gaga='https://playloftgaga.ru/tariffs/'
    patch('seed:gaga',prices=[price(1150,gaga,'Максимальный стоп-чек обычного посещения',kind='day_cap',
        note='В будни стоп-чек 950 ₽, в выходные 1150 ₽. Отдельные события могут иметь свой билет.'),
        price(950,gaga,'Будний стоп-чек',kind='day_cap',visit_day='weekday')],offers=[
        offer('gaga-dnd-20261012','D&D и Pathfinder для начинающих','Открытая ролевая игра для новичков. Запись и наличие мест проверь у организатора.',
            ['board_games','rpg'],'https://playloftgaga.ru/events/dungeons-dragons-i-pathfinder-dlya-nachinayushhih-2-2/',1100,
            starts_at='2026-10-12T19:00:00+03:00',ends_at='2026-10-12T19:00:00+03:00'),
        offer('gaga-boardgames','Открытые игротеки','В афише есть общие игротеки и обучающие партии. Можно присоединиться к другим участникам, дату выбирай в расписании.',
            ['board_games'],'https://playloftgaga.ru/',booking='https://playloftgaga.ru/events/',
            price_note='Обычно 4,5 ₽ в минуту; отдельные игры имеют свой билет.'),
        offer('gaga-books','Литературный клуб «Человек Читающий»','Обсуждение книг в лофте с другими читателями. Участие по поминутному тарифу; итог зависит от продолжительности.',
            ['book_club'],'https://playloftgaga.ru/events/',starts_at='2026-10-16T19:30:00+03:00',ends_at='2026-10-16T19:30:00+03:00',
            price_note='4,5 ₽ в минуту, стоимость всей встречи не опубликована.')])
    patch('seed:learning-group',offers=[offer('learning-speaking','Разговорный клуб с носителем','Практика английского в группе: разговоры, игры и совместные занятия. Локацию и уровень выбирай для конкретной встречи.',
        ['speaking_club','english_club'],'https://learning-group.ru/speaking-clubs',booking='https://szn.learning-group.ru/',
        requirements='Проверь подходящий уровень английского и адрес выбранной встречи.')])
    places=[]
    k='https://keramishnaya.ru/mk'
    places.append(new_place('keramishnaya','Керамишная','улица Коломенская, 14, 13Н, мансарда',k,
        'Мастерская проводит общие группы по лепке и гончарному кругу. В группе к тебе могут присоединиться другие люди; индивидуальное свидание — отдельный формат.',[
        offer('keramishnaya-hand','Лепка в общей группе','Сделай предмет из глины в общей группе. Можно записаться одному, к занятию присоединяются другие участники.',
              ['workshops','pottery'],k,3000),
        offer('keramishnaya-wheel','Гончарный круг в общей группе','Гончарный мастер-класс в общей группе с поддержкой мастера; точное время выбирай при записи.',
              ['workshops','pottery'],k,3500),
        offer('keramishnaya-date','Индивидуальное гончарное свидание','Отдельный мастер-класс для вашей пары, без знакомства с общей группой.',
              ['workshops','pottery'],k,7500,format='private')]))
    # A private couples price is for TWO, so it must never be treated as a per-person quote.
    places[-1]['offers'][-1]['price']=None
    places[-1]['offers'][-1]['price_note']='7500 ₽ за двоих без вина и закусок; это не цена за одного.'
    b='https://biskuit.ru/club'
    places.append(new_place('biskuit','Бисквит · студия керамики','Зверинская улица, 13/5',b,
        'У студии есть клуб с общими занятиями и обменом опытом. Для участия нужен хотя бы небольшой опыт керамики; мастер-классы для новичков выбираются отдельно.',[
        offer('biskuit-club','Клуб керамистов','Групповое занятие: лепка, круг или роспись и общение с другими керамистами. Разовое посещение длится три часа.',
            ['pottery'],b,2500,booking='https://n391797.yclients.com/',requirements='Нужен минимальный опыт керамики; клуб не обучает с нуля.')]))
    a='https://artistastudio.ru/paint/mk'
    for suffix,address in [('nekrasova','улица Некрасова, 60'),('tuchkov','Тучков переулок, 11/5')]:
        places.append(new_place('artista-'+suffix,'Артиста · '+('Некрасова' if suffix=='nekrasova' else 'Тучков'),address,a,
            'Ежедневные групповые мастер-классы по живописи для начинающих. Можно прийти без опыта; материалы входят в выбранную программу.',[
            offer('artista-'+suffix+'-painting','Картина за три часа','Групповой мастер-класс по рисованию с художником. Выбери технику, дату и этот филиал при записи.',
                ['workshops','painting'],a,requirements='Выбирай нужный филиал и проверь цену выбранной техники в расписании.')]))
    g='https://goncharnaya-masterskaya.ru/uslugi-i-ceni/'
    for suffix,address in [('kima','проспект Кима, 6, 2-й этаж, 257'),('nevsky','Невский проспект, 32–34, во дворе')]:
        places.append(new_place('pottery1-'+suffix,'Гончарная студия №1 · '+('Кима' if suffix=='kima' else 'Невский'),address,g,
            'Разовые занятия для взрослых и детей. На сайте есть базовый мастер-класс за 1800 ₽; формат общей группы нужно уточнять. Частные праздники проходят только своей компанией.',[
            offer('pottery1-'+suffix+'-basic','Базовый мастер-класс по керамике','Лепка или гончарный круг с обжигом, 1,5 часа. Роспись и глазирование требуют отдельного занятия.',
                ['workshops','pottery'],g,1800,format='unknown',requirements='Общий или индивидуальный формат уточни при записи.')]))
    t='https://tancor.spb.ru/price'
    places.append(new_place('triumph-dance','Триумф · группы на Маяковского','улица Маяковского, 37',t,
        'Групповые занятия для взрослых на Маяковского: бальные танцы для начинающих и продолжающих, соло латина. Можно записаться без пары; подходящий уровень выбирай в расписании.',[
        offer('triumph-trial','Пробный урок в группе без пары','Групповой урок танцев для одного участника. Пробный урок стоит 400 ₽, разовый час — 750 ₽.',
            ['dance'],t,400,booking='https://tancor.spb.ru/schedule',requirements='Пробная цена действует для первого занятия; направление и набор в группу уточни.')],category='sport'))
    m='https://igormeerson.ru/improvworkshop'
    places.append(new_place('meerson-improv','Школа импровизации Игоря Меерсона','улица Мира, 3',m,
        'Практическое занятие по импровизации с командными упражнениями. На странице организатора опубликованы две даты и разовая стоимость участия.',[
        offer('meerson-20261029','Мастер-класс по импровизации','Командные упражнения и практика спонтанного общения в группе участников.',
            ['workshops','improv'],m,1000,starts_at='2026-10-29T20:10:00+03:00',ends_at='2026-10-29T20:10:00+03:00'),
        offer('meerson-20261110','Мастер-класс по импровизации','Практика импровизации и коммуникации вместе с другими участниками.',
            ['workshops','improv'],m,1000,starts_at='2026-11-10T20:10:00+03:00',ends_at='2026-11-10T20:10:00+03:00')]))
    c='https://culinaryon.spb.ru/faq/otkrytye-master-klassy/'
    places.append(new_place('culinaryon','CulinaryOn · открытые мастер-классы',None,c,
        'Открытые кулинарные мастер-классы с совместной готовкой. Адрес конкретной студии и доступные места нужно проверить при записи.',[
        offer('culinaryon-open','Готовить вместе на открытом мастер-классе','Кулинарные занятия для отдельных участников: вместе готовят и дегустируют блюда. Стоимость включает продукты и оборудование.',
            ['workshops','cooking'],c,booking='https://culinaryon.spb.ru/calendar/'),
        offer('culinaryon-20261014','Французская кухня: нисуаз, ягнёнок и профитроли','Открытый кулинарный мастер-класс в студии на Петроградской. Точный адрес и наличие мест проверяй в карточке организатора.',
            ['workshops','cooking'],'https://culinaryon.spb.ru/calendar/',7000,
            booking='https://culinaryon.spb.ru/calendar/2026-10-14klassika-francii-nisuaz-kare-iagnenka-i-profitroli/',
            starts_at='2026-10-14T18:00:00+03:00',ends_at='2026-10-14T18:00:00+03:00')]))
    u='https://events.spbu.ru/book-club'
    places.append(new_place('spbu-bookclub','Книжный клуб СПбГУ','Университетская набережная, 7–9, читальный зал',u,
        'Открытое обсуждение литературы. Участвовать могут и гости университета; регистрация завершается за три дня до встречи, для прохода нужен паспорт.',[
        offer('spbu-20261016','Обсуждаем «Макунаиму»','Книжный клуб: обсуждение романа Мариу ди Андрады с читателями и приглашённым специалистом.',
            ['book_club'],u,booking=u,starts_at='2026-10-16T18:00:00+03:00',ends_at='2026-10-16T18:00:00+03:00',
            requirements='Регистрация закрывается за три дня; гостям СПбГУ нужен паспорт. Цена на странице не указана.')],category='library'))
    # Only freely licensed, correctly identified photos. No invented venue interiors.
    photo_rows=[('seed:benua','Сад Бенуа, пруд с островом03.jpg','Екатерина Борисова','2018','Пруд в Саду Бенуа; архивное фото',
                 '1/17','Сад Бенуа, пруд с островом03.jpg'),
                ('seed:brusnitsyn','Культурный квартал Брусницын 02.jpg','Anastasiya Lvova','2024','Культурный квартал Брусницын; фото 2024 года',
                 'd/d8','Культурный квартал Брусницын 02.jpg'),
                ('seed:iva-orangery','Пальмовая оранжерея (Таврический сад).jpg','Екатерина Борисова','2022','Здание оранжереи, где находится кофейня; не интерьер кафе',
                 'f/f4','Пальмовая оранжерея (Таврический сад).jpg')]
    for id,name,author,year,caption,hashpath,filename in photo_rows:
        encoded=quote(filename.replace(' ','_'),safe='()')
        patch(id,photos=[dict(id='commons:'+name,url=f'https://thumb.wikimedia.org/wikipedia/commons/thumb/{hashpath}/{encoded}/960px-{encoded}',
            source_url='https://commons.wikimedia.org/wiki/File:'+quote(name.replace(' ','_'),safe='()'),author=author,license='CC BY-SA 4.0',
            license_url='https://creativecommons.org/licenses/by-sa/4.0/',caption=caption,alt=caption,checked_at=CHECKED,taken_year=year)])
    byid={p['id']:p for p in catalogue['places']}
    for fields in patches:
        p=byid.get(fields['id'])
        if not p: continue
        if fields.get('social_feature_pending'):
            for f in p['features']:
                if f['key'] in ['social_events','workshops']: f['status']='pending_review'
        for key in ['prices','offers','photos']:
            if key in fields:p[key]=fields[key]
        p['enriched_at']=CHECKED
    for p in places:
        # Reuse an exact official branch/address match if available; never fuse branches by name.
        existing=byid.get(p['id'])
        if existing:existing.update(p)
        else:catalogue['places'].append(p)
    return catalogue,dict(checked_at=CHECKED,patches=patches,added_places=places)

if __name__=='__main__':
    target=ROOT/'dist/places.json'
    catalogue=json.loads(target.read_text())
    catalogue,snapshot=enrich(catalogue)
    payload=write_catalogue(catalogue['places'],target)
    target.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
    (ROOT/'data/enrichment-2026-10-11.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(places=len(payload['places']),offers=sum(len(p.get('offers',[])) for p in payload['places']),
        priced_places=sum(bool(p.get('prices')) or p.get('price_max') is not None or any(e.get('price') for e in p.get('offers',[])) for p in payload['places']),
        photos=sum(len(p.get('photos',[])) for p in payload['places'])),ensure_ascii=False))
