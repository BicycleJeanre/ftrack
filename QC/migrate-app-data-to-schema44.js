#!/usr/bin/env node

/**
 * Standalone migration utility for converting FTrack exports to schemaVersion 44.
 * All migration semantics live in js/shared/migration-utils.js so runtime,
 * imports, tests, and this CLI use exactly the same implementation.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = { input: null, output: null, report: null };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--input' || args[index] === '-i') {
      parsed.input = value;
      index += 1;
    } else if (args[index] === '--output' || args[index] === '-o') {
      parsed.output = value;
      index += 1;
    } else if (args[index] === '--report' || args[index] === '-r') {
      parsed.report = value;
      index += 1;
    }
  }
  return parsed;
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function loadMigrator() {
  const absolutePath = path.resolve(process.cwd(), 'js/shared/migration-utils.js');
  return import(pathToFileURL(absolutePath).href);
}

async function main(argv = process.argv) {
  const { input, output, report } = parseArgs(argv);
  if (!input) {
    console.error(
      'Usage: node QC/migrate-app-data-to-schema44.js ' +
      '--input <legacy.json> [--output <schema44.json>] [--report <migration-report.json>]'
    );
    process.exitCode = 2;
    return null;
  }

  const inputPath = path.resolve(process.cwd(), input);
  const legacy = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { migrateAppData } = await loadMigrator();
  const migrated = migrateAppData(legacy);
  const json = `${JSON.stringify(migrated, null, 2)}\n`;

  if (output) {
    const outputPath = path.resolve(process.cwd(), output);
    ensureDirectory(outputPath);
    fs.writeFileSync(outputPath, json, 'utf8');
    console.log(
      `Wrote schemaVersion ${migrated.schemaVersion} data to ${path.relative(process.cwd(), outputPath)}`
    );
  } else {
    process.stdout.write(json);
  }

  if (report) {
    const reportPath = path.resolve(process.cwd(), report);
    ensureDirectory(reportPath);
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(migrated.migrationReport || null, null, 2)}\n`,
      'utf8'
    );
    console.error(`Wrote migration report to ${path.relative(process.cwd(), reportPath)}`);
  }
  return migrated;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[QC][Migrate] Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  parseArgs
};
