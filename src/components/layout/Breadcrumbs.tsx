import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="blora-breadcrumb app-breadcrumb" aria-label="面包屑">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="app-breadcrumb__item">
            {i > 0 && (
              <span className="blora-breadcrumb__sep" aria-hidden>
                /
              </span>
            )}
            {isLast || !item.href ? (
              <span className="blora-breadcrumb__current">{item.label}</span>
            ) : (
              <Link className="blora-breadcrumb__link" href={item.href}>
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
