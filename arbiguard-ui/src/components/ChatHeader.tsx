import { Shield } from "lucide-react";

const ChatHeader = () => {
  return (
    <header className="bg-card border-b border-border px-5 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-primary to-accent rounded-[10px] flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">ArbiGuard</h1>
          <span className="text-[11px] text-muted-foreground">DeFi Threat Detection Agent on Arbitrum</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse-dot" />
          Agent #156
        </div>
        <span className="hidden sm:inline-flex text-[11px] text-info bg-info/10 px-2.5 py-1 rounded-full border border-info/20">
          Arbitrum Sepolia
        </span>
      </div>
    </header>
  );
};

export default ChatHeader;
