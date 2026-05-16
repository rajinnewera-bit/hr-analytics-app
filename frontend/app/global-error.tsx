"use client";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  console.error("Global route error", error);

  return (
    <html lang="en">
      <body className="font-sans">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
          <section className="w-full rounded-[2rem] border border-rose-200 bg-white/90 p-8 shadow-soft backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">
              Application Error
            </p>
            <h1 className="mt-3 text-3xl font-bold text-ink">
              The preview hit an unexpected problem.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slateText">
              Reset the screen to reload the MIS dashboard. Your upload state will start
              clean if the failure happened mid-session.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800"
            >
              Reload Preview
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
