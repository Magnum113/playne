import {
  acceptanceChecklist,
  componentContracts,
  designPrinciples,
  designSources,
} from "./designGuidance";

export function DesignPrinciples() {
  return (
    <>
      <p className="ds-note">
        Эти правила относятся к общему интерфейсу Playne. Палитра, панорама и
        игровые поля сохраняют собственное управление.
      </p>
      <ol className="ds-principles">
        {designPrinciples.map((principle, index) => (
          <li key={principle.title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h3>{principle.title}</h3>
            <p>{principle.body}</p>
          </li>
        ))}
      </ol>
      <details className="ds-guidance-detail">
        <summary>На какие практики опираемся</summary>
        <ul className="ds-sources">
          {designSources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title} ↗
              </a>
              <p>{source.note}</p>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

export function ComponentContracts() {
  return (
    <>
      <p className="ds-note">
        Обязательные состояния и проверки для каждого семейства. Сначала
        расширяем общий компонент; отдельный вариант добавляем только для новой
        задачи.
      </p>
      <div className="ds-contracts">
        {componentContracts.map((contract) => (
          <details key={contract.id} className="ds-guidance-detail">
            <summary>{contract.title}</summary>
            <div className="ds-contract-body">
              <p>{contract.use}</p>
              <dl>
                <div>
                  <dt>Не использовать</dt>
                  <dd>{contract.avoid}</dd>
                </div>
                <div>
                  <dt>Состояния</dt>
                  <dd>{contract.states.join(" · ")}</dd>
                </div>
                <div>
                  <dt>Проверка</dt>
                  <dd>
                    <ul>
                      {contract.checks.map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Источник</dt>
                  <dd>
                    <code>{contract.source}</code>
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        ))}
      </div>
      <h3 className="ds-checklist-title">Перед публикацией</h3>
      <ol className="ds-checklist">
        {acceptanceChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p className="ds-note">
        Это критерии приёмки, а не заявление о полной доступности сайта. У
        Playne цель касания — 44 × 44 px; минимум WCAG 2.2 AA — 24 × 24 CSS px с
        исключениями. Для игровых полей, сторонних карт и таймерных механик
        границы проверки указываются отдельно.
      </p>
    </>
  );
}
