/**
 * Motiv „Klangkreis“ aus dem Designsystem: ein gefüllter Kreis (der Ton) mit feinen
 * goldenen Ringen, die nach außen breiter werden und teils angeschnitten sind.
 * Höchstens einmal pro Ansicht verwenden.
 *
 * Mit `children` wird statt des gefüllten Kerns ein heller Kreis gezeigt, in dem der
 * Inhalt sitzt (z. B. der QR-Code auf dem Aufsteller).
 */
type Props = {
  size?: number | string;
  animated?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export default function Klangkreis({ size = 160, animated = false, className = '', children }: Props) {
  const withCenter = !!children;
  // Ringradien (viewBox 200): mit Inhalt braucht der Kern mehr Platz
  const [core, r1, r2, r3] = withCenter ? [52, 66, 81, 97] : [38, 56, 73, 92];
  const c2 = 2 * Math.PI * r2;
  const c3 = 2 * Math.PI * r3;

  return (
    <div
      className={`klangkreis ${animated ? 'is-animated' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden={withCenter ? undefined : true}
    >
      <svg viewBox="0 0 200 200" className="kk-svg">
        <circle cx="100" cy="100" r={r1} className="kk-ring kk-r1" />
        <circle
          cx="100"
          cy="100"
          r={r2}
          className="kk-ring kk-r2"
          strokeDasharray={`${c2 * 0.62} ${c2 * 0.08} ${c2 * 0.18} ${c2 * 0.12}`}
        />
        <circle
          cx="100"
          cy="100"
          r={r3}
          className="kk-ring kk-r3"
          strokeDasharray={`${c3 * 0.34} ${c3 * 0.1} ${c3 * 0.41} ${c3 * 0.15}`}
        />
        {!withCenter && <circle cx="100" cy="100" r={core} className="kk-core" />}
      </svg>
      {withCenter && (
        <div className="kk-center" style={{ inset: `${((100 - core) / 200) * 100}%` }}>
          {children}
        </div>
      )}
    </div>
  );
}
