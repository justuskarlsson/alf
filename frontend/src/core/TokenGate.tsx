import { useState } from "react";

interface Props {
  onToken: (token: string) => void;
}

export function TokenGate({ onToken }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onToken(trimmed);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80">
        <h1 className="text-zinc-300 text-lg font-medium">Alf</h1>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Relay token"
          autoFocus
          className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="bg-zinc-800 text-zinc-200 rounded px-3 py-2 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Connect
        </button>
      </form>
    </div>
  );
}
