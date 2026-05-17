interface Props {
  snapshot?: string;
  date?: string;
  thread?: string;
  note?: string;
}

export function CiteMessage({ snapshot, date, thread, note }: Props) {
  return (
    <aside className="my-2 rounded-e border-s-2 border-s-primary bg-muted p-2 text-xs text-muted-foreground">
      <div className="font-semibold mb-1">Message citation</div>
      {date ? <div><span className="font-medium">date:</span> {date}</div> : null}
      {thread ? <div><span className="font-medium">thread:</span> {thread}</div> : null}
      {snapshot ? <div><span className="font-medium">snapshot:</span> <code className="text-[10px]">{snapshot}</code></div> : null}
      {note ? <div className="mt-1">{note}</div> : null}
    </aside>
  );
}
