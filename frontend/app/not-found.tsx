import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-start justify-center gap-5 px-6 py-16">
      <p className="font-display text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground/80">
        404
      </p>
      <h1 className="text-4xl font-semibold leading-tight tracking-normal text-foreground sm:text-5xl">
        That page isn&rsquo;t in the registry.
      </h1>
      <p className="text-base leading-7 text-muted-foreground">
        It may have been renamed, archived, or never existed. If you were
        looking for a person, search by their name — the wiki indexes
        aliases and GEDCOM-derived fields, so it often finds people whose
        canonical page slug isn&rsquo;t obvious.
      </p>
      <form action="/search" className="w-full max-w-md">
        <input
          type="search"
          name="q"
          autoFocus
          placeholder="Search for a name…"
          className="w-full rounded border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </form>
      <div className="flex flex-wrap gap-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground/85">
        <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
          ← Home
        </Link>
        <Link href="/family/tree" className="underline-offset-4 hover:text-foreground hover:underline">
          Family tree →
        </Link>
      </div>
    </main>
  );
}
