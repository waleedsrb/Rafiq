// Number plates drawn like the real ones, for any registration, from the asset studio's
// generator (/mnt/project-files/assets/plates/src/plates.mjs, Waleed's plate assets).
// 1 SVG unit = 1 mm on a 520 x 110 mm plate. Characters are DIN-style stroked centrelines.
// plateSvg() returns null when a plate isn't in a format we can draw (the app then shows
// the plain text plate instead).

const f = (n: number) => +n.toFixed(2);

// Ids must be unique wherever several plates share one document (the web build).
let uid = 0;

// Arabic ف, Hebrew and Arabic band words, and the standards mark, as outlines (Noto, OFL).
const TEXT = {
  he: {
    d: "M12.47 76.96H16.84L16.7 78.08L14.45 84.5H12.47L14.61 78.53H10.57V75.2L12.47 75ZM23.1 84.5Q22.55 83.55 22.03 82.73Q21.51 81.91 20.99 81.15Q20.8 80.91 20.62 80.66Q20.31 80.8 20.14 81.06Q19.94 81.36 19.85 81.76Q19.76 82.15 19.69 82.6L19.4 84.5H17.5L17.8 82.49Q17.91 81.8 18.14 81.19Q18.36 80.59 18.84 80.11Q19.19 79.76 19.74 79.54Q19.54 79.28 19.3 78.96Q18.99 78.58 18.68 78.19Q18.38 77.8 18.12 77.47Q17.88 77.15 17.71 76.96H20.04Q20.28 77.25 20.56 77.64Q20.85 78.04 21.14 78.44Q21.44 78.84 21.66 79.16Q21.99 79.64 22.31 80.12Q22.58 79.99 22.74 79.78Q22.95 79.47 23.06 79.07Q23.16 78.67 23.2 78.25L23.36 76.96H25.25L25.1 78.36Q25.04 79.04 24.78 79.65Q24.53 80.26 24 80.72Q23.64 81.05 23.11 81.28Q23.6 81.96 24.09 82.65Q24.71 83.55 25.3 84.5ZM29.71 84.5V79.65Q29.71 79.09 29.44 78.81Q29.16 78.53 28.64 78.53H26.09L26.29 76.96H28.74Q30.16 76.96 30.89 77.63Q31.61 78.3 31.61 79.61V84.5ZM37.13 84.59Q35.83 84.59 34.89 84.08Q33.95 83.56 33.45 82.55Q32.95 81.54 32.95 80V76.96H34.84V79.99Q34.84 80.12 34.84 80.25Q35.2 80.2 35.44 80.06Q35.86 79.83 36.03 79.3Q36.2 78.78 36.2 78.01V76.96H38.09V77.92Q38.09 78.76 37.89 79.45Q37.7 80.14 37.26 80.61Q36.83 81.09 36.1 81.33Q35.64 81.49 35.03 81.53Q35.06 81.65 35.1 81.75Q35.36 82.44 35.87 82.76Q36.38 83.08 37.09 83.08H37.14Q37.88 83.06 38.38 82.75Q38.89 82.44 39.15 81.76Q39.41 81.08 39.41 80V76.96H41.31V80.01Q41.31 81.55 40.81 82.56Q40.31 83.56 39.39 84.07Q38.48 84.58 37.19 84.59ZM43.52 81.33V78.53H42.5L42.71 76.96H45.42V81.33Z",
  },
  ar: {
    d: "M13.1 97.51Q13.1 97.27 13.14 97Q13.19 96.72 13.29 96.41Q13.38 96.09 13.52 95.74L14.24 96.02Q14.14 96.3 14.06 96.55Q13.99 96.8 13.95 97.02Q13.92 97.24 13.92 97.44Q13.92 97.95 14.19 98.3Q14.46 98.65 14.89 98.83Q15.33 99 15.83 99Q16.81 99 17.36 98.66Q17.91 98.31 18.13 97.75Q18.35 97.18 18.32 96.51L18.1 90.36H18.93L19.09 95.43Q19.11 95.94 19.25 96.22Q19.4 96.51 19.65 96.62Q19.9 96.73 20.2 96.73Q20.41 96.73 20.5 96.84Q20.6 96.96 20.6 97.12Q20.6 97.28 20.46 97.41Q20.32 97.55 20.1 97.55Q19.79 97.55 19.57 97.47Q19.35 97.38 19.21 97.24Q19.16 97.2 19.12 97.14Q19.06 97.53 18.93 97.91Q18.74 98.44 18.36 98.87Q17.98 99.3 17.34 99.56Q16.71 99.82 15.78 99.82Q15.26 99.82 14.77 99.66Q14.29 99.51 13.91 99.21Q13.54 98.91 13.32 98.48Q13.1 98.06 13.1 97.51ZM22.62 99.44Q22.41 99.44 22.26 99.29Q22.12 99.15 22.12 98.95Q22.12 98.75 22.26 98.6Q22.41 98.45 22.62 98.45Q22.82 98.45 22.96 98.6Q23.11 98.75 23.11 98.95Q23.11 99.15 22.96 99.29Q22.82 99.44 22.62 99.44ZM21.25 99.44Q21.04 99.44 20.89 99.29Q20.75 99.15 20.75 98.95Q20.75 98.75 20.89 98.6Q21.04 98.45 21.25 98.45Q21.45 98.45 21.59 98.6Q21.74 98.75 21.74 98.95Q21.74 99.15 21.59 99.29Q21.45 99.44 21.25 99.44ZM20.1 97.55 20.2 96.73Q20.7 96.73 20.98 96.66Q21.26 96.58 21.4 96.37Q21.55 96.15 21.64 95.74Q21.73 95.33 21.86 94.67L22.64 94.82Q22.6 95 22.55 95.22Q22.5 95.44 22.46 95.66Q22.43 95.87 22.43 96.03Q22.43 96.18 22.45 96.31Q22.47 96.44 22.6 96.53Q22.73 96.62 23.04 96.68Q23.35 96.73 23.93 96.73Q24.14 96.73 24.23 96.84Q24.33 96.96 24.33 97.12Q24.33 97.28 24.19 97.41Q24.05 97.55 23.83 97.55Q23.22 97.55 22.86 97.48Q22.5 97.42 22.31 97.29Q22.13 97.16 22.06 96.96Q22.04 96.93 22.03 96.89Q21.96 96.98 21.9 97.05Q21.71 97.25 21.47 97.36Q21.23 97.47 20.89 97.51Q20.56 97.55 20.1 97.55ZM24.2 92.86 24.08 92.32Q24.34 92.26 24.5 92.22L24.55 92.21Q24.43 92.12 24.32 92Q24.08 91.74 24.08 91.41Q24.08 91.11 24.22 90.91Q24.37 90.7 24.6 90.6Q24.84 90.5 25.11 90.5Q25.22 90.5 25.34 90.52Q25.47 90.54 25.58 90.58L25.5 91.08Q25.4 91.06 25.31 91.04Q25.22 91.02 25.11 91.02Q24.88 91.02 24.75 91.12Q24.62 91.21 24.62 91.38Q24.62 91.59 24.75 91.74Q24.89 91.89 25.07 91.97Q25.14 92.01 25.2 92.03Q25.33 91.99 25.45 91.95Q25.68 91.88 25.87 91.81L26.03 92.32Q25.79 92.41 25.46 92.51Q25.14 92.61 24.81 92.7Q24.48 92.79 24.2 92.86ZM23.83 97.55 23.93 96.73Q24.42 96.73 24.71 96.67Q25 96.61 25.13 96.42Q25.26 96.24 25.26 95.87Q25.26 95.62 25.18 95.28Q25.1 94.93 24.97 94.54Q24.84 94.15 24.69 93.77L25.5 93.47Q25.63 93.79 25.74 94.2Q25.86 94.61 25.94 95.01Q26.02 95.41 26.02 95.71Q26.02 96.11 25.93 96.41Q25.85 96.72 25.68 96.94Q25.51 97.15 25.24 97.28Q24.98 97.42 24.63 97.48Q24.28 97.55 23.83 97.55ZM27.44 97.5 27.24 90.36H28.05L28.25 97.5ZM28.69 99.82 28.4 99.06Q29.13 98.82 29.61 98.51Q30.1 98.2 30.38 97.85Q30.67 97.5 30.79 97.13Q30.91 96.77 30.91 96.43Q30.91 95.94 30.7 95.44Q30.48 94.93 30.22 94.48L30.95 94.11Q31.14 94.46 31.29 94.8Q31.43 95.14 31.55 95.44Q31.66 95.74 31.73 95.99Q31.87 96.42 32.09 96.58Q32.32 96.73 32.71 96.73Q32.92 96.73 33.02 96.84Q33.11 96.96 33.11 97.12Q33.11 97.28 32.97 97.41Q32.83 97.55 32.61 97.55Q32.17 97.55 31.9 97.39Q31.7 97.28 31.57 97.12Q31.5 97.5 31.32 97.83Q31.02 98.38 30.56 98.78Q30.1 99.19 29.6 99.45Q29.1 99.71 28.69 99.82ZM32.61 97.55 32.71 96.73Q33.03 96.73 33.23 96.69Q33.43 96.64 33.56 96.45Q33.7 96.27 33.82 95.87Q33.94 95.47 34.1 94.75L34.85 94.96Q34.81 95.13 34.76 95.34Q34.71 95.56 34.67 95.78Q34.63 96.01 34.63 96.2Q34.63 96.45 34.82 96.59Q35.01 96.73 35.51 96.73Q35.81 96.73 36 96.68Q36.19 96.63 36.31 96.44Q36.44 96.25 36.54 95.83Q36.64 95.41 36.75 94.68L37.51 94.82Q37.48 95 37.44 95.26Q37.4 95.52 37.36 95.78Q37.33 96.03 37.33 96.2Q37.33 96.34 37.39 96.47Q37.46 96.59 37.66 96.66Q37.85 96.73 38.24 96.73Q38.53 96.73 38.75 96.66Q38.96 96.59 39.08 96.4Q39.19 96.21 39.19 95.87Q39.19 95.49 39.02 94.91Q38.84 94.34 38.62 93.77L39.43 93.47Q39.56 93.79 39.67 94.2Q39.79 94.61 39.87 95.01Q39.95 95.41 39.95 95.71Q39.95 96.17 39.83 96.52Q39.71 96.87 39.49 97.09Q39.27 97.32 38.95 97.44Q38.63 97.55 38.23 97.55Q37.76 97.55 37.46 97.44Q37.16 97.33 37 97.1Q36.95 97.03 36.91 96.95Q36.82 97.08 36.73 97.18Q36.52 97.4 36.21 97.47Q35.9 97.55 35.39 97.55Q35.14 97.55 34.86 97.47Q34.57 97.39 34.36 97.15Q34.26 97.04 34.2 96.88Q34.1 97.04 34 97.14Q33.75 97.39 33.41 97.47Q33.07 97.55 32.61 97.55ZM41.07 100.53 40.95 99.99Q41.21 99.93 41.37 99.89L41.42 99.88Q41.3 99.79 41.19 99.67Q40.95 99.41 40.95 99.08Q40.95 98.78 41.09 98.58Q41.24 98.37 41.48 98.27Q41.71 98.17 41.98 98.17Q42.09 98.17 42.22 98.19Q42.34 98.21 42.45 98.25L42.37 98.75Q42.27 98.73 42.18 98.71Q42.09 98.69 41.98 98.69Q41.75 98.69 41.62 98.78Q41.49 98.88 41.49 99.05Q41.49 99.26 41.62 99.41Q41.76 99.56 41.94 99.64Q42.01 99.68 42.07 99.7Q42.2 99.66 42.32 99.62Q42.55 99.55 42.74 99.48L42.9 99.99Q42.66 100.08 42.33 100.18Q42.01 100.28 41.68 100.37Q41.35 100.46 41.07 100.53ZM41.34 97.5 41.17 91.06H41.98L42.15 97.5Z",
  },
  fa: {
    d: "M6.31 -20.03Q4.57 -21.45 3.69 -22.47Q4.47 -23.26 5.1 -23.92Q5.73 -24.58 6.24 -25.19Q6.61 -24.79 7.23 -24.17Q7.84 -23.56 8.69 -22.75Q8.28 -22.17 7.68 -21.49Q7.09 -20.81 6.31 -20.03ZM-4.33 0Q-8.45 0 -10.54 -1.87Q-12.63 -3.74 -12.63 -7.24Q-12.63 -7.96 -12.46 -8.89Q-12.29 -9.83 -11.95 -10.98H-10.45L-10.52 -10.1Q-10.56 -9.66 -10.56 -9.28Q-10.56 -7.31 -9.77 -6.22Q-8.99 -5.13 -7.39 -4.59Q-6.58 -4.32 -5.51 -4.17Q-4.44 -4.01 -3.11 -4.01Q-0.9 -4.01 1.16 -4.15Q3.21 -4.28 5.02 -4.54Q6.82 -4.79 8.3 -5.19Q9.78 -5.58 10.86 -6.05Q10.76 -6.56 10.61 -7.11Q10.46 -7.65 10.25 -8.26Q9.3 -7.55 8.06 -7.09Q6.82 -6.63 5.59 -6.63Q3.83 -6.63 2.74 -7.7Q1.65 -8.77 1.65 -10.61Q1.65 -12.41 2.33 -14.08Q3.01 -15.74 4.06 -16.73Q5.19 -17.75 6.34 -17.75Q7.94 -17.75 9.44 -16.25Q10.93 -14.76 11.78 -12.14Q12.22 -10.81 12.43 -9.33Q12.63 -7.85 12.63 -6.22Q12.63 -5.81 12.58 -5.19Q12.53 -4.56 12.29 -3.89Q12.05 -3.23 11.44 -2.75Q9.98 -1.84 8.16 -1.29Q6.34 -0.75 4.27 -0.46Q2.19 -0.17 0.02 -0.09Q-2.16 0 -4.33 0ZM6.24 -9.52Q6.92 -9.52 7.74 -9.67Q8.55 -9.83 9.47 -10.13Q8.62 -11.93 7.63 -12.82Q6.65 -13.7 5.63 -13.7Q4.78 -13.7 4.1 -13.07Q3.42 -12.44 3.42 -11.46Q3.42 -10.64 4.25 -10.08Q5.08 -9.52 6.24 -9.52Z",
  },
  ti: {
    d: "M-3.09 -1.27V-2.39H-3.5L-3.41 -3.02H-2.33V-1.27ZM-1.95 -1.64Q-1.91 -1.8 -1.87 -1.98Q-1.83 -2.16 -1.8 -2.34Q-1.76 -2.52 -1.74 -2.7Q-1.71 -2.87 -1.69 -3.02H-1.03L-1 -2.96Q-1.05 -2.77 -1.11 -2.54Q-1.18 -2.3 -1.25 -2.06Q-1.33 -1.82 -1.41 -1.64ZM-0.84 -1.64Q-0.78 -1.85 -0.73 -2.1Q-0.69 -2.35 -0.65 -2.58Q-0.6 -2.82 -0.58 -3.02H0.08L0.1 -2.96Q0.06 -2.77 -0 -2.54Q-0.07 -2.3 -0.14 -2.06Q-0.22 -1.82 -0.3 -1.64ZM2.74 0V-1.94Q2.74 -2.17 2.63 -2.28Q2.52 -2.39 2.31 -2.39H1.67V-0.98Q1.67 -0.5 1.45 -0.25Q1.23 0 0.79 0H0.38L0.46 -0.62H0.64Q0.73 -0.62 0.79 -0.66Q0.85 -0.7 0.88 -0.78Q0.91 -0.85 0.91 -0.96V-2.39H0.45L0.54 -3.02H2.35Q2.92 -3.02 3.21 -2.75Q3.5 -2.48 3.5 -1.96V0Z",
  },
} as const;

