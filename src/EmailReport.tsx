import { useEffect, useState } from "react";
import { api } from "./account";

type Metrics = {
  messages: number; accepted: number; recipients: number; delivered: number;
  delivered_users: number; opened: number; clicked: number; visited_users: number;
  started_users: number; completed_users: number; pending: number;
  uncertain: number; failed: number; cancelled: number; unsubscribes: number;
  complaints: number;
};
type MatureVariant = {
  variant: string; delivered_users: number; visited_users: number;
  started_users: number; completed_users: number; visitRate: number | null;
  visitRate95: number[] | null;
};
export type EmailReportData = {
  generatedAt: string; reportWindowDays: number;
  activity: { totals: Metrics; byKind: (Metrics & { kind: string })[] };
  current: (Metrics & { variant: string })[];
  health: { subscribers: number; last_callback: string | null; next_mature_at: string | null };
  variants: MatureVariant[];
};
const date = (value: string) => new Date(value).toLocaleString("ru-RU", {
  timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
});
const percent = (n: number | null) => n === null ? "—" : (n * 100).toFixed(1).replace(".", ",") + "%";
const kinds: Record<string, string> = { rank: "Рейтинг", reminder: "Напоминания", verify: "Подтверждение почты" };

export function EmailReportView({ report }: { report: EmailReportData }) {
  const totals = report.activity.totals;
  const mature = report.variants.some((row) => row.delivered_users > 0);
  return <>
    <p className="email-report-date">За последние {report.reportWindowDays} дней · обновлено {date(report.generatedAt)} МСК</p>
    <dl className="email-report-totals">
      <div><dt>Принято Unisender</dt><dd>{totals.accepted}</dd></div>
      <div><dt>Доставлено писем</dt><dd>{totals.delivered}</dd></div>
      <div><dt>Получателей</dt><dd>{totals.delivered_users}</dd></div>
      <div><dt>Вернулись на сайт</dt><dd>{totals.visited_users}</dd></div>
    </dl>
    <p>Подписчиков: {report.health.subscribers}. В очереди: {totals.pending}. Проверка отправки: {totals.uncertain}. Ошибки отправки: {totals.failed}.</p>
    <div className="email-report-scroll" role="region" aria-label="Отправки по типам писем" tabIndex={0}>
      <table><caption>Все письма Playne</caption><thead><tr>
        <th scope="col">Тип</th><th scope="col">Принято</th><th scope="col">Доставлено</th><th scope="col">Открыто</th><th scope="col">Получатели</th><th scope="col">Нажали ссылку</th><th scope="col">Вернулись</th><th scope="col">Начали игру</th><th scope="col">Завершили игру</th><th scope="col">Отписки</th><th scope="col">Жалобы</th>
      </tr></thead><tbody>{["rank", "reminder", "verify"].map((kind) => {
        const row = report.activity.byKind.find((item) => item.kind === kind);
        return <tr key={kind}><th scope="row">{kinds[kind]}</th>{[row?.accepted, row?.delivered, row?.opened, row?.delivered_users, row?.clicked, row?.visited_users, row?.started_users, row?.completed_users, row?.unsubscribes, row?.complaints].map((n, i) => <td key={i}>{n ?? 0}</td>)}</tr>;
      })}</tbody></table>
    </div>
    <p className="email-report-help">«Открыто» и «Нажали ссылку» — письма хотя бы с одним событием, включая возможные автоматические проверки. «Вернулись» — уникальные люди с действием на сайте. Получатели между типами писем могут пересекаться. Ручные и тестовые отправки из Unisender вне очереди сайта не входят в отчёт.</p>
    <h4>Оформление A/B/C · текущие результаты</h4>
    <p>Только уведомления о рейтинге. Новые отправки видны сразу; дизайн закреплён за получателем.</p>
    <div className="email-report-scroll" role="region" aria-label="Текущие результаты A/B/C" tabIndex={0}>
      <table><caption>Фактические отправки без ожидания семи дней</caption><thead><tr>
        <th scope="col">Дизайн</th><th scope="col">Принято</th><th scope="col">Доставлено</th><th scope="col">Открыто</th><th scope="col">Получатели</th><th scope="col">Вернулись</th><th scope="col">Начали игру</th><th scope="col">Завершили игру</th>
      </tr></thead><tbody>{["A", "B", "C"].map((variant) => {
        const row = report.current.find((item) => item.variant === variant);
        return <tr key={variant}><th scope="row">{variant}</th>{[row?.accepted, row?.delivered, row?.opened, row?.delivered_users, row?.visited_users, row?.started_users, row?.completed_users].map((n, i) => <td key={i}>{n ?? 0}</td>)}</tr>;
      })}</tbody></table>
    </div>
    <details className="email-report-mature"><summary>Сравнение после полного окна 7 дней</summary>
      <p>Здесь учитываем уникальных получателей доставленных писем, для которых прошло семь дней. Действия за пределами этого окна не входят в сравнение.</p>
      {!mature ? <p className="status-message">Для сравнения ещё нет писем с полным окном наблюдения.{report.health.next_mature_at ? ` Первые данные появятся ${date(report.health.next_mature_at)} МСК.` : ""} Это не означает, что писем не было.</p> :
        <div className="email-report-scroll" role="region" aria-label="Зрелые результаты A/B/C" tabIndex={0}><table><caption>Получатели с завершённым окном наблюдения</caption><thead><tr>
          <th scope="col">Дизайн</th><th scope="col">Получатели</th><th scope="col">Возвраты</th><th scope="col">Доля</th><th scope="col">95% интервал</th><th scope="col">Начали игру</th><th scope="col">Завершили игру</th>
        </tr></thead><tbody>{report.variants.map((row) => <tr key={row.variant}><th scope="row">{row.variant}</th><td>{row.delivered_users}</td><td>{row.visited_users}</td><td>{percent(row.visitRate)}</td><td>{row.visitRate95 ? row.visitRate95.map(percent).join(" — ") : "—"}</td><td>{row.started_users}</td><td>{row.completed_users}</td></tr>)}</tbody></table></div>}
    </details>
    <p className="email-report-help">При маленькой выборке победителя выбирать рано. Сравнивай также завершённые игры, отписки и жалобы.</p>
    <p className="email-report-date">Последнее событие доставки: {report.health.last_callback ? date(report.health.last_callback) + " МСК" : "пока нет"}.</p>
  </>;
}

export default function EmailReport() {
  const [report, setReport] = useState<EmailReportData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError("");
    void api<EmailReportData>("/email/report").then((data) => { if (active) setReport(data); })
      .catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [revision]);
  return <div className="email-experiment" aria-busy={busy}>
    <h3>Статистика писем</h3><p>Доступна только владельцу сайта.</p>
    <button type="button" className="secondary-button" onClick={() => refresh((v) => v + 1)} disabled={busy}>{busy ? "Загружаем…" : "Обновить статистику"}</button>
    {error && <p role="alert">{error}</p>}
    {report && <EmailReportView report={report} />}
  </div>;
}
