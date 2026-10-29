import Link from "next/link";
import { logout } from "./login/actions";

const ITEMS = [
  { key: "topics", href: "/admin/topics", label: "Topics" },
  { key: "characters", href: "/admin/characters", label: "Characters" },
  { key: "ai", href: "/admin/ai", label: "AI & Settings" },
] as const;

export default function AdminNav({
  current,
}: {
  current: "topics" | "characters" | "ai";
}) {
  return (
    <header className="admin-head">
      <div>
        <h1 className="brand">Palaver</h1>
        <nav className="nav">
          {ITEMS.map((i) => (
            <Link key={i.key} href={i.href} className={current === i.key ? "on" : ""}>
              {i.label}
            </Link>
          ))}
        </nav>
      </div>
      <form action={logout}>
        <button className="ghost" type="submit">
          Sign out
        </button>
      </form>
    </header>
  );
}
