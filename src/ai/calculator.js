// Kalkulator buat AI. AI sering salah hitung (dia baca angka per potongan, bukan per digit),
// jadi hitungannya diserahin ke sini. Sengaja nggak pakai eval() biar nggak bisa dipakai jalanin kode.

const DEG = Math.PI / 180;
const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  // Trigonometri pakai derajat, karena soal sekolah biasanya pakai derajat
  sin: (x) => Math.sin(x * DEG),
  cos: (x) => Math.cos(x * DEG),
  tan: (x) => Math.tan(x * DEG),
  asin: (x) => Math.asin(x) / DEG,
  acos: (x) => Math.acos(x) / DEG,
  atan: (x) => Math.atan(x) / DEG,
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

function factorial(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error("faktorial cuma buat bilangan bulat >= 0");
  if (n > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function tokenize(text) {
  const tokens = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)|([a-z_][a-z0-9_]*)|(\*\*|[-+*/^%()!,]))/giy;
  let match;
  while (pattern.lastIndex < text.length) {
    const start = pattern.lastIndex;
    match = pattern.exec(text);
    if (!match) {
      if (/^\s*$/.test(text.slice(start))) break;
      throw new Error(`karakter nggak dikenal: "${text.slice(start).trim()[0]}"`);
    }
    if (match[1] !== undefined) tokens.push({ type: "num", value: parseFloat(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: "name", value: match[2].toLowerCase() });
    else tokens.push({ type: "op", value: match[3] === "**" ? "^" : match[3] });
  }
  return tokens;
}

/** Hitung ekspresi matematika, contoh: "(12.5 * 3)^2 / sqrt(16) + 10!" */
export function calculate(expression) {
  // Biar "1.000.000" atau "2,5" (gaya Indonesia) nggak salah baca, AI disuruh pakai format biasa.
  // Di sini cuma rapikan simbol yang sering muncul.
  const text = String(expression)
    .replace(/[×x](?=\s*[\d(])/g, "*")
    .replace(/÷/g, "/")
    .replace(/√\s*(\d+(?:\.\d+)?)/g, "sqrt($1)") // √16 -> sqrt(16)
    .replace(/√/g, "sqrt"); // √(16) -> sqrt(16)
  const tokens = tokenize(text);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value) => peek()?.type === "op" && peek().value === value;
  const expect = (value) => {
    if (!isOp(value)) throw new Error(`kurang "${value}"`);
    pos++;
  };

  // Urutan: + -  →  * / %  →  minus di depan  →  pangkat (dari kanan)  →  faktorial  →  angka/kurung/fungsi
  function addSub() {
    let left = mulDiv();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const right = mulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function mulDiv() {
    let left = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[pos++].value;
      const right = unary();
      if (op === "*") left *= right;
      else if (op === "/") left /= right;
      else left %= right;
    }
    return left;
  }
  function unary() {
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }
  function power() {
    const base = postfix();
    if (isOp("^")) {
      pos++;
      return base ** unary(); // 2^-1 boleh, 2^3^2 = 2^9
    }
    return base;
  }
  function postfix() {
    let value = primary();
    while (isOp("!")) {
      pos++;
      value = factorial(value);
    }
    return value;
  }
  function primary() {
    const token = tokens[pos++];
    if (!token) throw new Error("rumusnya kepotong");
    if (token.type === "num") return token.value;
    if (token.type === "op" && token.value === "(") {
      const value = addSub();
      expect(")");
      return value;
    }
    if (token.type === "name") {
      if (token.value in CONSTANTS) return CONSTANTS[token.value];
      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`fungsi "${token.value}" nggak ada`);
      expect("(");
      const arg = addSub();
      expect(")");
      return fn(arg);
    }
    throw new Error(`"${token.value}" nggak di tempat yang benar`);
  }

  if (!tokens.length) throw new Error("rumusnya kosong");
  const result = addSub();
  if (pos < tokens.length) throw new Error(`ada sisa yang nggak kebaca: "${tokens[pos].value}"`);
  if (Number.isNaN(result)) throw new Error("hasilnya bukan angka (misalnya akar bilangan negatif)");
  if (!Number.isFinite(result)) return result > 0 ? "tak hingga" : "minus tak hingga";
  // Buang sisa pembulatan komputer, misalnya 0.1+0.2 = 0.30000000000000004 -> 0.3
  const rounded = String(Number(result.toPrecision(15)));
  // Di atas ~9 kuadriliun, komputer nggak bisa nyimpen angka bulat persis, digit belakangnya bisa meleset
  return Math.abs(result) > Number.MAX_SAFE_INTEGER ? `${rounded} (perkiraan, digit belakangnya bisa meleset)` : rounded;
}

/** Definisi alat kalkulator buat dikirim ke AI (format function calling). */
export const CALCULATOR_TOOL = {
  type: "function",
  function: {
    name: "hitung",
    description:
      "Kalkulator yang hasilnya pasti benar. WAJIB dipakai untuk semua hitungan angka (selain yang super gampang kayak 2+2), " +
      "jangan menghitung di kepala. Bisa dipanggil beberapa kali untuk soal yang bertahap.",
    parameters: {
      type: "object",
      properties: {
        ekspresi: {
          type: "string",
          description:
            "Rumus matematika. Pakai titik untuk desimal dan tanpa pemisah ribuan (contoh: 1500000*0.075, bukan 1.500.000*0,075). " +
            "Operator: + - * / % (sisa bagi) ^ (pangkat) ! (faktorial), dan kurung. " +
            "Fungsi: sqrt, cbrt, abs, round, floor, ceil, ln, log (basis 10), log2, exp, sin, cos, tan, asin, acos, atan (semua dalam derajat). " +
            "Konstanta: pi, e.",
        },
      },
      required: ["ekspresi"],
    },
  },
};
