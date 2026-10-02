import type { Ecosystem } from "./model.js";

/**
 * Names of very widely used packages, used only to flag look-alike names.
 * This is a heuristic aid, not a registry mirror: extend it freely via PRs.
 */
const NPM = `react react-dom lodash express axios chalk commander debug moment typescript webpack
babel-core eslint prettier jest mocha chai vue angular jquery underscore async request bluebird
uuid dotenv cors body-parser mongoose mongodb mysql redis socket.io next nuxt svelte rollup vite
esbuild yargs inquirer minimist glob rimraf mkdirp semver tslib zod classnames dayjs date-fns
rxjs ramda immutable redux react-redux react-router passport jsonwebtoken bcrypt bcryptjs
cheerio puppeteer playwright cypress nodemon cross-env colors left-pad is-odd is-even node-fetch
isomorphic-fetch form-data ws fs-extra graceful-fs readable-stream string-width strip-ansi
ansi-styles supports-color wrap-ansi ora execa which cross-spawn shelljs lodash-es core-js
regenerator-runtime tailwindcss postcss autoprefixer sass less stylelint husky lint-staged
nodemailer multer helmet morgan compression cookie-parser express-session sequelize typeorm
prisma knex pg sqlite3 handlebars ejs pug marked highlight.js http-proxy-middleware formidable
tar archiver adm-zip jszip sharp jimp qs query-string url-parse querystring escape-html
event-emitter eventemitter3 lru-cache p-limit p-queue pino winston bunyan log4js npm-run-all
concurrently source-map-support ts-node tsx vitest supertest sinon nock faker chokidar
fast-glob picomatch micromatch braces minimatch anymatch dotenv-expand openai anthropic
langchain electron socket.io-client`.split(/\s+/);

const PYTHON = `requests numpy pandas scipy matplotlib flask django fastapi pydantic sqlalchemy
pytest setuptools wheel pip urllib3 certifi idna charset-normalizer six python-dateutil pytz
pyyaml jinja2 markupsafe click attrs packaging typing-extensions boto3 botocore s3transfer
cryptography cffi pycparser pillow tensorflow torch scikit-learn seaborn beautifulsoup4 lxml
selenium aiohttp httpx uvicorn gunicorn celery redis psycopg2 pymongo tqdm rich colorama
openai anthropic transformers langchain black flake8 mypy pylint isort tox coverage
python-dotenv werkzeug itsdangerous starlette websockets paramiko pyopenssl asyncio
jsonschema protobuf grpcio google-api-core google-auth pyasn1 rsa cachetools decorator
docutils sphinx pygments toml tomli filelock virtualenv platformdirs regex joblib
numba sympy networkx opencv-python keras h5py pyarrow dask ray fsspec`.split(/\s+/);

const CARGO = `serde serde_json tokio rand clap regex syn quote proc-macro2 anyhow thiserror log
env_logger reqwest hyper futures chrono lazy_static once_cell itertools bytes libc cfg-if
async-trait tracing tracing-subscriber uuid url base64 bitflags memchr smallvec parking_lot
crossbeam rayon num-traits indexmap hashbrown unicode-ident tempfile walkdir toml serde_yaml
actix-web axum tower tonic prost sqlx diesel openssl rustls ring sha2 hex time dashmap`.split(
  /\s+/,
);

export const POPULAR: Record<Ecosystem, ReadonlySet<string>> = {
  npm: new Set(NPM),
  python: new Set(PYTHON),
  cargo: new Set(CARGO),
  go: new Set(),
};

export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      row[j] = Math.min(
        (prev[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}

/** The popular package this name most plausibly imitates, if any. */
export function lookAlikeOf(name: string, eco: Ecosystem): string | undefined {
  const popular = POPULAR[eco];
  if (popular.size === 0 || popular.has(name) || name.startsWith("@")) return undefined;
  const flat = (s: string) => s.replace(/[-_.]/g, "");
  for (const p of popular) {
    if (p.length < 5) continue;
    if (flat(p) === flat(name)) return p;
    if (Math.abs(p.length - name.length) <= 1 && damerauLevenshtein(name, p) === 1) return p;
  }
  return undefined;
}
