export default function FooterLinks() {
  return (
    <nav className="footer-links" aria-label="Игры и правила">
      <div>
        <strong>Играть</strong>
        <a href="/naglaz/">На глаз</a>
        <a href="/circle/">Круг</a>
        <a href="/colorfle/">Оттенок</a>
      </div>
      <div>
        <a className="footer-heading" href="/guides/">
          Правила и советы
        </a>
        <a href="/guides/naglaz/">Как сравнивать размеры</a>
        <a href="/guides/perfect-circle/">Как нарисовать круг</a>
        <a href="/guides/colorfle/">Как подобрать оттенок</a>
      </div>
    </nav>
  );
}
