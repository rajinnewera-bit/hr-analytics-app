export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-10">
      <section className="w-full rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-soft backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slateText">
          Page Not Found
        </p>
        <h1 className="mt-3 text-3xl font-bold text-ink">This page is not available.</h1>
        <p className="mt-3 text-sm leading-6 text-slateText">
          Please go back to the main upload screen and try again.
        </p>
      </section>
    </main>
  );
}
