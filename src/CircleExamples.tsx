import "./circle-about.css";

const examples = [
  {
    id: "round",
    title: "Ровный радиус",
    text: "Линия держится на одном расстоянии от центра.",
    path: "M135 70 A45 45 0 1 1 45 70 A45 45 0 1 1 135 70",
  },
  {
    id: "oval",
    title: "Вытянутый овал",
    text: "Расстояние до центра меняется — точность ниже.",
    path: "M151 70 A61 32 0 1 1 29 70 A61 32 0 1 1 151 70",
  },
  {
    id: "gap",
    title: "Большой разрыв",
    text: "Конец далеко от начала — попытка не засчитается.",
    path: "M135 70 A45 45 0 1 1 113 31",
  },
];

export default function CircleExamples({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="circle-examples" aria-label="Примеры формы линии">
      {examples.map((example) => (
        <figure key={example.id}>
          <svg
            viewBox="0 0 180 140"
            role="img"
            aria-labelledby={`${idPrefix}-${example.id}`}
          >
            <title id={`${idPrefix}-${example.id}`}>{example.title}</title>
            <circle className="circle-example-guide" cx="90" cy="70" r="45" />
            <path className="circle-example-line" d={example.path} />
            <circle className="circle-example-center" cx="90" cy="70" r="3" />
          </svg>
          <figcaption>
            <strong>{example.title}</strong>
            <span>{example.text}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
