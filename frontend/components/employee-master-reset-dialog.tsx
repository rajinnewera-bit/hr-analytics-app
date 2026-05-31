"use client";

type EmployeeMasterResetDialogProps = {
  open: boolean;
  step: 1 | 2;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onCancel: () => void;
  onContinue: () => void;
  onConfirmDelete: () => void;
};

export function EmployeeMasterResetDialog({
  open,
  step,
  confirmText,
  onConfirmTextChange,
  onCancel,
  onContinue,
  onConfirmDelete,
}: EmployeeMasterResetDialogProps) {
  if (!open) {
    return null;
  }

  const canConfirmDelete = confirmText === "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-master-reset-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        {step === 1 ? (
          <>
            <p
              id="employee-master-reset-title"
              className="text-lg font-bold text-ink"
            >
              Delete entire Employee Master?
            </p>
            <p className="mt-2 text-sm leading-6 text-slateText">
              Are you sure you want to delete all employee records?
            </p>
            <p className="mt-2 text-xs text-slateText">
              This removes employee profiles, leave balances, and stored salary breakup values.
              Attendance uploads and salary structure settings are not affected.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onContinue}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-ink">Confirm deletion</p>
            <p className="mt-2 text-sm leading-6 text-slateText">
              Type <span className="font-semibold text-ink">DELETE</span> to permanently clear
              the Employee Master.
            </p>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-slateText">Confirmation</span>
              <input
                value={confirmText}
                onChange={(event) => onConfirmTextChange(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-100"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={!canConfirmDelete}
                className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
              >
                Delete Entire Employee Master
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
