#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { writeFileSync } from 'node:fs';
import { syncShows } from './src/sync/shows.js';
import { syncFlights } from './src/sync/flights.js';
import { launchMT, closeMT } from './src/app.js';
import { getShows, getFlights } from './src/dos.js';
import { buildMTExport } from './src/export.js';
import { log } from './src/log.js';

program
  .name('dos-mt')
  .description('Sync DOS Tour Ops → Master Tour')
  .version('1.0.0');

program
  .command('export [output]')
  .description('Export DOS data as MT-native JSON (default: mt-export.json)')
  .action(async (output = 'mt-export.json') => {
    try {
      const [showsRaw, flightsRaw] = await Promise.all([getShows(), getFlights()]);
      const payload = buildMTExport(showsRaw, flightsRaw);
      writeFileSync(output, JSON.stringify(payload, null, 2));
      log.ok(`Exported ${payload.counts.events} events · ${payload.counts.air} air · ${payload.counts.ground} ground → ${output}`);
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List DOS shows and flights without touching Master Tour')
  .action(async () => {
    try {
      const [showsRaw, flightsRaw] = await Promise.all([getShows(), getFlights()]);
      const shows = (Array.isArray(showsRaw) ? showsRaw : Object.values(showsRaw))
        .filter(s => s?.date && s?.venue)
        .sort((a, b) => a.date.localeCompare(b.date));
      const flights = Object.values(flightsRaw ?? {}).sort((a, b) =>
        (a.depDate ?? '').localeCompare(b.depDate ?? ''));

      log.section(`DOS Shows (${shows.length})`);
      for (const s of shows) {
        const cx = (s.advance || []).map(c => c.name).join(', ') || '—';
        console.log(`  ${s.date}  ${(s.city || '').padEnd(14)} ${s.venue}`);
        console.log(`             promoter: ${s.promoter || '—'}`);
        console.log(`             contacts: ${cx}`);
      }

      log.section(`DOS Flights (${flights.length})`);
      for (const f of flights) {
        const pax = (f.pax || []).join(', ') || '—';
        console.log(`  ${f.depDate ?? '?'}  ${(f.carrier ?? '').padEnd(8)} ${f.flightNo ?? '?'}  ${f.from ?? '?'}→${f.to ?? '?'}  pax: ${pax}`);
      }
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }
  });

program
  .command('sync <target>')
  .description('Sync target: all | shows | flights | <YYYY-MM-DD>')
  .option('--dry-run', 'Print actions without writing to Master Tour')
  .action(async (target, opts) => {
    const dryRun = opts.dryRun ?? false;
    if (dryRun) log.warn('DRY RUN — no changes will be written');

    let page;
    try {
      if (!dryRun) page = await launchMT();

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
