interface Props {
  type?: string;
  snapshot?: string;
  note?: string;
}

export function CiteVault({ type, snapshot, note }: Props) {
  return (
    <aside className="my-2 rounded-e border-s-2 border-s-border bg-muted p-2 text-xs text-muted-foreground">
      <div className="font-semibold mb-1">Vault citation</div>
      {type ? <div><span className="font-medium">type:</span> {type}</div> : null}
      {snapshot ? <div><span className="font-medium">snapshot:</span> <code className="text-[10px]">{snapshot}</code></div> : null}
      {note ? <div className="mt-1">{note}</div> : null}
    </aside>
  );
}
