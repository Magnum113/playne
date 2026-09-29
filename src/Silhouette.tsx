import type { GameObject, ObjectId } from "./data";
import RasterSilhouette from "./RasterSilhouette";
const ink = "var(--illustration-cutout, #1d2125)";

// Native coordinates match each object's width/height in data.ts.
// Keep one unit on X equal to one unit on Y, including all circular details.
function Drawing({ id }: { id: ObjectId }) {
  switch (id) {
    case "eiffel":
      return (
        <>
          <path d="M62 0h2v24h2v20h3v14l4 64 9 60 13 49 13 43 18 56h-27l-12-40q-24-20-48 0l-12 40H0l18-56 13-43 13-49 9-60 4-64V44h3V24h2Z" />
          <path
            d="M61 64h4l3 62H58Zm-4 70h12l7 49H50Zm-9 58h30l9 40H39Zm-12 50h54l8 26q-35-24-70 0Z"
            fill={ink}
          />
          <g fill="none" stroke="currentColor" strokeWidth="2.1">
            <path d="m60 65 7 30-9 30m7-60-7 30 10 30m-11 10 15 23-20 24m17-47-15 23 20 24m-25 12 33 19-41 19m35-38-32 19 41 19m-44 12 48 24m-1-24-48 24" />
          </g>
          <path d="M54 52h18v7H54zM39 180h48v7H39zM25 232h76v8H25zM16 273h94v7H16zM0 325h27v5H0zM99 325h27v5H99z" />
          <path
            d="m26 286-12 33m86-33 12 33M58 49h10"
            fill="none"
            stroke={ink}
            strokeWidth="2"
          />
        </>
      );
    case "pyramid":
      return (
        <>
          <path d="M0 146.6 115.15 0 230.3 146.6Z" />
          <g stroke={ink} strokeWidth=".6" opacity=".25">
            {Array.from({ length: 17 }, (_, i) => {
              const y = (i + 1) * 8;
              const x = 115.15 * (1 - y / 146.6);
              return <path key={i} d={`M${x} ${y}H${230.3 - x}`} />;
            })}
          </g>
        </>
      );
    case "clock":
      return (
        <>
          <path d="M7.75 0h.5v3.8L9.5 6v3.5L14 23v2h1v2h-1v4h1v1.7h-1V46h1v2h-1v45h2v3H0v-3h2V48H1v-2h1V32.7H1V31h1v-4H1v-2h1v-2L6.5 9.5V6l1.25-2.2Z" />
          <path d="M8 10.8 12.6 24H3.4Z" fill={ink} opacity=".6" />
          <g fill={ink} opacity=".7">
            {[3.4, 6.6, 9.8].map((x) => (
              <path key={x} d={`M${x} 28h2v5h-2zM${x} 50h2v39h-2z`} />
            ))}
          </g>
          <path d="M2 45h12M2 48h12M2 91h12" stroke={ink} strokeWidth=".6" />
          <circle cx="8" cy="39.5" r="3.5" fill={ink} />
          <circle
            cx="8"
            cy="39.5"
            r="3.08"
            fill="none"
            stroke="currentColor"
            strokeWidth=".16"
          />
          <g stroke="currentColor" strokeWidth=".22">
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M8 36.7v.5"
                transform={`rotate(${i * 30} 8 39.5)`}
              />
            ))}
            <path
              d="M8 37.6v1.9l1.45.85"
              fill="none"
              strokeWidth=".3"
              strokeLinecap="round"
            />
          </g>
        </>
      );
    case "liberty":
      return (
        <>
          {/* Foundation and pedestal make up roughly half of the total height. */}
          <path d="M0 93v-4h3v-6h3v-5h3V54H7v-4h3v-4h13v4h3v4h-2v24h3v5h2v6h3v4Z" />
          <path
            d="M11 56h11v18H11zM6 84h21v1H6zM3 90h26v.8H3z"
            fill={ink}
            opacity=".45"
          />
          {/* Raised right arm and torch are on the viewer's left. */}
          <path d="M10 46 12.2 33.5 12.8 24.2 10.3 21 8.1 15.8 6.4 7.8 8.7 7.3 11 14.5 14.5 19.9 18 18.9 21.9 20.7 24.2 26.5 22 32l1 14Z" />
          <path d="M6.3 8.2 5.8 5.3H9l-.5 2.9Z" />
          <path d="M6.3 5.3Q4.3 3.6 6.8 1.3L7.5 0q2.4 3.7.9 5.3Z" />
          <path d="M15.2 19.6v-2.7h3.7v3.7Z" />
          <ellipse cx="17" cy="15.8" rx="2.4" ry="2.8" />
          <path d="m14.8 14.7-4-1.7 4.3.2-2.6-3.6 3.6 2.5-.6-4.4 1.7 4.1 1.2-4.1.1 4.4 3.1-3.2-1.8 4 4.3-1.2-3.6 2.4 4.4.5-4.6 1.1Z" />
          <path
            d="m21 23.2 5.2 1.5-2 8.3-5-1.6Z"
            stroke={ink}
            strokeWidth=".55"
          />
          <g
            stroke={ink}
            fill="none"
            strokeWidth=".65"
            opacity=".65"
            strokeLinecap="round"
          >
            <path d="m15.1 23.2 2.6 9.2-3.5 10.8m4-20.4-1 5.3m2.2 5.8 1.7 10m-7.4-11.1-1.6 9.9m4.2-26.5 1.6.1" />
          </g>
        </>
      );
    case "rocket":
      return (
        <>
          <path d="M2.6 0Q.1 2.5 0 6v6.2l.77 2.3V68h3.66V14.5l.77-2.3V6Q5.1 2.5 2.6 0Z" />
          <path
            d="M.77 16h3.66v.35H.77zM.77 25h3.66v2.8H.77z"
            fill={ink}
            opacity=".65"
          />
          <path d="M.77 65.5h3.66v.5H.77z" fill={ink} opacity=".55" />
          <path d="m1.15 68-.3 2h1.1l-.15-2m.3 0L2 70h1.2L3 68m.4 0-.15 2h1.1l-.3-2" />
          <path
            d="m1.05 60 .5 7m2.6-7-.5 7"
            stroke={ink}
            strokeWidth=".2"
            fill="none"
          />
          <rect
            x="2.22"
            y="33"
            width=".76"
            height="8"
            rx=".1"
            fill={ink}
            opacity=".3"
          />
        </>
      );
    case "airbus":
      return (
        <>
          {/* Side elevation: tail fin, double-deck fuselage, swept wings. */}
          <path d="m51 14 12.6-14h3.2l-1.6 15Z" />
          <path d="M0 16.5q1.8-3.4 6-3.9h48.5q5.3.2 10.1 1.7l8.1 2.2-7 1.6-9.7 1.6H8.5Q2 19.7 0 16.5Z" />
          <path d="m49.5 15.4 16.9-3.5h3.9L65 16.3Z" />
          <path d="m26.5 17.6 12.1-.6 18.7 4.6h-7.7Z" />
          <path d="M29 19.3h5.4q.8 0 .9.8v1.7h-6.7v-1.7q0-.8.4-.8Zm10 1h5.2q.6 0 .6.7v1.5h-6.3V21q0-.7.5-.7Z" />
          <path d="M4.4 14.2h3.1v1.1H3.1Z" fill={ink} />
          <g fill={ink} opacity=".8">
            {Array.from({ length: 28 }, (_, i) => (
              <g key={i}>
                <rect
                  x={10 + i * 1.65}
                  y="13.7"
                  width=".6"
                  height=".7"
                  rx=".23"
                />
                <rect
                  x={10 + i * 1.65}
                  y="16"
                  width=".6"
                  height=".7"
                  rx=".23"
                />
              </g>
            ))}
          </g>
          <g fill="none" stroke={ink} strokeWidth=".18" opacity=".5">
            {[8.3, 22, 40, 56].map((x) => (
              <rect key={x} x={x} y="15.4" width=".9" height="2.7" rx=".2" />
            ))}
          </g>
          <path
            d="M9 19.3v3.5m25-1.1v1.4m7-1.2v1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth=".5"
          />
          {[8.9, 33.4, 35.1, 40.6, 42.3].map((x) => (
            <circle key={x} cx={x} cy="23.4" r=".7" />
          ))}
        </>
      );
    case "titanic":
      return (
        <>
          <path d="M0 34.5h15v-3h213v-3H269l-10 16q-5 8.8-16 8.8H24Q10 51 4 41Z" />
          <path d="M27 32V26h17v-4h176v5h20v5Z" />
          {[73, 109, 145, 181].map((x) => (
            <g key={x}>
              <path d={`M${x} 23l-2.2-13h10.5l2.2 13Z`} />
              <path
                d={`M${x - 2.2} 10h10.5l.45 2.6h-10.5Z`}
                fill={ink}
                opacity=".7"
              />
            </g>
          ))}
          <path d="M47.5 0h1v30h-1zM226.5 2h1v28h-1z" />
          <path
            d="M48 2 18 29m30-27 24 20M227 4l-24 18m24-18 30 24M48 14h179"
            stroke="currentColor"
            strokeWidth=".35"
            fill="none"
            opacity=".8"
          />
          <path
            d="M1 35.8h262M11 45h246"
            stroke={ink}
            strokeWidth=".8"
            fill="none"
            opacity=".55"
          />
          <g fill={ink} opacity=".75">
            {Array.from({ length: 42 }, (_, i) => (
              <rect
                key={i}
                x={31 + i * 4.7}
                y="28"
                width="2"
                height="1.4"
                rx=".25"
              />
            ))}
            {Array.from({ length: 44 }, (_, i) => (
              <circle key={i} cx={26 + i * 5.15} cy="40.1" r=".7" />
            ))}
          </g>
          <path d="M45 24h175" stroke={ink} strokeWidth=".45" opacity=".5" />
        </>
      );
    case "pitch":
      return (
        <>
          <rect width="105" height="68" opacity=".13" />
          <g fill="none" stroke="currentColor" strokeWidth=".8">
            <rect x=".4" y=".4" width="104.2" height="67.2" />
            <path d="M52.5.2v67.6M.2 13.84H16.5v40.32H.2m104.6-40.32H88.5v40.32h16.3M.2 24.84h5.3v18.32H.2m104.6-18.32h-5.3v18.32h5.3" />
            <circle cx="52.5" cy="34" r="9.15" />
            <path d="M16.5 26.69a9.15 9.15 0 0 1 0 14.62m72-14.62a9.15 9.15 0 0 0 0 14.62" />
          </g>
          {[11, 52.5, 94].map((x) => (
            <circle key={x} cx={x} cy="34" r=".35" />
          ))}
        </>
      );
  }
}
export default function Silhouette({
  object,
  x = 0,
  y = 0,
  scale = 1,
  opacity = 1,
}: {
  object: GameObject;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
}) {
  return (
    <g
      data-object={object.id}
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="currentColor"
      opacity={opacity}
    >
      {object.illustration ? (
        <RasterSilhouette object={object} />
      ) : (
        <Drawing id={object.id} />
      )}
    </g>
  );
}
