#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { syncShows } from './src/sync/shows.js';
import { syncFlights } from './src/sync/flights.js';
import { launchMT, closeMT } from './src/app.js';
import { log } from './src/log.js';

program
  .name('dos-mt')
  .description('Sync DOS Tour Ops → Master Tour')
  .version('1.0.0');

program
  .command('sync <target>')
  .description('Sync target: all | shows | flights | <YYYY-MM-DD>')
  .option('--dry-run', 'Print actions without writing to Master Tour')
  .action(async (target, opts) => {
    const dryRun = opts.dryRun ?? false;
    if (dryRun) log.warn('DRY RUN — no changes will be written');

    let page;
    try {
      page = await launchMT();

      if (target === 'all' || target === 'shows') {
        log.section('Shows');
        await syncShows(page, { dryRun });
      }

      if (target === 'all' || target === 'flights') {
        log.section('Flights');
        await syncFlights(page, { dryRun });
      }

      // Date-specific sync: shows + flights for that date
      if (target !== 'all' && target !== 'shows' && target !== 'flights') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
          log.error(`Unknown target "${target}". Use: all | shows | flights | YYYY-MM-DD`);
          process.exit(1);
        }
        log.section(`Date: ${target}`);
        await syncShows(page, { dryRun, date: target });
        await syncFlights(page, { dryRun, date: target });
      }

      log.ok('Sync complete');
    } catch (err) {
      log.error(err.message);
      process.exitCode = 1;
    } finally {
      await closeMT();
    }
  });

program.parse();
