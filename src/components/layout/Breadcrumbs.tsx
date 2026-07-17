import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="blora-breadcrumb" aria-label="面包屑">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} style={{ display: "contents" }}>
            {i > 0 && <span className="blora-breadcrumb__sep">/</span>}
            {isLast || !item.href ? (
              <span className="blora-breadcrumb__current">{item.label}</span>
            ) : (
              <Link href={item.href}>{item.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
