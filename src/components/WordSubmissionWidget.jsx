import React from 'react';

export default function WordSubmissionWidget({
    newWord,
    setNewWord,
    onAddWord,
    onAddRandomWord,
    onRemoveWord,
    wordList,
    getPlayerName,
    currentUserId,
    keywordError = "",
    placeholder = "Enter a noun or name",
}) {
    return (
        <div className="flex flex-col gap-4">
            {/* Add Word Form */}
            <div className="flex flex-col gap-2">
                <form onSubmit={onAddWord} className="flex justify-center items-stretch gap-2 flex-wrap">
                    <div className="flex min-w-0">
                        <input
                            type="text"
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value.replace(/\s+/g, '').toUpperCase())}
                            placeholder={placeholder}
                            aria-invalid={keywordError ? "true" : "false"}
                            aria-describedby={keywordError ? "add-keyword-error" : undefined}
                            className={`w-64 max-w-[60vw] text-center h-[58px] box-border bg-slate-800 border border-r-0 rounded-l-xl rounded-r-none px-4 text-2xl font-extrabold leading-[56px] text-amber-500 placeholder-shown:text-base placeholder-shown:font-normal placeholder:text-slate-500 focus:outline-none transition-colors ${keywordError ? "border-rose-500 focus:border-rose-400" : "border-slate-700 focus:border-amber-400"}`}
                        />
                        <button
                            type="submit"
                            className="px-5 py-3 h-[58px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-r-xl rounded-l-none transition-all cursor-pointer shadow-md active:scale-95 whitespace-nowrap"
                        >
                            ADD
                        </button>
                    </div>
                    {onAddRandomWord ? (
                        <button
                            type="button"
                            onClick={onAddRandomWord}
                            className="px-4 py-3 h-[58px] text-sm font-semibold text-slate-300 hover:text-slate-100 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-xl transition-colors cursor-pointer active:scale-95 whitespace-nowrap"
                        >
                            ADD RANDOM
                        </button>
                    ) : null}
                </form>
                {keywordError ? (
                    <p id="add-keyword-error" role="alert" className="text-center text-sm font-medium text-rose-400">
                        {keywordError}
                    </p>
                ) : null}
            </div>

            {/* Shared Word List Display */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-h-[160px]">
                <h3 className="text-sm font-semibold mb-3 text-slate-300">
                    Keywords ({wordList.length})
                </h3>

                {wordList.length === 0 ? (
                    <p className="text-slate-500 text-center py-8 text-sm italic">
                        Add a keyword above!
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {wordList.map((item, idx) => {
                            const authorId = typeof item === 'object' ? item.authorId : null;
                            const staticAuthorName = typeof item === 'object' ? item.authorName : null;
                            const author = authorId ? getPlayerName(authorId, staticAuthorName) : staticAuthorName;
                            const wordText = typeof item === 'object' ? item.text : item;
                            const isMasked = typeof item === 'object' && item !== null && Boolean(item.masked);
                            const isMine = Boolean(currentUserId) && authorId === currentUserId;
                            // Stock/random entries stay hidden as "?" for everyone until drawn.
                            // Any player can remove them (same rose-hover chip UX as own keywords).
                            const canRemove = isMasked || isMine;
                            const displayLabel = isMasked ? '?' : wordText;

                            const authorLabel = !isMasked && author ? (
                                <span className="text-[10px] text-slate-400 italic tracking-normal">
                                    ({author})
                                </span>
                            ) : null;

                            if (canRemove) {
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => onRemoveWord(idx)}
                                        aria-label={isMasked ? 'Remove hidden keyword' : `Remove ${wordText}`}
                                        title="Remove this keyword"
                                        className="bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600/60 hover:border-rose-400/70 tracking-normal select-none cursor-pointer transition-colors"
                                    >
                                        <span className="text-sm font-extrabold text-amber-500">{displayLabel}</span>
                                    </button>
                                );
                            }

                            return (
                                <span
                                    key={idx}
                                    className="bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600/60 flex items-center gap-1.5 select-none"
                                >
                                    <span className="text-sm font-extrabold text-amber-500 tracking-widest">******</span>
                                    {authorLabel}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
