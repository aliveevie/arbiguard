const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-1 px-4 py-2 self-start">
      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing-1" />
      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing-2" />
      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing-3" />
    </div>
  );
};

export default TypingIndicator;