// ---------- Glyphs (centreline box: x 0..w, y 0..h, y down) ----------
// Diagonal endpoints that meet the top/bottom are pushed past the box (by `o`)
// and the row is clipped, which gives the flat DIN terminals.
function glyph(ch: string, w: number, h: number, o: number): string[] | null {
  const r = w / 2;
  const ext = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): [number, number] => {
    // extend segment (x1,y1)->(x2,y2) past its end by o (in y)
    const dy = y2 - y1,
      dx = x2 - x1,
      k = (Math.abs(dy) + o) / Math.abs(dy);
    return [f(x1 + dx * k), f(y1 + dy * k)];
  };
  const P = (x: number, y: number) => `${f(x)},${f(y)}`;
  const arc = (
    rx: number,
    ry: number,
    large: number,
    sweep: number,
    x: number,
    y: number,
  ) => `A${f(rx)},${f(ry)} 0 ${large} ${sweep} ${P(x, y)}`;
  const ell = (cx: number, cy: number, rx: number, ry: number) =>
    `M${P(cx, cy - ry)} ${arc(rx, ry, 0, 1, cx, cy + ry)} ${arc(rx, ry, 0, 1, cx, cy - ry)} Z`;
  const bowlBottom = (cy: number, ry: number) => {
    // top of ellipse, clockwise 240deg to lower-left
    const a = (150 * Math.PI) / 180;
    return `${arc(r, ry, 1, 1, r + r * Math.cos(a), cy + ry * Math.sin(a))}`;
  };
  switch (ch) {
    case "0":
      return [
        `M0,${f(r)} ${arc(r, r, 0, 1, w, r)} L${P(w, h - r)} ${arc(r, r, 0, 1, 0, h - r)} Z`,
      ];
    case "1":
      return [
        `M${P(w * 0.08, h * 0.2)} L${P(w * 0.66, 0)}`,
        `M${P(w * 0.66, -o)} L${P(w * 0.66, h + o)}`,
      ];
    case "2":
      return [
        `M0,${f(r)} ${arc(r, r, 0, 1, w, r)} C${P(w, h * 0.52)} ${P(w * 0.05, h * 0.78)} ${P(0, h)} L${P(w + o, h)}`,
      ];
    case "3":
      return [
        `M${P(-o, 0)} L${P(w, 0)} L${P(r, h * 0.4)} ${bowlBottom(h * 0.7, h * 0.3)}`,
      ];
    case "4":
      return [
        `M${P(w * 0.72, h + o)} L${P(w * 0.72, 0)} L${P(-0.02 * w, h * 0.7)} L${P(w + o, h * 0.7)}`,
      ];
    case "5":
      return [
        `M${P(w * 0.96, 0)} L${P(w * 0.06, 0)} L${P(w * 0.02, h * 0.43)} C${P(w * 0.18, h * 0.405)} ${P(w * 0.34, h * 0.4)} ${P(r, h * 0.4)} ${bowlBottom(h * 0.7, h * 0.3)}`,
      ];
    case "6": {
      const cy = h * 0.69,
        ry = h * 0.31;
      return [
        ell(r, cy, r, ry),
        `M${P(w * 0.82, -o)} L${P(w * 0.04, cy - ry * 0.45)}`,
      ];
    }
    case "9": {
      const cy = h * 0.31,
        ry = h * 0.31;
      return [
        ell(r, cy, r, ry),
        `M${P(w * 0.18, h + o)} L${P(w * 0.96, cy + ry * 0.45)}`,
      ];
    }
    case "7": {
      const [x, y] = ext(w, 0, w * 0.3, h);
      return [`M${P(-o, 0)} L${P(w, 0)} L${P(x, y)}`];
    }
    case "8":
      return [
        ell(r, h * 0.22, r * 0.88, h * 0.22),
        ell(r, h * 0.72, r, h * 0.28),
      ];
    case "A": {
      const [lx, ly] = ext(r, 0, 0, h),
        [rx, ry] = ext(r, 0, w, h),
        [tx, ty] = ext(0, h, r, 0);
      return [
        `M${P(lx, ly)} L${P(r, 0)} L${P(rx, ry)}`,
        `M${P(r - (tx - r), ty)} L${P(r, 0)} L${P(tx, ty)}`,
        `M${P(w * 0.16, h * 0.68)} L${P(w * 0.84, h * 0.68)}`,
      ];
    }
    case "B":
      return [
        `M0,${f(h + o)} L0,0 L${P(w * 0.5, 0)} ${arc(w * 0.45, h * 0.23, 0, 1, w * 0.5, h * 0.46)} L0,${f(h * 0.46)}`,
        `M${P(w * 0.5, h * 0.46)} ${arc(r, h * 0.27, 0, 1, w * 0.5, h)} L${P(-o, h)}`,
      ];
    case "C":
      return [
        `M${P(w, r)} ${arc(r, r, 0, 0, 0, r)} L${P(0, h - r)} ${arc(r, r, 0, 0, w, h - r)}`,
      ];
    case "D":
      return [
        `M0,${f(-o)} L0,${f(h)} L${P(w - r, h)} ${arc(r, r, 0, 0, w, h - r)} L${P(w, r)} ${arc(r, r, 0, 0, w - r, 0)} L${P(-o, 0)}`,
      ];
    case "E":
      return [
        `M${P(w, 0)} L0,0 L0,${f(h)} L${P(w, h)}`,
        `M0,${f(h * 0.48)} L${P(w * 0.85, h * 0.48)}`,
      ];
    case "F":
      return [
        `M${P(w, 0)} L0,0 L0,${f(h + o)}`,
        `M0,${f(h * 0.48)} L${P(w * 0.85, h * 0.48)}`,
      ];
    case "G":
      return [
        `M${P(w, r)} ${arc(r, r, 0, 0, 0, r)} L${P(0, h - r)} ${arc(r, r, 0, 0, w, h - r)} L${P(w, h * 0.54)} L${P(w * 0.5, h * 0.54)}`,
      ];
    case "H":
      return [
        `M0,${f(-o)} L0,${f(h + o)}`,
        `M${P(w, -o)} L${P(w, h + o)}`,
        `M0,${f(h * 0.48)} L${P(w, h * 0.48)}`,
      ];
    case "J":
      return [`M${P(w, -o)} L${P(w, h - r)} ${arc(r, r, 0, 1, 0, h - r)}`];
    case "K": {
      const [x, y] = ext(0, h * 0.62, w, 0);
      const [x2, y2] = ext(w * 0.3, h * 0.42, w, h);
      return [
        `M0,${f(-o)} L0,${f(h + o)}`,
        `M${P(0, h * 0.62)} L${P(x, y)}`,
        `M${P(w * 0.3, h * 0.42)} L${P(x2, y2)}`,
      ];
    }
    case "L":
      return [`M0,${f(-o)} L0,${f(h)} L${P(w + o * 0.2, h)}`];
    case "M":
      return [
        `M0,${f(h + o)} L0,0 L${P(r, h * 0.62)} L${P(w, 0)} L${P(w, h + o)}`,
      ];
    case "N":
      return [`M0,${f(h + o)} L0,0 L${P(w, h)} L${P(w, -o)}`];
    case "P":
      return [
        `M0,${f(h + o)} L0,0 L${P(w * 0.48, 0)} ${arc(w * 0.52, h * 0.255, 0, 1, w * 0.48, h * 0.51)} L0,${f(h * 0.51)}`,
      ];
    case "I":
      return [`M0,${f(-o)} L0,${f(h + o)}`];
    default:
      return null;
  }
}

