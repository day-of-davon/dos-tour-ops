const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const fmt = (color, prefix, msg) =>
  console.log(`${C[color]}${prefix}${C.reset} ${msg}`);

export const log = {
  info:  (msg) => fmt('cyan',   'INFO ', msg),
  ok:    (msg) => fmt('green',  'OK   ', msg),
  warn:  (msg) => fmt('yellow', 'WARN ', msg),
  error: (msg) => fmt('red',    'ERR  ', msg),
  skip:  (msg) => fmt('gray',   'SKIP ', msg),
  dry:   (msg) => fmt('yellow', 'DRY  ', msg),
  section: (msg) => console.log(`\n${C.bold}${C.cyan}── ${msg} ──${C.reset}`),
};
