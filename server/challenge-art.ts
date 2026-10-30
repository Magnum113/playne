import type { ChallengeGame } from "../src/challenges";
import { LINE_INTRO_PATH, LINE_INTRO_PUZZLE } from "../src/line";

const tile = (x: number, y: number, size: number, color: string, rx = 6) =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="${color}"/>`;
const shapes = (cells: number[][], x: number, y: number, color: string) =>
  cells.map(([cx, cy]) => tile(x + cx * 35, y + cy * 35, 31, color)).join("");
const hex = (x: number, y: number, color: string) =>
  `<path d="M${x} ${y - 35}l30.31 17.5v35L${x} ${y + 35}l-30.31-17.5v-35Z" fill="${color}" stroke="#fffefa" stroke-width="4"/>`;

/** Public, illustrative examples only. Never render the invited puzzle's answers. */
export function challengeArt(game: ChallengeGame): string {
  const art: Record<ChallengeGame, () => string> = {
    circle: () =>
      `<path d="M877 195C955 192 1020 257 1020 337s-59 142-140 143c-79 1-143-62-143-141s59-143 140-144Z" fill="none" stroke="#137866" stroke-width="3.5" stroke-linecap="round"/><circle cx="879" cy="337" r="4.5" fill="#137866"/>`,
    flash: () =>
      Array.from({ length: 16 }, (_, i) =>
        tile(
          754 + (i % 4) * 66,
          209 + Math.floor(i / 4) * 66,
          58,
          [1, 4, 6, 10, 15].includes(i) ? "#137866" : "#e9eeea",
          8,
        ),
      ).join(""),
    rotate: () =>
      `<rect x="738" y="260" width="137" height="158" rx="19" fill="#eee6fb"/>${shapes(
        [
          [0, 0],
          [0, 1],
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        753,
        284,
        "#7953b4",
      )}<rect x="917" y="260" width="137" height="158" rx="19" fill="#e1f3ec"/>${shapes(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 1],
          [0, 2],
        ],
        932,
        284,
        "#137866",
      )}<path d="M868 236a36 36 0 0 1 57 0m-1-15 1 15-15-1" fill="none" stroke="#7953b4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    line: () => {
      const p = LINE_INTRO_PUZZLE;
      return `<rect x="758" y="216" width="240" height="240" rx="16" fill="#fffefa" stroke="#dedfd8" stroke-width="1.5"/>${[1, 2].map((n) => `<path d="M${758 + n * 80} 216v240M758 ${216 + n * 80}h240" stroke="#e8e9e2" stroke-width="1.5"/>`).join("")}<polyline points="${LINE_INTRO_PATH.map((c) => `${798 + (c % 3) * 80},${256 + Math.floor(c / 3) * 80}`).join(" ")}" fill="none" stroke="#137866" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>${Object.entries(
        p.numbers,
      )
        .map(([cell, n]) => {
          const x = 798 + (Number(cell) % 3) * 80,
            y = 256 + Math.floor(Number(cell) / 3) * 80;
          return `<circle cx="${x}" cy="${y}" r="19" fill="#fffefa" stroke="#137866" stroke-width="2"/><text x="${x}" y="${y + 7}" font-size="20" font-weight="700" text-anchor="middle" fill="#252a2d">${n}</text>`;
        })
        .join("")}`;
    },
    slide: () =>
      `<rect x="752" y="211" width="252" height="252" rx="16" fill="#fffefa" stroke="#dedfd8" stroke-width="1.5"/>${[1, 2, 3, 4, 5].map((n) => `<path d="M${752 + n * 42} 211v252M752 ${211 + n * 42}h252" stroke="#e8e9e2"/>`).join("")}<rect x="757" y="300" width="74" height="32" rx="7" fill="#b03434"/><rect x="841" y="258" width="32" height="74" rx="7" fill="#bea5f7"/><rect x="925" y="216" width="32" height="116" rx="7" fill="#137866"/><rect x="799" y="384" width="116" height="32" rx="7" fill="#eab385"/><rect x="967" y="342" width="32" height="74" rx="7" fill="#c8e4da"/><path d="M1013 316h38m-10-10 10 10-10 10" fill="none" stroke="#b03434" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    dispatch: () =>
      `<g stroke-linecap="round" stroke-linejoin="round"><path d="M731 336h140l99-98h58M871 336h157M871 336l99 98h58" fill="none" stroke="#a8b4b2" stroke-width="13"/><path d="M731 336h140l99-98h58M871 336h157M871 336l99 98h58" fill="none" stroke="#fffefa" stroke-width="4" stroke-dasharray="4 9"/><circle cx="1028" cy="238" r="23" fill="#e1f3ec" stroke="#137866" stroke-width="3"/><rect x="1005" y="313" width="46" height="46" rx="6" fill="#eee6fb" stroke="#7953b4" stroke-width="3"/><path d="m1028 408 25 45h-50Z" fill="#f9e9d8" stroke="#995726" stroke-width="3"/><circle cx="871" cy="336" r="15" fill="#7953b4"/><path d="m864 335 13-8m0 0-2 9m2-9-9-1" fill="none" stroke="#fffefa" stroke-width="2.5"/><rect x="757" y="319" width="49" height="33" rx="10" fill="#137866"/><rect x="785" y="326" width="11" height="9" rx="2" fill="#e1f3ec"/></g>`,
    colorfle: () =>
      [
        [-1, -1, "#72cbb4"],
        [1, -1, "#9bd6c4"],
        [-2, 0, "#bce6d7"],
        [0, 0, "#137866"],
        [2, 0, "#5dbca3"],
        [-1, 1, "#a2c7b6"],
        [1, 1, "#d0eadf"],
      ]
        .map(([x, y, color]) =>
          hex(879 + Number(x) * 32, 337 + Number(y) * 56, String(color)),
        )
        .join(""),
    geo: () =>
      `<circle cx="871" cy="340" r="111" fill="#e1f3ec" stroke="#137866" stroke-width="3"/><ellipse cx="871" cy="340" rx="46" ry="111" fill="none" stroke="#70b8a4" stroke-width="2"/><path d="M760 340h222m-203-62h184m-184 124h184M871 229v222" stroke="#70b8a4" stroke-width="2"/><path d="M970 229c-27 0-44 20-44 43 0 35 44 74 44 74s44-39 44-74c0-23-17-43-44-43Z" fill="#7953b4" stroke="#fffefa" stroke-width="5"/><circle cx="970" cy="271" r="13" fill="#eee6fb"/>`,
    pressure: () =>
      `<circle cx="879" cy="337" r="120" fill="#fffefa" stroke="#e8e9e2" stroke-width="2"/><path d="M784 381a103 103 0 1 1 190 0" fill="none" stroke="#e1f3ec" stroke-width="15"/><path d="M932 249a103 103 0 0 1 49 71" fill="none" stroke="#bea5f7" stroke-width="15"/>${Array.from(
        { length: 7 },
        (_, i) => {
          const a = ((i * 40 - 210) * Math.PI) / 180;
          return `<path d="M${879 + 82 * Math.cos(a)} ${337 + 82 * Math.sin(a)}l${-9 * Math.cos(a)} ${-9 * Math.sin(a)}" stroke="#a8b4b2" stroke-width="2"/>`;
        },
      ).join(
        "",
      )}<path d="M879 337l56-71" stroke="#137866" stroke-width="7" stroke-linecap="round"/><circle cx="879" cy="337" r="10" fill="#137866"/><rect x="850" y="390" width="58" height="25" rx="12" fill="#eee6fb"/>`,
    naglaz: () =>
      `<g stroke="#137866" stroke-linecap="round" stroke-linejoin="round"><path d="M812 219v-20m0 20-7 52-13 49-21 67-29 62h37c3-26 14-46 33-46s30 20 33 46h37l-29-62-21-67-13-49-7-52Z" fill="#e1f3ec" stroke-width="3"/><path d="M798 286h28m-37 37h46m-67 66h88m-57-103 36 37-51 55 14 11m27-103-36 37 51 55-14 11M764 407h96" fill="none" stroke-width="2.5"/></g><path d="M920 350h42m-11-11 11 11-11 11" fill="none" stroke="#7953b4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="1002" y="235" width="21" height="195" rx="9" fill="#bea5f7"/><path d="m1002 421 10.5 27 10.5-27" fill="#7953b4"/><rect x="1002" y="235" width="21" height="18" rx="8" fill="#7953b4"/>`,
  };
  return `<g data-game-art="${game}" font-family="Noto Sans">${art[game]()}</g>`;
}

/** The same supplied brand geometry as SiteHeader.PlayneMark, with flat fills. */
export const previewBrand = `<g transform="translate(84 32) scale(.036)"><path fill="#bea5f7" fill-rule="evenodd" d="M334 97H545C850 97 1078 295 1078 578S850 1059 490 1059V558C490 349 435 160 334 97ZM551 365C524 348 496 368 496 400V777C496 809 524 826 551 809L849 623C877 605 877 567 849 548Z"/><path fill="#61d7c1" d="M232 97H334C435 160 490 349 490 558V1075C490 1176 411 1254 314 1254S137 1176 137 1075V194C137 138 174 97 232 97Z"/><rect x="881" y="1018" width="236" height="236" rx="82" fill="#efb17b"/></g>`;
