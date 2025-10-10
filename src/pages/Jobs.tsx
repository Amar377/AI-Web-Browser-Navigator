import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  Building,
  Briefcase,
  CheckCircle,
  Clock,
  AlertCircle,
  Play,
} from "lucide-react";

interface Application {
  id: string;
  company: string;
  position: string;
  status: "pending" | "in-progress" | "completed" | "error";
  progress: number;
}

export default function Jobs() {
  const [resume, setResume] = useState<File | null>(null);
  const [companies, setCompanies] = useState("");
  const [roles, setRoles] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setResume(e.target.files[0]);
    }
  };

  const handleStart = () => {
    setIsRunning(true);
    // Simulate applications
    const mockApplications: Application[] = [
      {
        id: "1",
        company: "Tech Corp",
        position: "Senior Developer",
        status: "pending",
        progress: 0,
      },
      {
        id: "2",
        company: "Startup Inc",
        position: "Full Stack Engineer",
        status: "pending",
        progress: 0,
      },
    ];
    setApplications(mockApplications);
  };

  const getStatusIcon = (status: Application["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "in-progress":
        return <div className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = (status: Application["status"]) => {
    const variants = {
      pending: "secondary",
      "in-progress": "default",
      completed: "default",
      error: "destructive",
    };
    return variants[status] as any;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Job Application Assistant</h1>
          <p className="text-xs text-muted-foreground">
            Automated job applications
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Setup */}
        <div className="w-96 border-r border-border p-6 space-y-6 overflow-auto">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Upload Resume
              </label>
              <div className="relative">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  id="resume-upload"
                  disabled={isRunning}
                />
                <label htmlFor="resume-upload">
                  <Card className="p-4 cursor-pointer hover:bg-muted/50 transition-smooth border-dashed">
                    <div className="flex items-center gap-3">
                      {resume ? (
                        <>
                          <FileText className="h-8 w-8 text-accent" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {resume.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(resume.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              Click to upload
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PDF, DOC, or DOCX
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Target Companies
              </label>
              <Textarea
                value={companies}
                onChange={(e) => setCompanies(e.target.value)}
                placeholder="List companies, one per line..."
                className="min-h-[100px]"
                disabled={isRunning}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Target Roles
              </label>
              <Textarea
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="List desired positions, one per line..."
                className="min-h-[100px]"
                disabled={isRunning}
              />
            </div>
          </div>

          <Button
            onClick={handleStart}
            disabled={!resume || !companies || !roles || isRunning}
            className="w-full"
          >
            <Play className="mr-2 h-4 w-4" />
            Start Applications
          </Button>

          <Card className="p-4 bg-muted/50">
            <p className="text-xs text-muted-foreground">
              The AI will visit job sites, fill applications, and pause before
              each submission for your confirmation.
            </p>
          </Card>
        </div>

        {/* Right Panel - Applications */}
        <div className="flex-1 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Applications</h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Total: {applications.length}
              </span>
              <span className="text-muted-foreground">
                Completed:{" "}
                {
                  applications.filter((app) => app.status === "completed")
                    .length
                }
              </span>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-12rem)]">
            {applications.length === 0 ? (
              <Card className="p-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  No applications yet. Configure your settings and start the
                  process.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <Card key={app.id} className="p-4 animate-fade-in">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <h3 className="font-medium">{app.company}</h3>
                          <p className="text-sm text-muted-foreground">
                            {app.position}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(app.status)}
                        <Badge variant={getStatusBadge(app.status)}>
                          {app.status}
                        </Badge>
                      </div>
                    </div>
                    {app.status === "in-progress" && (
                      <div className="space-y-2">
                        <Progress value={app.progress} />
                        <p className="text-xs text-muted-foreground">
                          {app.progress}% complete
                        </p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
