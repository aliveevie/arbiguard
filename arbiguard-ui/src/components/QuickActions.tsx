interface QuickActionsProps {
  onAction: (action: string) => void | Promise<void>;
}

const actions = [
  "About Agent",
  "Replay Radiant Exploit",
  "Replay GMX Exploit",
  "All Exploits",
  "GMX Health",
  "Contract Status",
  "Threat History",
  "Pool Status",
  "Help",
];

const QuickActions = ({ onAction }: QuickActionsProps) => {
  return (
    <div className="flex gap-2 px-5 py-2 overflow-x-auto flex-shrink-0 border-t border-border bg-card scrollbar-thin">
      {actions.map((action) => (
        <button
          key={action}
          onClick={() => onAction(action)}
          className="px-3.5 py-1.5 border border-border rounded-full bg-transparent text-muted-foreground text-xs cursor-pointer whitespace-nowrap transition-all hover:border-primary hover:text-primary hover:bg-primary/[0.08]"
        >
          {action}
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