/** One character as an SVG group: outer box (x, top, W, H), stroke s. Null if we have no glyph for it. */
function charGroup(
  id: string,
  ch: string,
  x: number,
  top: number,
  W: number,
  H: number,
  s: number,
  color: string,
): string | null {
  const w = W - s,
    h = H - s,
    o = s * 1.2;
  const strokes = glyph(ch, w, h, o);
  if (!strokes) return null;
  const paths = strokes.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<clipPath id="${id}-clip"><rect x="${f(x)}" y="${f(top)}" width="${f(W + 2)}" height="${f(H)}"/></clipPath>` +
    `<g clip-path="url(#${id}-clip)"><g transform="translate(${f(x + s / 2)} ${f(top + s / 2)})" fill="none" stroke="${color}" stroke-width="${s}" stroke-linejoin="miter" stroke-linecap="butt">${paths}</g></g>`
  );
}

const SHEEN = (pre: string, a: number, b: number) =>
  `<defs><linearGradient id="${pre}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${a}"/>` +
  `<stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${b}"/></linearGradient></defs>`;

/** West Bank private plate, 2018+ format #-####-L (green on white). */
export function palestinePlate(reg: string): string | null {
  const groups = reg.split("-");
  const H = 72,
    top = 19,
    s = 9;
  const ink = "#1F6B45";
  const pre = `ps${++uid}-`;
  // The standard #-####-L uses the asset's exact spacing. Any other number (older or test
  // plates, "7-930-849") is laid out the same way, narrowed to fit before the ف/P panel.
  const standard =
    groups.length === 3 &&
    groups[0].length === 1 &&
    groups[1].length === 4 &&
    groups[2].length === 1;
  const chars = groups.join("").length;
  const natural =
    chars * 38 + (chars - groups.length) * 10 + (groups.length - 1) * 40;
  const k = standard ? 1 : Math.min(1, 354 / natural);
  const cw = 38 * k,
    gap = 10 * k,
    pad = 14 * k;
  let x = standard ? 36 : 36 + (354 - natural * k) / 2,
    n = 0,
    ok = true;
  const put = (str: string) =>
    [...str]
      .map((ch, i, arr) => {
        const g = charGroup(
          `${pre}c${++n}`,
          ch,
          x,
          top,
          cw,
          H,
          s * Math.max(k, 0.8),
          ink,
        );
        if (!g) ok = false;
        x += cw + (i < arr.length - 1 ? gap : 0);
        return g ?? "";
      })
      .join("");
  const midY = top + H / 2 - s / 2 + 1;
  let body = "";
  const seps: string[] = [];
  groups.forEach((grp, gi) => {
    body += put(grp);
    if (gi === groups.length - 1) return;
    // The asset: a short bar after the first group, a long one before the governorate letter.
    const long = standard && gi === 1;
    const w = (long ? 22 : 12) * k;
    x += long ? 18 : pad;
    seps.push(
      `<rect x="${f(x)}" y="${f(midY)}" width="${f(w)}" height="${s}"/>`,
    );
    x += w + (long ? 16 : pad);
  });
  if (!ok) return null;
  const ruleX = standard ? x + 20 : 410,
    cx = (ruleX + 3 + 508) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 110">${SHEEN(pre, 0.22, 0.05)}` +
    `<rect x="0" y="0" width="520" height="110" rx="6" fill="#FBFBF8"/>` +
    `<rect x=".4" y=".4" width="519.2" height="109.2" rx="5.6" fill="none" stroke="#D9D9D2" stroke-width=".8"/>` +
    `<rect x="4.75" y="4.75" width="510.5" height="100.5" rx="7" fill="none" stroke="${ink}" stroke-width="3.5"/>` +
    body +
    `<g fill="${ink}">${seps.join("")}</g>` +
    `<g fill="${ink}"><rect x="${f(ruleX)}" y="${top + 3}" width="3" height="${H - 6}"/>` +
    `<path transform="translate(${f(cx)} 47) scale(1.12)" d="${TEXT.fa.d}"/>` +
    `<rect x="${f(cx - 17)}" y="52.5" width="34" height="2.6"/></g>` +
    (charGroup(`${pre}p`, "P", cx - 11, 60, 22, 32, 5.4, ink) ?? "") +
    `<rect x="0" y="0" width="520" height="110" rx="6" fill="url(#${pre}sheen)"/></svg>`
  );
}

