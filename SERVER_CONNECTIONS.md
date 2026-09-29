# Разделение Playne и Kadimag

Проверено 29 сентября 2026 года на сервере `89.111.152.112` после удаления старых маршрутов игры.

- Playne публикуется из репозитория `Magnum113/playne` в `/srv/playne/releases`; активный релиз выбирает `/srv/playne/current`. Код игры и хаба раздаётся только на `playne.ru` и `www.playne.ru` конфигурацией `/etc/nginx/sites-available/playne-domain`.
- У Playne свой сертификат `/etc/letsencrypt/live/playne.ru`, отдельный пользователь деплоя `naglaz-deploy`, команды деплоя и каталог `/srv/playne`. Игра не обращается к приложению, API или файлам Kadimag.
- В конфигурации `kadimag.ru` удалён include `playne-canonical.conf`; старый сайт `/etc/nginx/sites-available/playne`, обслуживавший `www.kadimag.ru`, выведен из Nginx. Обычное перенаправление `www.kadimag.ru` на `kadimag.ru` сохранено в отдельном сайте `/etc/nginx/sites-available/kadimag-www`, без маршрутов Playne.
- Snippet-файлы `playne-canonical.conf` и `playne-public.conf` убраны из активной конфигурации Nginx. Старые адреса `/naglaz/`, `/naglaz/assets/` и `/naglaz/art/` на домене Kadimag больше не перенаправляют посетителей и не раздают файлы Playne.
- Деплой Playne проверяет только `playne.ru` и `www.playne.ru`. Из серверного скрипта и GitHub Actions удалены запросы к Kadimag. В счётчике Метрики `112711950` дополнительный адрес Kadimag удалён; приём данных ограничен `playne.ru`.

Перед изменениями файлы Nginx и скрипт деплоя сохранены в `/srv/playne/backups/decouple-kadimag-20260929T165524Z`. Проверка `nginx -t` прошла, Nginx перезагружен; контрольные суммы конфигураций Komui и GetoMerch не изменились. После изменения `playne.ru/` и `playne.ru/naglaz/` отвечали HTTP 200, `www.playne.ru/` перенаправлял на `playne.ru`, а Kadimag `/api/health` отвечал HTTP 200.

Оба проекта пока используют **один VPS, IP-адрес и процесс Nginx**. Это общая инфраструктура, а не связь приложения или деплоя. Для физического разделения понадобится отдельный сервер и перенос DNS Playne.
