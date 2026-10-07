/** Collapsed clue-rules helper for clue givers during Give a Clue. */
const clueEx = 'font-extrabold text-sky-400';
const keywordEx = 'font-extrabold text-amber-500';

function ClueWord({ children }) {
  return <span className={clueEx}>{children}</span>;
}

function KeywordWord({ children }) {
  return <span className={keywordEx}>{children}</span>;
}

const VALID_CLUES = [
  <>
    Proper nouns (eg. <ClueWord>SHERLOCK</ClueWord>, <ClueWord>LEGO</ClueWord>)
  </>,
  <>
    Compound words (eg. <ClueWord>MERRY-GO-ROUND</ClueWord>)
  </>,
  <>
    Numbers only (eg. <ClueWord>007</ClueWord>)
  </>,
  <>
    Onomatopoeia (eg. <ClueWord>RIIING</ClueWord>)
  </>,
  <>
    Acronyms (eg. <ClueWord>FBI</ClueWord>)
  </>,
  <>
    A single special character (eg. <ClueWord>$</ClueWord>)
  </>,
];

const INVALID_CLUES = [
  <>
    Multiple words typed without spaces (eg. <ClueWord>BABYSHEEP</ClueWord>)
  </>,
  <>
    A different form of the keyword (eg. <ClueWord>FREEZE</ClueWord> to guess{' '}
    <KeywordWord>FROZEN</KeywordWord>)
  </>,
  <>
    A word containing the keyword (eg. <ClueWord>HONEYCOMB</ClueWord> to guess{' '}
    <KeywordWord>HONEY</KeywordWord>)
  </>,
  <>
    A word which is part of the keyword (eg. <ClueWord>HONEY</ClueWord> to guess{' '}
    <KeywordWord>HONEYCOMB</KeywordWord>)
  </>,
  <>
    The keyword in a different language (eg. <ClueWord>VERT</ClueWord> to guess{' '}
    <KeywordWord>GREEN</KeywordWord>)
  </>,
  <>
    A made-up word (eg. <ClueWord>CUPPAJO</ClueWord>)
  </>,
  <>
    Homophones or near-homophones (<ClueWord>WHETHER</ClueWord> to guess{' '}
    <KeywordWord>WEATHER</KeywordWord>, <ClueWord>CLASH</ClueWord> to guess{' '}
    <KeywordWord>FLASH</KeywordWord>)
  </>,
];

export default function ClueRulesExpander() {
  return (
    <details className="group w-full text-left">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm text-slate-400 select-none [&::-webkit-details-marker]:hidden">
        <span>Clue rules</span>
        <svg
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="mt-3 space-y-4 px-1 text-sm leading-relaxed text-slate-400">
        <section>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Valid clues
          </h4>
          <ol className="list-decimal space-y-1 pl-5">
            {VALID_CLUES.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Invalid clues
          </h4>
          <ol className="list-decimal space-y-1 pl-5">
            {INVALID_CLUES.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </section>
      </div>
    </details>
  );
}
