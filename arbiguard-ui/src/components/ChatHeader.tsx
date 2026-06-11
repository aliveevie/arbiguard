import { Shield, Activity } from "lucide-react";
import { Link } from "react-router-dom";

const ChatHeader = () => {
  return (
    <header className="bg-card border-b border-border px-5 py-3 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-primary to-accent rounded-[10px] flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">ArbiGuard</h1>
          <span className="text-[11px] text-muted-foreground">
            On-chain firewall for tokenized assets · Arbitrum + Robinhood Chain
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/firewall"
          className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
        >
          <Activity className="w-3.5 h-3.5" />
          Live Firewall
        </Link>
        <span className="hidden sm:inline-flex text-[11px] text-info bg-info/10 px-2.5 py-1 rounded-full border border-info/20">
          Arbitrum Sepolia + Robinhood
        </span>
      </div>
    </header>
  );
};

export default ChatHeader;