/** Israeli private plate (black on yellow, blue band): 8 digits ###-##-### or 7 digits ##-###-##. */
export function israelPlate(reg: string): string | null {
  const groups = reg.split("-");
  const count = groups.join("").length;
  const H = 80,
    top = 15,
    s = 9.5,
    cw = 37,
    gap = 7.5,
    sepW = 24;
  const ink = "#141414",
    band = "#1E4C9A";
  const total =
    count * cw + (count - groups.length) * gap + (groups.length - 1) * sepW;
  const pre = `il${++uid}-`;
  let x = 56 + (452 - total) / 2,
    n = 0,
    ok = true;
  const out: string[] = [];
  const seps: string[] = [];
  groups.forEach((grp, gi) => {
    [...grp].forEach((ch, i) => {
      const g = charGroup(`${pre}c${++n}`, ch, x, top, cw, H, s, ink);
      if (!g) ok = false;
      out.push(g ?? "");
      x += cw + (i < grp.length - 1 ? gap : 0);
    });
    if (gi < groups.length - 1) {
      seps.push(
        `<rect x="${f(x + sepW / 2 - 3.75)}" y="${f(top + H / 2 - 3.75)}" width="7.5" height="7.5" rx="1"/>`,
      );
      x += sepW;
    }
  });
  if (!ok) return null;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 110">${SHEEN(pre, 0.2, 0.06)}` +
    `<rect x="0" y="0" width="520" height="110" rx="6" fill="#F7C21B"/>` +
    `<rect x=".4" y=".4" width="519.2" height="109.2" rx="5.6" fill="none" stroke="#D8A20A" stroke-width=".8"/>` +
    `<clipPath id="${pre}band-clip"><rect x="6.5" y="6.5" width="507" height="97" rx="5.25"/></clipPath>` +
    `<rect x="6.5" y="6.5" width="44" height="97" fill="${band}" clip-path="url(#${pre}band-clip)"/>` +
    `<g transform="translate(12.5 12)"><rect width="32" height="23" rx=".6" fill="#fff"/>` +
    `<rect y="2.2" width="32" height="3.6" fill="${band}"/><rect y="17.2" width="32" height="3.6" fill="${band}"/>` +
    `<g transform="translate(16 11.5)" fill="none" stroke="${band}" stroke-width=".85"><path d="M0,-4.6 L3.98,2.3 L-3.98,2.3 Z"/><path d="M0,4.6 L3.98,-2.3 L-3.98,-2.3 Z"/></g></g>` +
    (charGroup(`${pre}bi`, "I", 16.5, 40, 6.2, 30, 6.2, "#fff") ?? "") +
    (charGroup(`${pre}bl`, "L", 27.5, 40, 15, 30, 6.2, "#fff") ?? "") +
    `<path fill="#fff" d="${TEXT.he.d}"/><path fill="#fff" d="${TEXT.ar.d}"/>` +
    `<rect x="4.75" y="4.75" width="510.5" height="100.5" rx="7" fill="none" stroke="${ink}" stroke-width="3.5"/>` +
    out.join("") +
    `<g fill="${ink}">${seps.join("")}</g>` +
    `<rect x="0" y="0" width="520" height="110" rx="6" fill="url(#${pre}sheen)"/></svg>`
  );
}

export type PlateKind = "ps" | "il";

/** Which real plate a stored registration looks like (see normalizePlate in plate.ts). */
export function plateKind(reg: string): PlateKind | null {
  if (/^[0-9]-[0-9]{4}-[A-Z]$/.test(reg)) return "ps";
  if (
    /^[0-9]{3}-[0-9]{2}-[0-9]{3}$/.test(reg) ||
    /^[0-9]{2}-[0-9]{3}-[0-9]{2}$/.test(reg)
  )
    return "il";
  return null;
}

/** The whole plate as SVG markup, or null if we can't draw this registration. */
export function plateSvg(reg: string): string | null {
  const kind = plateKind(reg);
  if (kind === "ps") return palestinePlate(reg);
  if (kind === "il") return israelPlate(reg);
  // Anything else still gets the real plate (the West Bank one), not a plain text box.
  return palestinePlate(reg);
}
