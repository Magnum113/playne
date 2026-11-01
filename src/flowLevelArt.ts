/** Original painted cell maps. The coloured ground is part of the puzzle. */
export type FlowArtColor = {
  name: string;
  hex: string;
  dark: string;
  symbol: string;
  ink?: string;
};
export const FLOW_ART_COLORS: readonly FlowArtColor[] = [
  { name: "мятная", hex: "#46d6b1", dark: "#0e5342", symbol: "◆" },
  { name: "коралловая", hex: "#ff846d", dark: "#68261b", symbol: "●" },
  { name: "сиреневая", hex: "#ad99ff", dark: "#3c2b6d", symbol: "✦" },
  {
    name: "золотая",
    hex: "#ffd16b",
    dark: "#72500e",
    symbol: "▲",
    ink: "#594018",
  },
  { name: "голубая", hex: "#70c8ff", dark: "#19486a", symbol: "■" },
  { name: "розовая", hex: "#ef9ac3", dark: "#76294d", symbol: "♥" },
  { name: "персиковая", hex: "#ffb879", dark: "#713a17", symbol: "✚" },
  { name: "угольная", hex: "#483d54", dark: "#211b2a", symbol: "⬟" },
  {
    name: "белая",
    hex: "#eef7f6",
    dark: "#687c89",
    symbol: "○",
    ink: "#34414d",
  },
  { name: "лесная", hex: "#24865c", dark: "#104633", symbol: "♣" },
  {
    name: "лаймовая",
    hex: "#a8df57",
    dark: "#486c21",
    symbol: "✤",
    ink: "#344b1e",
  },
  { name: "оранжевая", hex: "#ff9b32", dark: "#9b4917", symbol: "⬢" },
  {
    name: "сливочная",
    hex: "#ffe7b3",
    dark: "#9a7547",
    symbol: "◇",
    ink: "#624725",
  },
  { name: "индиго", hex: "#6460bf", dark: "#302c70", symbol: "✧" },
  { name: "терракотовая", hex: "#b46e50", dark: "#653c2e", symbol: "▰" },
  { name: "фуксия", hex: "#bc58eb", dark: "#5d267d", symbol: "✿" },
];

export type FlowLevelArt = {
  name: string;
  family: string;
  width: number;
  height: number;
  cells: number[];
};
type Point = readonly [number, number];
const C = {
  mint: 0,
  coral: 1,
  lavender: 2,
  gold: 3,
  blue: 4,
  pink: 5,
  peach: 6,
  ink: 7,
  white: 8,
  green: 9,
  lime: 10,
  orange: 11,
  cream: 12,
  indigo: 13,
  clay: 14,
  fuchsia: 15,
};

