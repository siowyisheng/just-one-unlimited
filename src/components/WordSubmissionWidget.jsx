import React from 'react';

export default function WordSubmissionWidget({
    newWord,
    setNewWord,
    onAddWord,
    onRemoveWord,
    wordList,
    getPlayerName,
    currentUserId,
    title = "Shared Keyword List",
    placeholder = "Enter a noun or name",
}) {
    return (
        <div className="flex flex-col gap-4">
            {/* Add Word Form */}
            <form onSubmit={onAddWord} className="flex justify-center">
                <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value.replace(/\s+/g, '').toUpperCase())}
                    placeholder={placeholder}
                    className="w-64 max-w-[60%] text-center bg-slate-800 border border-slate-700 border-r-0 rounded-l-xl rounded-r-none px-4 py-3 text-2xl font-extrabold text-amber-500 placeholder:text-base placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
                <button
                    type="submit"
                    className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-r-xl rounded-l-none transition-all cursor-pointer shadow-md active:scale-95 whitespace-nowrap"
                >
                    ADD KEYWORD
                </button>
            </form>

            {/* Shared Word List Display */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-h-[160px]">
                <h3 className="text-sm font-semibold mb-3 text-slate-300 flex justify-between items-center">
                    <span>{title}</span>
                    <span className="text-xs font-normal text-slate-400">
                        {wordList.length} {wordList.length === 1 ? 'keyword' : 'keywords'} in pool
                    </span>
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
                            const isMine = Boolean(currentUserId) && authorId === currentUserId;

                            const authorLabel = author ? (
                                <span className="text-[10px] text-slate-400 italic tracking-normal">
                                    ({author})
                                </span>
                            ) : null;

                            if (isMine) {
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => onRemoveWord(idx)}
                                        aria-label={`Remove ${wordText}`}
                                        title="Remove this keyword"
                                        className="bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-600/60 hover:border-rose-400/70 tracking-normal select-none cursor-pointer transition-colors"
                                    >
                                        <span className="text-sm font-extrabold text-amber-500">{wordText}</span>
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