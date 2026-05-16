"use client";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  console.error("Route error", error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
      <section className="w-full rounded-[2rem] border border-rose-200 bg-white/90 p-8 shadow-soft backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-700">
          Something Went Wrong
        </p>
        <h1 className="mt-3 text-3xl font-bold text-ink">The app hit an unexpected error.</h1>
        <p className="mt-3 text-sm leading-6 text-slateText">
          Please try resetting this screen. If the problem happened during an upload,
          the app will start from a clean state.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-ink px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800"
        >
          Try Again
        </button>
      </section>
    </main>
  );
}
