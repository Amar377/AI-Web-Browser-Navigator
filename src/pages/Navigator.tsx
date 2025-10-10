import { useEffect, useState } from "react";
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
  FileText,
} from "lucide-react";

type LogType =
  | "start"
  | "plan"
  | "navigate"
  | "click"
  | "type"
  | "extract"
  | "success"
  | "error"
  | "manual"
  | "pause"
  | "resume"
  | "stop";

interface ActionLog {
  id: string;
  type: LogType;
  message: string;
  timestamp: Date;
  level?: "info" | "warning" | "error";
}

interface SummariesState {
  processSummary: string;
  finalSummary: string;
}

const getStatusVariant = (status: string) => {
  switch (status) {
    case "failed":
      return "destructive";
    case "completed":
      return "default";
    case "running":
    case "awaiting-user":
      return "default";
    case "paused":
    case "manual":
      return "secondary";
    default:
      return "outline";
  }
};

const normalizeLog = (log: any): ActionLog => ({
  id: log.id?.toString() ?? `${Date.now()}`,
  type: (log.type ?? "manual") as LogType,
  message: log.message ?? "",
  level: log.level,
  timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
});

export default function Navigator() {
  const [task, setTask] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [summaries, setSummaries] = useState<SummariesState>({
    processSummary: "",
    finalSummary: "",
  });

  useEffect(() => {
    return () => {
      if ((window as any).navigatorInterval) {
        clearInterval((window as any).navigatorInterval);
        (window as any).navigatorInterval = null;
      }
    };
  }, []);

  const pollLogs = async (id: string) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/navigator/logs/${id}`
      );

      if (response.status === 404) {
        if ((window as any).navigatorInterval) {
          clearInterval((window as any).navigatorInterval);
          (window as any).navigatorInterval = null;
        }
        setIsRunning(false);
        setIsPaused(false);
        setStatus("idle");
        setSessionId(null);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch logs");
      }

      const data = await response.json();
      setLogs((data.logs ?? []).map(normalizeLog));
      setIsPaused(Boolean(data.isPaused));
      setStatus(data.status ?? "idle");
      setIsRunning(
        ["running", "awaiting-user", "paused"].includes(data.status)
      );
      setSummaries({
        processSummary: data.processSummary ?? "",
        finalSummary: data.finalSummary ?? "",
      });
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  };

  const handleStart = async () => {
    if (!task.trim()) return;

    const newSessionId = `nav-${Date.now()}`;
    setSessionId(newSessionId);
    setIsRunning(true);
    setIsPaused(false);
    setStatus("running");
    setLogs([]);
    setSummaries({ processSummary: "", finalSummary: "" });

    if ((window as any).navigatorInterval) {
      clearInterval((window as any).navigatorInterval);
      (window as any).navigatorInterval = null;
    }

    try {
      const response = await fetch(
        "http://localhost:3001/api/navigator/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ task, sessionId: newSessionId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to start navigation");
      }

      const data = await response.json();
      setLogs(data.log ? [normalizeLog(data.log)] : []);

      const interval = setInterval(() => {
        pollLogs(newSessionId);
      }, 2500);
      (window as any).navigatorInterval = interval;
    } catch (error) {
      console.error("Navigation error:", error);
      setLogs([
        {
          id: Date.now().toString(),
          type: "error",
          message:
            "⚠️ Failed to connect to the local server. Make sure the Node.js backend is running.",
          timestamp: new Date(),
          level: "error",
        },
      ]);
      setIsRunning(false);
      setSessionId(null);
      setStatus("idle");
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;

    try {
      const endpoint = isPaused ? "resume" : "pause";
      const response = await fetch(
        `http://localhost:3001/api/navigator/${endpoint}/${sessionId}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Failed to ${endpoint} session`);
      }

      await pollLogs(sessionId);
    } catch (error) {
      console.error("Failed to toggle pause:", error);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `http://localhost:3001/api/navigator/stop/${sessionId}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("Failed to stop session");
      }

      const data = await response.json();
      setStatus(data.status ?? "stopped");

      if ((window as any).navigatorInterval) {
        clearInterval((window as any).navigatorInterval);
        (window as any).navigatorInterval = null;
      }

      await pollLogs(sessionId);
    } catch (error) {
      console.error("Failed to stop session:", error);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      setSessionId(null);
    }
  };

  const getLogIcon = (type: LogType) => {
    switch (type) {
      case "start":
      case "resume":
        return <Play className="h-4 w-4 text-green-500" />;
      case "plan":
        return <FileText className="h-4 w-4 text-muted-foreground" />;
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
      case "manual":
        return <Edit className="h-4 w-4 text-amber-500" />;
      case "pause":
        return <Pause className="h-4 w-4 text-muted-foreground" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "stop":
        return <StopCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const renderLogTimestamp = (date: Date) =>
    isNaN(date.getTime())
      ? ""
      : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const statusText = status.replace(/-/g, " ");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Browser Navigator</h1>
          <p className="text-xs text-muted-foreground">
            AI-powered shopping assistant
          </p>
        </div>
        <Badge variant={getStatusVariant(status)}>
          {statusText ? statusText : isRunning ? "running" : "idle"}
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 border-r border-border p-6 space-y-6 overflow-auto">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Describe the task
              </label>
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="For example: “Open Amazon and order Nike shoes.”"
                className="min-h-[160px]"
                disabled={isRunning}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Session ID
              </label>
              <Input
                value={sessionId ?? "—"}
                disabled
                className="font-mono text-xs"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            {!isRunning ? (
              <Button
                onClick={handleStart}
                disabled={!task.trim()}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                Start automation
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

          {(isPaused || status === "awaiting-user") && (
            <Card className="p-4 bg-muted">
              <div className="flex items-start gap-2">
                <Edit className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Manual input required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the live browser to handle logins or captchas. When
                    finished, press Resume to continue automation.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 bg-muted/20 border-b border-border p-4">
            <Card className="h-full flex items-center justify-center glass">
              <div className="text-center space-y-2">
                <Globe className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isRunning
                    ? "The automation is controlling a local Playwright browser window."
                    : "Start a task to launch the shopping assistant."}
                </p>
              </div>
            </Card>
          </div>

          <div className="border-t border-border p-4 space-y-4 overflow-auto">
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Process summary
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {summaries.processSummary
                    ? summaries.processSummary
                    : "Run a task to see a generated process summary."}
                </p>
              </Card>
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Order summary
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {summaries.finalSummary
                    ? summaries.finalSummary
                    : "Order details and next steps will be summarised here once available."}
                </p>
              </Card>
            </div>

            <div className="border border-border rounded-lg">
              <div className="h-12 flex items-center justify-between px-4 border-b border-border">
                <h3 className="text-sm font-medium">Action log</h3>
                <Badge variant="outline">{logs.length} actions</Badge>
              </div>
              <ScrollArea className="h-72 p-4">
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
                          <p
                            className={`text-sm ${
                              log.level === "warning"
                                ? "text-amber-600"
                                : log.level === "error"
                                ? "text-destructive"
                                : ""
                            }`}
                          >
                            {log.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {renderLogTimestamp(log.timestamp)}
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
    </div>
  );
}
