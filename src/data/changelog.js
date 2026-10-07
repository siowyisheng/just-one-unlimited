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
export const currentVersion = '0.2.0';

/**
 * Newest first. The UI lists every entry here.
 * Keep bullets brief — one idea each.
 */
export const releases = [
  {
    version: '0.2.0',
    date: '2026-10-08',
    changes: [
      'Feature: Players can now see all hidden clues at round end.',
      'Feature: Players can now bonk slow clue givers.',
      'Feature: Clue givers can now take back clues.',
      'Feature: Guessers can now give up.',
      'Feature: Guessers now have a 30 second time limit.',
      'Feature: Clue givers can now skip keywords, intended for duplicate misspellings of played keywords or keywords that they just don\'t want to play.',
      'Feature: Players can now add random stock keywords to the pool. Feedback if they are too hard.',
      'Feature: You can now see player stats for their successful clues given and correct guesses.',
      'Feature: Feedback form added for bug reports, feature requests, and general feedback.',
      'Feature: Guessers can no longer mark their own guesses as Close Enough.',
      'Bugfix: Fixed a bug where multiple players clicking Next Keyword would add the keyword to the Past Keywords multiple times.',
      'Bugfix: Fixed a bug where the player order was not consistent with the guesser turn order.',
      'UI: Players can see which clue givers haven\'t submitted yet.',
      'UI: Overhauled and unified UI for consistency and clarity.',
      'UI: Added some text to discourage clue givers from giving extra info during guessing.',
      'UI: Disabled Ready button when checking clues for the first 3 seconds.',
      'UI: Rules for valid and invalid clues are now displayed during clue giving and checking.',
      'UI: Added animations.',
      'UI: Added a changelog.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-06',
    changes: [
      'Initial release.',
    ],
  },
];
