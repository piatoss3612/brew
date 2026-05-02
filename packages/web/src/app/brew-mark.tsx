export function BrewMark() {
  return (
    <svg
      className="brew-mark-icon"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="brew-flask-outline"
        d="M15.6 6.5h8.8M17.8 6.5v6.8L10.4 26c-2.1 3.7.5 8.3 4.8 8.3h9.6c4.3 0 6.9-4.6 4.8-8.3l-7.4-12.7V6.5"
      />
      <path
        className="brew-flask-liquid"
        d="M12.9 26.2c2.2-1.1 4 .6 6.7.1 2.9-.5 4.5-1.8 7.3-.3l1.1 1.9c1.1 2-.4 4.5-2.7 4.5H14.7c-2.3 0-3.8-2.5-2.7-4.5l.9-1.7Z"
      />
      <path
        className="brew-flask-rail"
        d="M14.5 25.2h11M17.7 22.4v5.6M22.3 22.4V28"
      />
      <circle className="brew-flask-node-primary" cx="17.7" cy="25.2" r="1.9" />
      <circle className="brew-flask-node-secondary" cx="22.3" cy="25.2" r="1.9" />
      <path className="brew-flask-seal" d="M16.5 17.6h7" />
    </svg>
  );
}
