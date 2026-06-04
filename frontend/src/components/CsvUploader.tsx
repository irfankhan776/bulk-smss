import { useCallback, useState } from "react";

interface CsvUploaderProps {
  csvRaw: string;
  onChange: (raw: string, result?: unknown) => void;
  onValidate: (raw: string) => Promise<{ valid: boolean; errors: string[]; rowCount: number; preview: Record<string, string>[] }>;
}

export default function CsvUploader({ csvRaw, onChange, onValidate }: CsvUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
    rowCount: number;
    preview: Record<string, string>[];
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setValidationError("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onChange(text);
      setValidationResult(null);
      setValidationError(null);
    };
    reader.readAsText(file);
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  async function handleValidate() {
    if (!csvRaw) {
      setValidationError("Please upload a CSV file first");
      return;
    }
    setValidating(true);
    setValidationError(null);
    try {
      const result = await onValidate(csvRaw);
      setValidationResult(result);
    } catch (e: any) {
      setValidationError(e?.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  const hasErrors = validationResult && !validationResult.valid;
  const isValid = validationResult && validationResult.valid;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-accent-500 bg-accent-500/5"
            : "border-slate-700 hover:border-slate-500"
        }`}
      >
        <div className="text-3xl mb-2">📄</div>
        <div className="text-sm text-slate-300 mb-1">Drop your CSV here</div>
        <div className="text-xs text-slate-500 mb-3">or click to browse</div>
        <label className="inline-block px-4 py-1.5 rounded-md text-sm bg-accent-500/10 ring-1 ring-accent-500/30 text-accent-400 cursor-pointer hover:bg-accent-500/20 transition-colors">
          Choose File
          <input type="file" accept=".csv" className="hidden" onChange={handleInputChange} />
        </label>
      </div>

      {/* CSV preview (textarea) */}
      {csvRaw && (
        <div>
          <div className="text-xs text-slate-400 mb-1 font-mono">
            CSV Preview — first 5 lines:
          </div>
          <textarea
            readOnly
            value={csvRaw.split("\n").slice(0, 6).join("\n")}
            rows={5}
            className="w-full rounded-md bg-slate-950/80 ring-1 ring-slate-800 px-3 py-2 text-xs font-mono text-slate-400 resize-none"
          />
        </div>
      )}

      {/* Validate button */}
      <button
        onClick={handleValidate}
        disabled={!csvRaw || validating}
        className="w-full px-4 py-2 rounded-md text-sm bg-slate-900/60 ring-1 ring-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {validating ? "Validating..." : "Validate CSV"}
      </button>

      {/* Validation errors */}
      {validationError && (
        <div className="rounded-md bg-red-500/10 ring-1 ring-red-500/20 p-3">
          <div className="text-xs font-semibold text-red-400 mb-1">Error</div>
          <div className="text-xs text-red-300">{validationError}</div>
        </div>
      )}

      {/* Validation result */}
      {validationResult && (
        <div>
          {hasErrors && (
            <div className="rounded-md bg-red-500/10 ring-1 ring-red-500/20 p-3">
              <div className="text-xs font-semibold text-red-400 mb-2">
                Validation Failed — {validationResult.errors.length} error(s) found:
              </div>
              <ul className="space-y-0.5">
                {validationResult.errors.slice(0, 10).map((err, i) => (
                  <li key={i} className="text-xs text-red-300 font-mono">
                    {i + 1}. {err}
                  </li>
                ))}
                {validationResult.errors.length > 10 && (
                  <li className="text-xs text-red-400 font-mono">
                    ... and {validationResult.errors.length - 10} more errors
                  </li>
                )}
              </ul>
              <div className="mt-2 text-xs text-red-300">
                {validationResult.rowCount} valid row(s) found — fix the errors above to proceed.
              </div>
            </div>
          )}
          {isValid && (
            <div className="rounded-md bg-accent-500/10 ring-1 ring-accent-500/20 p-3">
              <div className="text-xs font-semibold text-accent-400 mb-1">
                CSV Valid — {validationResult.rowCount} lead(s) ready
              </div>
              <div className="text-xs text-slate-400 mb-2">Preview:</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="text-left pb-1 pr-3">Business</th>
                      <th className="text-left pb-1 pr-3">City</th>
                      <th className="text-left pb-1">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationResult.preview.map((row, i) => (
                      <tr key={i} className="text-slate-300 border-b border-slate-800/50">
                        <td className="py-1 pr-3">{row.businessName}</td>
                        <td className="py-1 pr-3">{row.city}</td>
                        <td className="py-1">{row.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
