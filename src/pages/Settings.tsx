import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

export default function Settings() {
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [selectedModel, setSelectedModel] = useState("phi-3");
  const [isConnected, setIsConnected] = useState(false);
  const [autoSummary, setAutoSummary] = useState(true);
  const [enableVision, setEnableVision] = useState(true);
  const [enableSpeech, setEnableSpeech] = useState(true);

  const availableModels = [
    { id: "phi-3", name: "Phi-3", size: "3.8GB" },
    { id: "llama2", name: "Llama 2", size: "7GB" },
    { id: "mistral", name: "Mistral", size: "7GB" },
    { id: "llava", name: "LLaVA (Vision)", size: "4.7GB" },
  ];

  const handleTestConnection = () => {
    // Simulate connection test
    setIsConnected(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Configure your AI assistant
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Ollama Connection */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Ollama Connection</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ollama-url">Ollama API URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="ollama-url"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <Button onClick={handleTestConnection} variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Test
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Connected to Ollama</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Not connected</span>
                    </>
                  )}
                </div>
                <Badge variant={isConnected ? "default" : "secondary"}>
                  {isConnected ? "Online" : "Offline"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Model Selection */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">AI Model</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Select Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{model.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {model.size}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">
                  Current model: <strong>{selectedModel}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Make sure the model is downloaded in Ollama
                </p>
              </div>
            </div>
          </Card>

          {/* Features */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Features</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-summary">Auto Summary</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate summaries after each interaction
                  </p>
                </div>
                <Switch
                  id="auto-summary"
                  checked={autoSummary}
                  onCheckedChange={setAutoSummary}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-vision">Vision Support</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable image analysis capabilities
                  </p>
                </div>
                <Switch
                  id="enable-vision"
                  checked={enableVision}
                  onCheckedChange={setEnableVision}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enable-speech">Speech Features</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable speech-to-text and text-to-speech
                  </p>
                </div>
                <Switch
                  id="enable-speech"
                  checked={enableSpeech}
                  onCheckedChange={setEnableSpeech}
                />
              </div>
            </div>
          </Card>

          {/* Storage */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Storage</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <span className="text-sm">Chat History</span>
                <Badge variant="outline">Local</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <span className="text-sm">Task Logs</span>
                <Badge variant="outline">Local</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <span className="text-sm">Uploaded Files</span>
                <Badge variant="outline">Local</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                All data is stored locally on your device
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
