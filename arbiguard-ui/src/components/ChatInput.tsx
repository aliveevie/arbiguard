import { Send } from "lucide-react";
import { useState, useRef, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
}

const ChatInput = ({ onSend, disabled }: ChatInputProps) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "44px";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="px-5 py-3 pb-4 bg-card border-t border-border flex-shrink-0">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask ArbiGuard about DeFi threats, exploits, pool status..."
          rows={1}
          className="flex-1 bg-input border border-border rounded-lg px-4 py-3 text-foreground text-sm font-[inherit] resize-none outline-none min-h-[44px] max-h-[120px] leading-snug transition-colors focus:border-primary placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          className="w-11 h-11 border-none rounded-lg bg-primary text-primary-foreground cursor-pointer flex items-center justify-center transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
