/** Original ironwork divider. The rails stretch; the central knot keeps its proportions. */
export function GothicDivider() {
  return <div className="gothic-divider" aria-hidden="true">
    <svg className="divider-terminal" viewBox="0 0 28 44" fill="none" focusable="false"><path d="M24 22H8m8-11L5 22l11 11M12 22l8-5v10Z" stroke="currentColor" strokeWidth="1.2"/><path d="m4 22 4-4 4 4-4 4Z" fill="currentColor"/></svg>
    <span className="divider-rail"/>
    <svg className="divider-knot" viewBox="0 0 240 54" fill="none" focusable="false"><g stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round"><path d="M0 27h37l16-9 13 9-13 9-16-9h39m164 0h-37l-16-9-13 9 13 9 16-9h-39M65 27c13-18 29-18 40-7-7 1-12 4-15 7 3 3 8 6 15 7-11 11-27 11-40-7Zm110 0c-13-18-29-18-40-7 7 1 12 4 15 7-3 3-8 6-15 7 11 11 27 11 40-7ZM107 27l13-23 13 23-13 23Z"/><path d="M120 4v46M97 9l10 9m36-9-10 9M97 45l10-9m36 9-10-9M21 27l15-5m-15 5 15 5m183-5-15-5m15 5-15 5"/></g><path d="m120 16 6 11-6 11-6-11Z" fill="currentColor"/></svg>
    <span className="divider-rail"/>
    <svg className="divider-terminal divider-terminal-end" viewBox="0 0 28 44" fill="none" focusable="false"><path d="M24 22H8m8-11L5 22l11 11M12 22l8-5v10Z" stroke="currentColor" strokeWidth="1.2"/><path d="m4 22 4-4 4 4-4 4Z" fill="currentColor"/></svg>
  </div>;
}
