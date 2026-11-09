import type { ReactNode } from "react";

interface LegalPageProps {
  title: string;
  children: ReactNode;
}

export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 leading-relaxed">
      <h1 className="text-3xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Shape of each entry in the `legal.*.sections` message arrays. */
export interface LegalSectionText {
  title: string;
  body: string;
}
