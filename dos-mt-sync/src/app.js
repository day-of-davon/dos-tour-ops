import { _electron as electron } from 'playwright';
import { log } from './log.js';

const MT_PATH = process.env.MT_APP_PATH
  || '/Applications/Master Tour.app/Contents/MacOS/Master Tour';

const READY_TIMEOUT_MS = 30_000;

let _app = null;
let _page = null;

export async function launchMT() {
  log.info(`Launching Master Tour: ${MT_PATH}`);
  // Launch without --user-data-dir so MT uses its default (already logged-in) session.
  _app = await electron.launch({ executablePath: MT_PATH });
  _page = await _app.firstWindow();
  await _page.waitForLoadState('domcontentloaded');

  // Nav labels are i18n keys ("Event_plural", not "Events").
  // "Dashboard" is the first sidebar item after login — wait up to 30s.
  await _page.waitForSelector('text=Dashboard', { timeout: READY_TIMEOUT_MS });
  log.ok('Master Tour ready');
  return _page;
}

export async function closeMT() {
  if (_app) {
    try { await _app.close(); } catch {}
    _app = null;
    _page = null;
  }
}

export function getPage() {
  if (!_page) throw new Error('MT not launched — call launchMT() first');
  return _page;
}
