import GameAbout from "./GameAbout";
import "./circle-about.css";

export default function CircleAbout() {
  return (
    <GameAbout label="Правила и оценка круга">
      <section className="circle-about" id="circle-about" aria-labelledby="circle-about-title">
        <div className="circle-about-intro">
          <h2 id="circle-about-title">Нарисуй идеальный круг и узнай процент точности</h2>
          <p>
            «Круг» — бесплатная игра Playne по мотивам Perfect Circle. Обведи
            центральную точку одним движением. Таймера нет: важна форма линии.
          </p>
        </div>
        <div className="circle-about-columns">
          <div>
            <h3>Как читать результат</h3>
            <p>
              Чем меньше меняется расстояние от линии до центра, тем выше
              процент. Небольшой разрыв и возвраты тоже снижают оценку. Пунктир
              показывает ровный круг твоего размера. Сравни с ним выступы и
              вмятины своей линии.
            </p>
            <a href="/guides/perfect-circle/#score">Разобраться в оценке и попробовать советы →</a>
          </div>
          <div className="faq-items">
            <h3>Перед следующей попыткой</h3>
            <details>
              <summary>Почему круг не засчитался?<span aria-hidden="true">+</span></summary>
              <p>
                Обведи точку целиком, замкни линию близко к началу и сделай
                только один оборот. Слишком маленькая петля, проход через центр,
                большой разрыв или сильные возвраты не засчитываются. Если
                линия упирается в край поля, начни ближе к центру.
              </p>
            </details>
            <details>
              <summary>Как нарисовать круг на телефоне?<span aria-hidden="true">+</span></summary>
              <p>
                Начни сбоку от точки и веди палец по полю, не отрывая его.
                Оставь место до краёв и не поворачивай телефон во время
                попытки. Направление рисования выбирай сам.
              </p>
            </details>
            <details>
              <summary>Нужен ли аккаунт?<span aria-hidden="true">+</span></summary>
              <p>
                Первая попытка доступна без входа. Затем войди через Яндекс,
                чтобы играть дальше бесплатно и сохранять результаты в
                рейтинге. Локальный рекорд остаётся в этом браузере.
              </p>
            </details>
          </div>
        </div>
      </section>
    </GameAbout>
  );
}
