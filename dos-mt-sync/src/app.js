import { _electron as electron } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { log } from './log.js';

const MT_PATH = process.env.MT_APP_PATH
  || '/Applications/Master Tour.app/Contents/MacOS/Master Tour';

const MT_USER_DATA_DIR = process.env.MT_USER_DATA_DIR
  || join(homedir(), '.dos-mt-sync', 'mt-profile');

const READY_TIMEOUT_MS = 5 * 60_000;

let _app = null;
let _page = null;

export async function launchMT() {
  const firstRun = !existsSync(MT_USER_DATA_DIR);
  mkdirSync(MT_USER_DATA_DIR, { recursive: true });

  log.info(`Launching Master Tour: ${MT_PATH}`);
  log.info(`Profile: ${MT_USER_DATA_DIR}`);
  _app = await electron.launch({
    executablePath: MT_PATH,
    args: [`--user-data-dir=${MT_USER_DATA_DIR}`],
  });
  _page = await _app.firstWindow();
  await _page.waitForLoadState('domcontentloaded');

  if (firstRun) {
    log.warn('First run with this profile — log in to Master Tour in the window that just opened. Waiting up to 5 min for the app to reach the Events screen.');
  }
  await _page.waitForSelector('text=Events', { timeout: READY_TIMEOUT_MS });
  log.ok('Master Tour ready');
  return _page;
}

export async function closeMT() {
  if (_app) await _app.close();
}

export function getPage() {
  if (!_page) throw new Error('MT not launched — call launchMT() first');
  return _page;
}
