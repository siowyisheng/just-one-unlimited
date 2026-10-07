/**
 * Release changelog — edit this file by hand to ship version notes.
 *
 * HOW TO ADD A RELEASE
 * 1. Bump `currentVersion` to the new version string (shown bottom-right in the app).
 * 2. Prepend a new object to `releases` (newest first) with:
 *    - version: semver-ish string, e.g. "0.2.0" (UI prefixes with "v")
 *    - date: ISO date "YYYY-MM-DD"
 *    - changes: short bullet strings players will see
 *
 * Example entry (copy/paste, then edit):
 * {
 *   version: '0.2.0',
 *   date: '2026-10-20',
 *   changes: [
 *     'Short plain-language bullet.',
 *     'Another change players should know about.',
 *   ],
 * },
 */

/** Displayed as `v{currentVersion}` in the bottom-right corner. */
export const currentVersion = '0.1.0';

/**
 * Newest first. The UI lists every entry here.
 * Keep bullets brief — one idea each.
 */
export const releases = [
  {
    version: '0.1.0',
    date: '2026-10-07',
    changes: [
      'Changelog starts here — edit this file to announce future releases.',
    ],
  },
];
