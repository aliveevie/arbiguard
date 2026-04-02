import { Shield, User } from "lucide-react";

export interface Message {
  id: string;
  role: "agent" | "user";
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage = ({ message }: ChatMessageProps) => {
  const isAgent = message.role === "agent";

  return (
    <div
      className={`flex gap-2.5 max-w-[85%] sm:max-w-[85%] animate-message-in ${
        isAgent ? "self-start" : "self-end flex-row-reverse"
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground flex-shrink-0 mt-0.5 ${
          isAgent ? "bg-gradient-to-br from-primary to-accent" : "bg-[hsl(258,56%,53%)]"
        }`}
      >
        {isAgent ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      <div>
        <div
          className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${
            isAgent
              ? "bg-agent border border-border rounded-tl-sm"
              : "bg-user-msg border border-primary/20 rounded-tr-sm"
          }`}
          dangerouslySetInnerHTML={{ __html: message.content }}
        />
        <p className={`text-[10px] text-muted-foreground mt-1 px-1 ${!isAgent ? "text-right" : ""}`}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
