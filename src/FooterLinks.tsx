export default function FooterLinks() {
  return (
    <nav className="footer-links" aria-label="Игры и правила">
      <div>
        <strong>Играть</strong>
        <a href="/leaderboard/">Рейтинг</a>
        <a href="/account/">Личный кабинет</a>
        <a href="/naglaz/">На глаз</a>
        <a href="/circle/">Круг</a>
        <a href="/colorfle/">Оттенок</a>
        <a href="/geo/">Где я?</a>
        <a href="/pressure/">Жми</a>
        <a href="/one-line/">Одной линией</a>
      </div>
      <div>
        <a className="footer-heading" href="/brain/">
          Разминка для ума
        </a>
        <a href="/brain/flash/">Вспышка</a>
        <a href="/brain/rotate/">Поворот</a>
        <a href="/brain/slide/">Передвинь</a>
        <a href="/brain/dispatch/">Диспетчер</a>
      </div>
      <div>
        <a className="footer-heading" href="/guides/">
          Правила и советы
        </a>
        <a href="/guides/naglaz/">Как сравнивать размеры</a>
        <a href="/guides/perfect-circle/">Как нарисовать круг</a>
        <a href="/guides/colorfle/">Как подобрать оттенок</a>
        <a href="/guides/geoguessr/">Как угадывать места по панорамам</a>
        <a href="/pressure/#pressure-rules">Как играть в «Жми»</a>
        <a href="/guides/one-line/">Как соединить числа одной линией</a>
        <a href="/guides/brain/">Как устроена разминка для ума</a>
        <a href="/privacy/">Конфиденциальность</a>
        <a href="/terms/">Правила сайта</a>
      </div>
    </nav>
  );
}
