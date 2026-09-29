# Playne и Kadimag: проверка сервера

Проверено 29 сентября 2026 года по активной конфигурации Nginx, скриптам деплоя, путям файлов, настройкам сервиса и HTTPS-ответам на сервере `89.111.152.112`.

## Что отделено

- Файлы Playne находятся в `/srv/playne/releases`, текущая версия выбирается ссылкой `/srv/playne/current`. Ссылок из этой папки в `/srv/kadimag` нет.
- `playne.ru` обслуживает собственный конфиг `/etc/nginx/sites-available/playne-domain`. Он раздаёт статические файлы из `/srv/playne/current/naglaz` и не обращается к процессу или API Kadimag.
- HTTPS использует отдельный сертификат `/etc/letsencrypt/live/playne.ru`. Сертификат Kadimag находится в другом каталоге.
- Деплой использует отдельного пользователя `naglaz-deploy`, каталог `/var/lib/naglaz-deploy` и команды, работающие с `/srv/playne`.
- Сервис Kadimag работает из `/srv/kadimag/app/current`; в `/srv/kadimag` на проверенной глубине до шести уровней папок с именем `naglaz` не найдено.

## Какие связи остались

| Связь | Где находится | Для чего нужна |
| --- | --- | --- |
| Старый адрес `kadimag.ru/naglaz/` | `/etc/nginx/sites-available/kadimag.ru` включает `/etc/nginx/snippets/playne-canonical.conf` | Перенаправляет старые ссылки на `https://playne.ru/naglaz/` |
| Старый адрес `www.kadimag.ru/naglaz/` | `/etc/nginx/sites-available/playne` и `/etc/nginx/snippets/playne-public.conf` | Перенаправляет старые ссылки на новый домен |
| Старые адреса файлов `/naglaz/assets/` и `/naglaz/art/` на Kadimag | Оба указанных выше snippet-файла | Раздают файлы из `/srv/playne/current` и предыдущего релиза для старых открытых вкладок |
| Сертификат Kadimag у старого www-адреса | `/etc/nginx/sites-available/playne` | Нужен только для HTTPS старого домена; новый `playne.ru` использует собственный сертификат |
| Проверки Kadimag при деплое Playne | `/usr/local/sbin/naglaz-deploy` и `.github/workflows/deploy-naglaz.yml` | Проверяют редирект старого адреса и статус 307 защищённого пути `kadimag.ru/naglaz-private-probe` |
| Общий VPS и Nginx | Сервер `89.111.152.112` | Общая инфраструктура хостинга |

Последняя проверка в деплое — реальная зависимость публикации: если Kadimag перестанет возвращать ожидаемый ответ для защищённого пути, активация новой версии Playne откатится либо проверка GitHub Actions завершится ошибкой. Текущие статические страницы Playne не используют приложение Kadimag.

## Проверенные ответы

- `kadimag.ru/naglaz/` → HTTP 308, `https://playne.ru/naglaz/`.
- `www.kadimag.ru/naglaz/` → HTTP 308, `https://playne.ru/naglaz/`.

Проверка связей ничего не удаляла и не меняла в Kadimag. В этой задаче изменены только файлы favicon и разрешённый состав пакета Playne.