/** Paint directly at the requested resolution, rather than repeating 2×2 pixels. */
class Canvas {
  cells: number[];
  constructor(
    readonly width: number,
    readonly height: number,
    ground = -1,
  ) {
    this.cells = Array(width * height).fill(ground);
  }
  paint(color: number, contains: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (
          contains(
            ((x + 0.5) * 32) / this.width,
            ((y + 0.5) * 32) / this.height,
          )
        )
          this.cells[y * this.width + x] = color;
  }
  rect(x: number, y: number, w: number, h: number, color: number) {
    this.paint(
      color,
      (px, py) => px >= x && px < x + w && py >= y && py < y + h,
    );
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, color: number) {
    this.paint(
      color,
      (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
    );
  }
  poly(points: readonly Point[], color: number) {
    this.paint(color, (x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i],
          [xj, yj] = points[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    });
  }
  line(points: readonly Point[], width: number, color: number) {
    this.paint(color, (x, y) =>
      points.slice(1).some(([bx, by], i) => {
        const [ax, ay] = points[i],
          dx = bx - ax,
          dy = by - ay;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
        return (
          (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2 <= width ** 2 / 4
        );
      }),
    );
  }
  star(cx: number, cy: number, radius: number, color: number) {
    this.poly(
      [
        [cx, cy - radius],
        [cx + radius * 0.28, cy - radius * 0.28],
        [cx + radius, cy],
        [cx + radius * 0.28, cy + radius * 0.28],
        [cx, cy + radius],
        [cx - radius * 0.28, cy + radius * 0.28],
        [cx - radius, cy],
        [cx - radius * 0.28, cy - radius * 0.28],
      ],
      color,
    );
  }
  dots(points: readonly Point[], color: number, size = 1) {
    for (const [x, y] of points)
      this.rect(x - size / 2, y - size / 2, size, size, color);
  }
}

function soccer(a: Canvas, stage: number) {
  if (stage) for (let x = 0; x < 32; x += 8) a.rect(x, 0, 4, 32, C.lime);
  if (stage) {
    a.rect(1, 1, 30, 1, C.white);
    a.rect(1, 30, 30, 1, C.white);
    a.rect(1, 1, 1, 30, C.white);
    a.rect(30, 1, 1, 30, C.white);
  }
  a.ellipse(16, 16, 13, 13, C.ink);
  a.ellipse(15.8, 15.4, 11.8, 11.8, C.white);
  a.poly(
    [
      [13, 10],
      [19, 10],
      [22, 15],
      [18, 20],
      [12, 18],
      [10, 14],
    ],
    C.ink,
  );
  a.poly(
    [
      [7, 6],
      [12, 4],
      [14, 8],
      [10, 12],
      [5, 11],
    ],
    C.ink,
  );
  a.poly(
    [
      [23, 6],
      [27, 11],
      [23, 14],
      [19, 9],
    ],
    C.ink,
  );
  a.poly(
    [
      [27, 19],
      [25, 25],
      [20, 27],
      [19, 21],
      [23, 17],
    ],
    C.ink,
  );
  a.poly(
    [
      [6, 18],
      [11, 20],
      [12, 25],
      [8, 26],
      [4, 22],
    ],
    C.ink,
  );
  a.line(
    [
      [11, 7],
      [13, 10],
    ],
    1.1,
    C.ink,
  );
  a.line(
    [
      [22, 12],
      [25, 12],
    ],
    1.1,
    C.ink,
  );
  a.line(
    [
      [20, 18],
      [22, 22],
    ],
    1.1,
    C.ink,
  );
  a.line(
    [
      [11, 18],
      [8, 21],
    ],
    1.1,
    C.ink,
  );
  a.line(
    [
      [10, 24],
      [17, 27],
      [21, 25],
    ],
    1.1,
    C.ink,
  );
  a.line(
    [
      [8, 10],
      [6, 14],
      [6, 16],
    ],
    1.3,
    C.white,
  );
  if (stage === 2)
    a.dots(
      [
        [9, 8],
        [10, 6],
        [18, 5],
        [25, 16],
      ],
      C.white,
      1.3,
    );
}

function magicCup(a: Canvas, stage: number) {
  // Empty handle and open space between the sparks create several access routes.
  a.ellipse(7.5, 21, 6, 6.5, C.ink);
  a.ellipse(7.5, 21, 4.8, 5.1, C.fuchsia);
  a.ellipse(7.5, 21, 2.7, 3.3, -1);
  a.poly(
    [
      [9, 12],
      [28, 12],
      [27, 25],
      [24, 29],
      [13, 29],
      [9, 25],
    ],
    C.ink,
  );
  a.poly(
    [
      [10.6, 13],
      [26.5, 13],
      [25.5, 24.5],
      [23, 27.2],
      [14, 27.2],
      [10.5, 24],
    ],
    C.fuchsia,
  );
  a.poly(
    [
      [13, 16],
      [25, 16],
      [24, 24.5],
      [22, 26],
      [14, 26],
    ],
    C.coral,
  );
  for (let y = 17; y < 25; y += 2.5)
    for (let x = 14; x < 24; x += 2.5)
      if ((Math.round((x - 14) / 2.5) + Math.round((y - 17) / 2.5)) % 2 === 0)
        a.rect(x, y, 1.6, 1.6, C.white);
  a.ellipse(18.6, 12.5, 9.7, 3.1, C.ink);
  a.ellipse(18.6, 12.1, 8.2, 2.2, C.white);
  a.poly(
    [
      [11, 11],
      [11, 8],
      [14, 6],
      [17, 7],
      [19, 4],
      [22, 6],
      [25, 7],
      [25, 10],
    ],
    C.gold,
  );
  a.dots(
    [
      [13, 8],
      [17, 9],
      [21, 6],
      [23, 9],
    ],
    C.white,
    1.4,
  );
  a.line(
    [
      [22, 5],
      [23, 3],
      [22, 1.8],
    ],
    1.3,
    C.ink,
  );
  a.star(4, 7, 3, C.gold);
  a.star(9, 2, 2, C.fuchsia);
  a.star(29, 19, 2.6, C.gold);
  a.star(5, 29, 2.3, C.gold);
  a.star(28, 29, 1.6, C.gold);
  a.dots(
    [
      [3, 14],
      [7, 4],
      [29, 8],
      [16, 30],
      [25, 2],
    ],
    C.white,
    1.1,
  );
  if (stage) {
    a.star(30, 13, 1.5, C.pink);
  }
  if (stage === 2)
    a.line(
      [
        [15, 6],
        [15, 3],
        [13, 1],
      ],
      1,
      C.blue,
    );
}

function sushi(a: Canvas, stage: number) {
  a.ellipse(16, 21, 14, 9, C.ink);
  a.ellipse(16, 20.8, 12.7, 7.6, C.peach);
  a.ellipse(16, 21.8, 11.5, 6.1, C.cream);
  a.ellipse(16, 22.5, 10.6, 4.8, C.white);
  a.ellipse(16, 13.8, 15, 10, C.ink);
  a.ellipse(16, 12.6, 13.7, 8.3, C.coral);
  a.ellipse(15.5, 11.8, 13.2, 7.1, C.orange);
  a.line(
    [
      [3.8, 12],
      [7, 7],
      [11, 5],
      [16, 5],
    ],
    1.6,
    C.gold,
  );
  a.line(
    [
      [8, 7],
      [12, 11],
      [16, 14],
    ],
    1.4,
    C.gold,
  );
  a.line(
    [
      [17, 5],
      [21, 9],
      [26, 11],
    ],
    1.4,
    C.gold,
  );
  a.poly(
    [
      [16, 4],
      [21, 4],
      [22, 7],
      [20, 10],
      [22, 14],
      [22, 19],
      [24, 24],
      [23, 32],
      [18, 32],
      [18, 23],
      [16, 19],
      [17, 14],
      [15, 10],
    ],
    C.green,
  );
  a.line(
    [
      [18, 6],
      [19, 9],
      [18, 12],
      [20, 16],
      [20, 22],
      [22, 26],
    ],
    1.2,
    C.lime,
  );
  a.dots(
    [
      [5, 12],
      [10, 6],
      [12, 10],
      [23, 8],
      [26, 14],
    ],
    C.white,
    1,
  );
  a.dots(
    [
      [6, 22],
      [9, 25],
      [12, 23],
      [15, 26],
      [25, 22],
      [25, 25],
    ],
    C.cream,
    1,
  );
  if (stage) {
    a.dots(
      [
        [3, 4],
        [29, 28],
        [30, 5],
      ],
      C.gold,
      1.2,
    );
    a.line(
      [
        [2, 29],
        [11, 30],
      ],
      1,
      C.clay,
    );
  }
}

function mango(a: Canvas, stage: number) {
  a.poly(
    [
      [16, 3],
      [21, 4],
      [26, 8],
      [29, 14],
      [28, 23],
      [23, 29],
      [15, 32.5],
      [8, 28],
      [3, 22],
      [2, 14],
      [6, 7],
      [11, 4],
    ],
    C.ink,
  );
  a.poly(
    [
      [15, 4.5],
      [21, 5.5],
      [25, 9],
      [27.5, 14],
      [27, 22],
      [22, 27.5],
      [15, 29],
      [8.5, 26.5],
      [4.5, 21],
      [3.5, 14],
      [7, 8],
      [11, 5.5],
    ],
    C.coral,
  );
  a.ellipse(15, 15, 12, 11, C.orange);
  a.ellipse(12.6, 13, 9.3, 9.5, C.gold);
  a.line(
    [
      [5.5, 18],
      [6, 12],
      [9, 8],
      [13, 6.5],
    ],
    1.6,
    C.white,
  );
  a.ellipse(11.5, 11, 3.4, 3.1, C.gold);
  a.line(
    [
      [17, 6],
      [17, 2],
      [15, 1],
    ],
    1.7,
    C.ink,
  );
  a.poly(
    [
      [17, 5],
      [13, 4],
      [10, 1.5],
      [13, 1.5],
      [17, 2.5],
      [19, 5],
    ],
    C.green,
  );
  a.poly(
    [
      [18, 5],
      [22, 2],
      [28, 2],
      [26, 7],
      [21, 8],
    ],
    C.ink,
  );
  a.poly(
    [
      [19, 5],
      [23, 3.5],
      [26.5, 3.3],
      [24.8, 6],
      [21, 6.7],
    ],
    C.lime,
  );
  a.line(
    [
      [20, 6],
      [25, 4],
    ],
    1,
    C.green,
  );
  if (stage) {
    a.star(29, 28, 1.5, C.white);
    a.dots(
      [
        [2, 5],
        [29, 10],
      ],
      C.white,
      1.2,
    );
  }
  if (stage === 2)
    a.poly(
      [
        [3, 28],
        [6, 27],
        [7, 30],
        [3, 31],
      ],
      C.lime,
    );
}

function berryCat(a: Canvas, stage: number) {
  a.line(
    [
      [24, 24],
      [28, 25],
      [30, 22],
      [31.5, 18],
    ],
    3.2,
    C.ink,
  );
  a.line(
    [
      [24, 24],
      [28, 25],
      [30, 22],
    ],
    1.4,
    C.indigo,
  );
  a.poly(
    [
      [5, 11],
      [5, 0],
      [10, 3],
      [15, 7],
      [19, 7],
      [24, 3],
      [27, 0],
      [27, 13],
    ],
    C.ink,
  );
  a.poly(
    [
      [7, 7],
      [7, 4],
      [11, 7],
    ],
    C.pink,
  );
  a.poly(
    [
      [22, 7],
      [25, 4],
      [25, 8],
    ],
    C.pink,
  );
  a.ellipse(16, 13, 12, 9.5, C.ink);
  a.ellipse(10.5, 12.5, 4.2, 4, C.white);
  a.ellipse(21.4, 12.5, 4.2, 4, C.white);
  a.ellipse(10.9, 12.9, 3.1, 3.2, C.lime);
  a.ellipse(21, 12.9, 3.1, 3.2, C.lime);
  a.rect(11, 11, 1.2, 4.5, C.green);
  a.rect(20.3, 11, 1.2, 4.5, C.green);
  a.dots(
    [
      [9, 11],
      [19.5, 11],
    ],
    C.white,
    1.1,
  );
  a.poly(
    [
      [14.4, 16],
      [17.6, 16],
      [16, 18],
    ],
    C.pink,
  );
  a.line(
    [
      [12, 18.2],
      [14, 19],
      [16, 18],
      [18, 19],
      [20, 18.2],
    ],
    1,
    C.clay,
  );
  a.dots(
    [
      [6.5, 15.5],
      [24.8, 15.5],
    ],
    C.pink,
    2.2,
  );
  a.poly(
    [
      [5, 22],
      [7, 19],
      [11, 19],
      [16, 22],
      [21, 19],
      [25, 19],
      [27, 23],
      [24, 27],
      [16, 31],
      [8, 27],
    ],
    C.ink,
  );
  a.poly(
    [
      [6.5, 22],
      [8, 20.4],
      [11, 20.5],
      [16, 23],
      [21, 20.5],
      [24, 20.4],
      [25.5, 23],
      [22.8, 26],
      [16, 29.6],
      [9.2, 26],
    ],
    C.coral,
  );
  a.poly(
    [
      [10, 20],
      [12, 18],
      [16, 20],
      [20, 18],
      [22, 20],
      [19, 22],
      [16, 21],
      [13, 22],
    ],
    C.green,
  );
  a.dots(
    [
      [9, 22.5],
      [13, 24],
      [18, 24],
      [23, 22.5],
      [12, 27],
      [19, 27],
      [16, 28.5],
    ],
    C.white,
    1.1,
  );
  a.star(29, 5, 1.6, C.white);
  a.star(2.5, 27, 1.7, C.white);
  if (stage) a.star(29, 12, 1.5, C.white);
  if (stage === 2)
    a.dots(
      [
        [3, 18],
        [27, 29],
      ],
      C.gold,
      1.2,
    );
}

function fish(a: Canvas, stage: number) {
  a.poly(
    [
      [10, 16],
      [3, 8],
      [0, 9],
      [0, 24],
      [4, 26],
      [11, 21],
    ],
    C.ink,
  );
  a.poly(
    [
      [9, 17],
      [4, 11],
      [4, 23],
      [10, 20],
    ],
    C.blue,
  );
  a.poly(
    [
      [13, 9],
      [15, 0],
      [20, 0],
      [23, 10],
    ],
    C.ink,
  );
  a.poly(
    [
      [14, 9],
      [16, 4],
      [19, 4],
      [21, 10],
    ],
    C.indigo,
  );
  a.ellipse(18, 17.2, 12, 11, C.ink);
  a.ellipse(18.1, 17.1, 10.7, 9.6, C.indigo);
  a.paint(
    C.white,
    (x, y) => ((x - 18.1) / 9.8) ** 2 + ((y - 17.1) / 8.7) ** 2 <= 1,
  );
  // Small connected scale arcs, with a light belly and dark back.
  a.paint(
    C.blue,
    (x, y) =>
      ((x - 18.1) / 9.8) ** 2 + ((y - 17.1) / 8.7) ** 2 <= 1 &&
      (Math.floor(y / 2) + Math.floor((x + (Math.floor(y / 2) % 2)) / 2)) %
        3 ===
        0,
  );
  a.paint(
    C.lavender,
    (x, y) =>
      ((x - 17) / 9) ** 2 + ((y - 15) / 7.4) ** 2 <= 1 &&
      (Math.floor(y / 2) + Math.floor(x / 3)) % 4 === 0,
  );
  a.paint(
    C.clay,
    (x, y) =>
      ((x - 17) / 8.8) ** 2 + ((y - 15) / 7.2) ** 2 <= 1 &&
      (Math.floor(y / 3) * 2 + Math.floor(x / 3)) % 7 === 0,
  );
  a.poly(
    [
      [12, 21],
      [17, 23],
      [17, 29],
      [14, 29],
      [11, 25],
    ],
    C.ink,
  );
  a.poly(
    [
      [13, 23],
      [15, 24],
      [15, 27],
      [13, 25],
    ],
    C.blue,
  );
  a.ellipse(25, 15, 3.6, 4, C.cream);
  a.ellipse(25.7, 15, 1.8, 2.4, C.ink);
  a.rect(26, 13.8, 0.9, 1, C.white);
  a.line(
    [
      [29, 20],
      [27, 21],
    ],
    1.1,
    C.ink,
  );
  a.rect(3, 24, 9, 7, C.ink);
  a.rect(4.2, 25, 6.7, 5, C.blue);
  a.ellipse(7.5, 24, 4.7, 2.4, C.ink);
  a.ellipse(7.5, 23.8, 3.4, 1.2, C.cream);
  a.ellipse(7.5, 23.6, 2.1, 0.6, C.orange);
  a.dots(
    [
      [29, 7],
      [30, 3],
      [27, 2],
    ],
    C.white,
    1.2,
  );
  if (stage)
    a.line(
      [
        [2, 19],
        [1, 16],
        [2, 13],
      ],
      1,
      C.orange,
    );
  if (stage === 2)
    a.line(
      [
        [27, 29],
        [28, 26],
        [30, 28],
        [31, 24],
      ],
      1.2,
      C.coral,
    );
}

function basketball(a: Canvas, stage: number) {
  a.rect(0, 25, 32, 7, C.clay);
  a.line(
    [
      [0, 29],
      [32, 29],
    ],
    1,
    C.cream,
  );
  a.ellipse(16, 15.5, 12.8, 12.8, C.ink);
  a.ellipse(16, 15.2, 11.5, 11.5, C.orange);
  a.ellipse(12, 11.5, 7.3, 7.3, C.gold);
  a.line(
    [
      [4.8, 13],
      [10, 15],
      [16, 16],
      [22, 15],
      [27, 12],
    ],
    1.5,
    C.ink,
  );
  a.line(
    [
      [14, 4],
      [16, 10],
      [16, 16],
      [14, 22],
      [11, 26],
    ],
    1.5,
    C.ink,
  );
  a.line(
    [
      [7, 7],
      [11, 9],
      [13, 13],
      [12, 18],
      [8, 22],
    ],
    1.3,
    C.ink,
  );
  a.line(
    [
      [22, 5.8],
      [20, 10],
      [21, 16],
      [24, 21],
      [25, 23],
    ],
    1.3,
    C.ink,
  );
  a.line(
    [
      [8, 10],
      [10, 7],
      [13, 6],
    ],
    1.2,
    C.cream,
  );
  if (stage) {
    a.rect(24, 1, 7, 5, C.white);
    a.rect(26, 3, 3, 3, C.ink);
    a.line(
      [
        [24, 7],
        [31, 7],
      ],
      1,
      C.coral,
    );
  }
}

function teapot(a: Canvas, stage: number) {
  a.ellipse(25, 19, 5.7, 7, C.ink);
  a.ellipse(25, 19, 4.3, 5.4, C.blue);
  a.ellipse(25, 19, 2.7, 3.7, -1);
  a.poly(
    [
      [9, 19],
      [5, 15],
      [4, 10],
      [1, 10],
      [2, 17],
      [6, 23],
      [11, 24],
    ],
    C.ink,
  );
  a.poly(
    [
      [9, 20],
      [6, 16],
      [5, 12],
      [3, 12],
      [4, 17],
      [8, 22],
    ],
    C.blue,
  );
  a.ellipse(16, 21, 10.5, 9, C.ink);
  a.ellipse(16, 20.5, 9, 7.5, C.blue);
  a.ellipse(16, 20, 7.6, 6.2, C.white);
  a.ellipse(16, 13.5, 8.5, 2.7, C.ink);
  a.ellipse(16, 12.9, 6.7, 2, C.lavender);
  a.ellipse(16, 10.5, 2, 2, C.ink);
  a.ellipse(16, 10.2, 1, 1.2, C.pink);
  a.star(16, 20, 3.3, C.pink);
  a.star(16, 20, 1.5, C.gold);
  a.dots(
    [
      [11, 22],
      [21, 22],
      [13, 25],
      [19, 25],
    ],
    C.lavender,
    1.1,
  );
  a.line(
    [
      [13, 8],
      [12, 6],
      [14, 4],
      [13, 2],
    ],
    1.2,
    C.blue,
  );
  a.line(
    [
      [19, 8],
      [20, 6],
      [18, 4],
      [19, 1],
    ],
    1.2,
    C.lavender,
  );
  a.star(3, 27, 2, C.gold);
  a.star(29, 6, 2.4, C.gold);
  if (stage) a.star(5, 4, 1.8, C.pink);
  if (stage === 2)
    a.dots(
      [
        [27, 29],
        [29, 26],
        [8, 29],
      ],
      C.gold,
      1.1,
    );
}

function maki(a: Canvas, stage: number) {
  a.ellipse(16, 24, 11.8, 6.6, C.ink);
  a.rect(4.3, 13.5, 23.4, 10.7, C.ink);
  a.ellipse(16, 22, 10.5, 6.3, C.green);
  a.rect(5.5, 13, 21, 10, C.green);
  a.line(
    [
      [6, 18],
      [7, 24],
      [12, 27],
    ],
    1.3,
    C.blue,
  );
  a.line(
    [
      [24, 18],
      [24, 24],
      [20, 27],
    ],
    1.2,
    C.lime,
  );
  a.ellipse(16, 13.5, 11.8, 8.7, C.ink);
  a.ellipse(16, 13.5, 10.2, 7.1, C.white);
  a.ellipse(16, 13.5, 8.8, 5.8, C.cream);
  a.poly(
    [
      [10, 10],
      [16, 8.5],
      [17, 14],
      [12, 17],
      [9, 15],
    ],
    C.coral,
  );
  a.poly(
    [
      [17, 9],
      [22, 11],
      [23, 15],
      [18, 18],
      [16, 14],
    ],
    C.lime,
  );
  a.poly(
    [
      [17, 10],
      [20, 11],
      [21, 14],
      [18, 16],
    ],
    C.green,
  );
  a.line(
    [
      [12, 10],
      [13, 14],
    ],
    1.2,
    C.orange,
  );
  a.dots(
    [
      [7, 12],
      [8, 16],
      [12, 19],
      [19, 7],
      [24, 12],
      [22, 18],
    ],
    C.white,
    1,
  );
  if (stage) {
    a.line(
      [
        [1, 28],
        [9, 30],
      ],
      1,
      C.clay,
    );
    a.line(
      [
        [23, 2],
        [30, 8],
      ],
      1,
      C.clay,
    );
  }
  if (stage === 2)
    a.dots(
      [
        [2, 8],
        [29, 23],
        [30, 27],
      ],
      C.pink,
      1.2,
    );
}

function citrus(a: Canvas, stage: number) {
  a.ellipse(22, 11, 9.6, 9.6, C.ink);
  a.ellipse(22, 11, 8.4, 8.4, C.orange);
  a.ellipse(21, 10, 7, 7, C.gold);
  a.line(
    [
      [17, 6],
      [20, 4],
      [23, 4],
    ],
    1.2,
    C.white,
  );
  a.poly(
    [
      [20, 3],
      [21, 0],
      [27, 0],
      [25, 4],
    ],
    C.lime,
  );
  a.line(
    [
      [21, 3],
      [25, 2],
    ],
    1,
    C.green,
  );
  a.ellipse(11.5, 21, 11, 10.4, C.ink);
  a.ellipse(11.5, 21, 9.8, 9.2, C.gold);
  a.ellipse(11.5, 21, 8.3, 7.8, C.cream);
  a.ellipse(11.5, 21, 6.9, 6.5, C.orange);
  const angles = [
    0,
    Math.PI / 3,
    (2 * Math.PI) / 3,
    Math.PI,
    (4 * Math.PI) / 3,
    (5 * Math.PI) / 3,
  ];
  for (const t of angles)
    a.line(
      [
        [11.5, 21],
        [11.5 + Math.cos(t) * 7.1, 21 + Math.sin(t) * 6.6],
      ],
      1.1,
      C.cream,
    );
  a.ellipse(11.5, 21, 1.6, 1.4, C.cream);
  a.dots(
    [
      [7.5, 18],
      [15, 24],
      [15, 18],
      [8, 24],
    ],
    C.coral,
    1.1,
  );
  if (stage) {
    a.star(29, 25, 1.6, C.white);
    a.line(
      [
        [1, 8],
        [4, 6],
        [7, 7],
      ],
      1,
      C.lime,
    );
  }
}

function fox(a: Canvas, stage: number) {
  a.line(
    [
      [7, 28],
      [2, 25],
      [2, 20],
      [6, 18],
      [10, 22],
    ],
    4,
    C.ink,
  );
  a.line(
    [
      [7, 28],
      [3, 25],
      [3, 21],
      [6, 20],
    ],
    2.5,
    C.orange,
  );
  a.line(
    [
      [4, 26],
      [2.5, 23],
      [3, 21],
    ],
    2,
    C.cream,
  );
  a.poly(
    [
      [5, 10],
      [5, 0],
      [12, 5],
      [19, 5],
      [27, 0],
      [27, 12],
      [24, 18],
      [16, 23],
      [7, 18],
    ],
    C.ink,
  );
  a.poly(
    [
      [6.5, 10],
      [6.7, 3.5],
      [12, 7],
      [19, 7],
      [25.5, 3.5],
      [25.5, 12],
      [22.7, 17],
      [16, 21],
      [8.3, 17],
    ],
    C.orange,
  );
  a.poly(
    [
      [7.2, 5],
      [10, 8],
      [7.5, 10],
    ],
    C.pink,
  );
  a.poly(
    [
      [24, 5],
      [21, 8],
      [24, 10],
    ],
    C.pink,
  );
  a.poly(
    [
      [6.8, 13],
      [11, 13],
      [16, 18],
      [21, 13],
      [25, 13],
      [22, 17],
      [16, 21],
      [9, 17],
    ],
    C.cream,
  );
  a.dots(
    [
      [11, 11.5],
      [21, 11.5],
    ],
    C.ink,
    1.6,
  );
  a.poly(
    [
      [14.5, 17],
      [17.5, 17],
      [16, 18.5],
    ],
    C.ink,
  );
  a.ellipse(16, 26, 8.2, 5.4, C.ink);
  a.ellipse(16, 25.7, 6.8, 4.2, C.coral);
  a.line(
    [
      [16, 22],
      [16, 19.5],
    ],
    1.1,
    C.clay,
  );
  a.poly(
    [
      [17, 21],
      [20, 18.5],
      [23, 19],
      [20, 22],
    ],
    C.green,
  );
  a.line(
    [
      [12, 24],
      [11.5, 26],
    ],
    1.2,
    C.white,
  );
  a.star(29, 24, 1.7, C.white);
  if (stage) a.star(2, 4, 1.5, C.gold);
  if (stage === 2)
    a.dots(
      [
        [28, 29],
        [1, 14],
      ],
      C.lime,
      1.2,
    );
}

function turtle(a: Canvas, stage: number) {
  a.rect(0, 28, 32, 4, C.cream);
  a.poly(
    [
      [10, 10],
      [5, 5],
      [3, 6],
      [5, 12],
      [10, 15],
    ],
    C.ink,
  );
  a.poly(
    [
      [10, 11],
      [5, 7],
      [6, 11],
      [10, 13],
    ],
    C.green,
  );
  a.poly(
    [
      [9, 23],
      [4, 28],
      [6, 30],
      [13, 26],
    ],
    C.ink,
  );
  a.poly(
    [
      [10, 24],
      [6, 28],
      [7, 29],
      [12, 26],
    ],
    C.green,
  );
  a.poly(
    [
      [23, 21],
      [28, 26],
      [27, 29],
      [21, 25],
    ],
    C.ink,
  );
  a.poly(
    [
      [23, 23],
      [26, 26],
      [26, 27],
      [22, 25],
    ],
    C.green,
  );
  a.ellipse(27, 13, 4.5, 4.6, C.ink);
  a.ellipse(27.2, 12.8, 3.2, 3.2, C.lime);
  a.dots([[28.5, 12]], C.ink, 1.1);
  a.ellipse(16, 17.5, 11, 11, C.ink);
  a.ellipse(16, 17.5, 9.7, 9.7, C.green);
  a.poly(
    [
      [12, 11],
      [19, 11],
      [22, 17],
      [19, 24],
      [12, 24],
      [9, 17],
    ],
    C.lime,
  );
  a.poly(
    [
      [13, 12.5],
      [18, 12.5],
      [20, 17],
      [18, 22],
      [13, 22],
      [11, 17],
    ],
    C.green,
  );
  a.line(
    [
      [16, 8],
      [16, 12],
      [11, 17],
      [6.5, 17],
    ],
    1,
    C.ink,
  );
  a.line(
    [
      [25.5, 17],
      [20, 17],
      [16, 22],
      [16, 27],
    ],
    1,
    C.ink,
  );
  a.line(
    [
      [13, 22],
      [10, 25],
    ],
    1,
    C.ink,
  );
  a.line(
    [
      [19, 12],
      [22, 9],
    ],
    1,
    C.ink,
  );
  a.line(
    [
      [12, 12],
      [14, 10],
      [17, 10],
    ],
    1.1,
    C.white,
  );
  a.dots(
    [
      [3, 3],
      [5, 1],
      [29, 4],
    ],
    C.white,
    1.2,
  );
  if (stage)
    a.line(
      [
        [29, 30],
        [29, 26],
        [27, 24],
        [29, 26],
        [31, 23],
      ],
      1.2,
      C.coral,
    );
  if (stage === 2)
    a.dots(
      [
        [2, 24],
        [29, 18],
      ],
      C.gold,
      1.3,
    );
}

const motifs = [
  { name: "Чашка звёзд", family: "magic-cup", ground: -1, paint: magicCup },
  {
    name: "Мяч на лужайке",
    family: "football",
    ground: C.green,
    paint: soccer,
  },
  { name: "Лосось и рис", family: "sushi", ground: C.white, paint: sushi },
  { name: "Солнечное манго", family: "mango", ground: C.blue, paint: mango },
  {
    name: "Котёнок и клубника",
    family: "berry-cat",
    ground: C.blue,
    paint: berryCat,
  },
  {
    name: "Рыбка в узорах",
    family: "tropical-fish",
    ground: C.gold,
    paint: fish,
  },
  {
    name: "Большая игра",
    family: "basketball",
    ground: C.indigo,
    paint: basketball,
  },
  { name: "Чай с облаками", family: "teapot", ground: -1, paint: teapot },
  { name: "Ролл на тарелке", family: "maki", ground: C.cream, paint: maki },
  {
    name: "Апельсиновый сад",
    family: "citrus",
    ground: C.green,
    paint: citrus,
  },
  { name: "Лисёнок и яблоко", family: "fox-apple", ground: C.mint, paint: fox },
  {
    name: "Морская прогулка",
    family: "sea-turtle",
    ground: C.blue,
    paint: turtle,
  },
] as const;

/** 12 compositions grow in resolution and acquire details across three chapters. */
export function flowLevelArt(index: number): FlowLevelArt {
  const safe = Number.isFinite(index)
    ? ((Math.trunc(index) % 36) + 36) % 36
    : 0;
  const stage = Math.floor(safe / 12),
    motif = motifs[safe % motifs.length];
  const size = [24, 30, 36][stage];
  const width = size,
    height = motif.family === "sushi" ? Math.round(size * 0.76) : size;
  const canvas = new Canvas(width, height, motif.ground);
  motif.paint(canvas, stage);
  return {
    name:
      motif.name +
      (stage === 1 ? " · детали" : stage === 2 ? " · панорама" : ""),
    family: motif.family,
    width,
    height,
    cells: canvas.cells,
  };
}
