# Import And Export

## 1.0 Purpose

1.1 Explain how to export your FTrack data to a JSON file and import it again.

## 2.0 Where Your Data Lives

2.1 FTrack stores app data in browser storage.

2.2 Export is the primary way to create a portable backup.

## 3.0 Export Data

3.1 Use the navbar button Export Data.

3.2 Or use the shortcut.

3.2.1 Mac Cmd+E.

3.2.2 Windows Ctrl+E.

3.3 Your browser downloads a JSON file named like.

3.3.1 ftrack-backup-YYYY-MM-DD.json.

## 4.0 Import Or Upgrade Data

4.1 Use the navbar button Import Data.

4.2 Or use the shortcut.

4.2.1 Mac Cmd+I.

4.2.2 Windows Ctrl+I.

4.3 Select a JSON export file. The in-app Data Upgrade Review checks a copy of
the file before changing your browser data.

4.4 Review the result.

4.4.1 The review shows the source and schema-version change.

4.4.2 Validation must pass before import is enabled.

4.4.3 What Changed groups every added, changed, or removed field and explains
why it changed.

4.4.4 Historical Migration Notes identifies records retained by earlier
migrations. These notes are an audit trail, not current validation failures.

4.4.5 Download Change Report saves the complete machine-readable audit.

4.4.6 Download Upgraded JSON saves the prepared current-schema data without
importing it.

4.5 Select Import Upgraded Data or Import Validated Data only after reviewing
the result.

4.5.1 Import replaces your current data.

4.5.2 The app reloads after a successful import.

## 5.0 Check Current Browser Data

5.1 Select Data Check in the navbar.

5.2 Select Current Browser Data.

5.3 FTrack analyzes the raw JSON in browser storage without replacing it.

5.4 If an older schema is found during startup, FTrack opens the same review
before loading the data.

5.5 The original browser data remains unchanged until you select Apply Upgrade
to Browser Data.

5.6 If validation finds legacy values that can be normalized without losing
information, select Preview Safe Repairs.

5.6.1 The preview lists every proposed change in What Changed and validates the
repaired copy before enabling Apply Safe Repairs to Browser Data.

5.6.2 Safe repairs cover unambiguous data-type normalization, such as numeric
IDs or amounts stored as numeric strings. They do not guess missing values,
rewrite ambiguous records, or alter retained recovery records.

5.6.3 Historical notes are limited to 100 visible entries for readability. The
downloadable change report retains the complete audit.

5.7 If validation passes but historical migration notes remain, select Resolve
Historical Notes.

5.7.1 These notes describe recovery actions that were already applied, such as
preserving an occurrence as manual when its recurring identity was ambiguous.

5.7.2 Previewing the resolution removes only the stored migration audit. It does
not remove accounts, rules, occurrences, actuals, baselines, or projections.

5.7.3 Download the change report before applying if you want to retain a
permanent copy of every raw recovery record. The preview report also embeds the
complete archived migration report.

## 6.0 Clear Data

6.1 Use the navbar button Clear Data.

6.2 Confirm the warning.

6.3 The app reloads after clearing.

6.4 Export first if you want a backup.

## 7.0 Troubleshooting

7.1 Import is disabled.

7.1.1 Review the Validation section for malformed JSON, missing collections,
invalid references, or other current-schema violations.

7.1.2 Current exports use schemaVersion 44.

7.1.3 Older exports are upgraded in memory. Review What Changed, Warnings and
Recovery, and the downloadable change report before applying the result.

7.1.4 Future schema versions are not downgraded.

7.1.5 If Preview Safe Repairs is available, use it to prepare a valid copy and
review each change. Any issues still shown afterward require correction in the
source data because FTrack cannot resolve them without making assumptions.

7.2 You hit storage limits.

7.2.1 Export your data.

7.2.2 Clear old scenarios.
