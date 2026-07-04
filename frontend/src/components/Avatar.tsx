import { initials, colorFor } from "../utils";

export function Avatar({
  name,
  size = 40,
  online,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      <div
        className="avatar"
        style={{
          backgroundColor: colorFor(name),
          width: size,
          height: size,
          fontSize: size * 0.4,
        }}
      >
        {initials(name)}
      </div>
      {online !== undefined && (
        <span className={`presence-dot ${online ? "on" : "off"}`} />
      )}
    </div>
  );
}
