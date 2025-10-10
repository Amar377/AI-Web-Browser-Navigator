import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  StopCircle,
  Edit,
  Globe,
  Mouse,
  Keyboard,
  Eye,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface ActionLog {
  id: string;
  type: "navigate" | "click" | "type" | "extract" | "success" | "error";
  message: string;
  timestamp: Date;
}

export default function Navigator() {
  const [url, setUrl] = useState("");
  const [task, setTask] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);

  const handleStart = () => {
    if (!url || !task) return;
    setIsRunning(true);
    setIsPaused(false);
    
    // Simulate action logs
    const mockLogs: ActionLog[] = [
      {
        id: "1",
        type: "navigate",
        message: `Navigating to ${url}...`,
        timestamp: new Date(),
      },
      {
        id: "2",
        type: "success",
        message: "Page loaded successfully",
        timestamp: new Date(Date.now() + 1000),
      },
    ];
    
    setLogs(mockLogs);
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
  };

  const getLogIcon = (type: ActionLog["type"]) => {
    switch (type) {
      case "navigate":
        return <Globe className="h-4 w-4" />;
      case "click":
        return <Mouse className="h-4 w-4" />;
      case "type":
        return <Keyboard className="h-4 w-4" />;
      case "extract":
        return <Eye className="h-4 w-4" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Browser Navigator</h1>
          <p className="text-xs text-muted-foreground">
            AI-powered web automation
          </p>
        </div>
        <Badge variant={isRunning ? "default" : "secondary"}>
          {isRunning ? (isPaused ? "Paused" : "Running") : "Idle"}
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-96 border-r border-border p-6 space-y-6 overflow-auto">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Target URL
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isRunning}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Task Description
              </label>
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Describe what you want the AI to do..."
                className="min-h-[120px]"
                disabled={isRunning}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            {!isRunning ? (
              <Button
                onClick={handleStart}
                disabled={!url || !task}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                Start Navigation
              </Button>
            ) : (
              <>
                <Button
                  onClick={handlePause}
                  variant="outline"
                  className="w-full"
                >
                  {isPaused ? (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="w-full"
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              </>
            )}
          </div>

          {isPaused && (
            <Card className="p-4 bg-muted">
              <div className="flex items-start gap-2">
                <Edit className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Edit & Resume</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You can modify the task or URL and resume execution
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel - Live View & Logs */}
        <div className="flex-1 flex flex-col">
          {/* Browser Preview */}
          <div className="flex-1 bg-muted/20 border-b border-border p-4">
            <Card className="h-full flex items-center justify-center glass">
              <div className="text-center space-y-2">
                <Globe className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isRunning
                    ? "Live browser view will appear here"
                    : "Browser preview will appear when navigation starts"}
                </p>
              </div>
            </Card>
          </div>

          {/* Action Log */}
          <div className="h-64 border-t border-border">
            <div className="h-12 flex items-center justify-between px-4 border-b border-border">
              <h3 className="text-sm font-medium">Action Log</h3>
              <Badge variant="outline">{logs.length} actions</Badge>
            </div>
            <ScrollArea className="h-[calc(100%-3rem)] p-4">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">
                    No actions yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 animate-fade-in"
                    >
                      {getLogIcon(log.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{log.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {log.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
