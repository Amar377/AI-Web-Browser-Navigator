import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { getApiUrl, API_CONFIG } from "@/config/api";
import {
  Upload,
  FileText,
  Building,
  Briefcase,
  CheckCircle,
  Clock,
  AlertCircle,
  Play,
  StopCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

type ApplicationStatus =
  | "pending"
  | "in-progress"
  | "research-complete"
  | "ready-to-apply"
  | "completed"
  | "error"
  | "stopping"
  | "stopped";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface CoverLetter {
  subject: string;
  opening: string;
  body: string[];
  closing: string;
  call_to_action: string;
}

interface Application {
  id: string;
  company: string;
  position: string;
  status: ApplicationStatus | string;
  progress: number;
  summary?: string;
  search?: {
    query: string;
    searchUrl: string;
    capturedAt: string;
    results: SearchResult[];
  } | null;
  coverLetter?: CoverLetter | null;
  error?: string | null;
}

interface ResumeInsights {
  summary: string;
  keySkills: string[];
  experienceHighlights: string[];
  achievements: string[];
}

interface ResumeUploadResponse {
  filename: string;
  originalName: string;
  size: number;
  path: string;
  resumeInsights?: ResumeInsights;
  warning?: string;
}

interface StatusResponse {
  sessionId: string;
  status: string;
  applications: Application[];
  currentIndex: number;
  resumeInsights?: ResumeInsights;
  error?: string | null;
}

const formatStatus = (status: string) =>
  status
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
  if (status === "error") return "destructive";
  if (status === "pending") return "secondary";
  return "default";
};

const statusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "in-progress":
    case "research-complete":
    case "ready-to-apply":
      return (
        <Loader2 className="h-4 w-4 text-accent animate-spin" />
      );
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
};

export default function Jobs() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUpload, setResumeUpload] = useState<ResumeUploadResponse | null>(null);
  const [resumeInsights, setResumeInsights] = useState<ResumeInsights | null>(null);
  const [companies, setCompanies] = useState("");
  const [roles, setRoles] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  const uploadResume = async (file: File) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("resume", file);

      const response = await fetch(
        getApiUrl(API_CONFIG.endpoints.jobs.uploadResume),
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to upload resume");
      }

      const data: ResumeUploadResponse = await response.json();
      setResumeUpload(data);
      if (data.resumeInsights) {
        setResumeInsights(data.resumeInsights);
        setStatusMessage(`Resume analyzed: ${data.originalName}`);
      } else {
        setStatusMessage(`Resume uploaded: ${data.originalName}`);
      }
      if (data.warning) {
        setErrorMessage(data.warning);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to upload resume."
      );
      setResumeUpload(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setResumeFile(file);
      void uploadResume(file);
    }
  };

  const startPolling = (id: string) => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(
          `${getApiUrl(API_CONFIG.endpoints.jobs.status)}/${id}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch status");
        }
        const data: StatusResponse = await response.json();
        setApplications(data.applications || []);
        if (data.resumeInsights) {
          setResumeInsights(data.resumeInsights);
        }
        if (data.error) {
          setErrorMessage(data.error);
        }
        const normalizedStatus = data.status || "";
        if (
          ["completed", "stopped", "error"].includes(normalizedStatus)
        ) {
          setIsRunning(false);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setStatusMessage(`Session ${normalizedStatus}.`);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to poll job status."
        );
      }
    }, 4000);
  };

  const handleStart = async () => {
    if (!resumeUpload) {
      setErrorMessage("Upload a resume before starting.");
      return;
    }
    if (!companies.trim() || !roles.trim()) {
      setErrorMessage("Enter target companies and roles.");
      return;
    }

    setIsStarting(true);
    setErrorMessage(null);
    setStatusMessage("Starting automation…");

    const newSessionId = `job-${Date.now()}`;

    try {
      const response = await fetch(
        getApiUrl(API_CONFIG.endpoints.jobs.start),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: newSessionId,
            resumePath: resumeUpload.path,
            companies,
            roles,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to start the automation");
      }

      const data = await response.json();

      setSessionId(data.sessionId);
      setApplications(data.applications || []);
      if (data.resumeInsights) {
        setResumeInsights(data.resumeInsights);
      }
      setIsRunning(true);
      setStatusMessage("Automation running…");
      startPolling(data.sessionId);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start automation."
      );
      setIsRunning(false);
      setSessionId(null);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    setIsStopping(true);
    setStatusMessage("Stopping automation…");
    try {
      await fetch(
        `${getApiUrl(API_CONFIG.endpoints.jobs.stop)}/${sessionId}`,
        { method: "POST" }
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to stop automation."
      );
    } finally {
      setIsStopping(false);
      setIsRunning(false);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  };

  const canStart =
    !!resumeUpload && !!companies.trim() && !!roles.trim() && !isRunning && !isStarting;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Job Application Assistant</h1>
          <p className="text-xs text-muted-foreground">
            Upload your resume, set targets, and let the assistant research and draft applications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStop}
              disabled={isStopping}
            >
              {isStopping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <StopCircle className="mr-2 h-4 w-4" />
              )}
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
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
                  accept=".pdf,.doc,.docx,.txt"
                  className="hidden"
                  id="resume-upload"
                  disabled={isRunning || isUploading}
                />
                <label htmlFor="resume-upload">
                  <Card className="p-4 cursor-pointer hover:bg-muted/50 transition-smooth border-dashed">
                    <div className="flex items-center gap-3">
                      {resumeUpload ? (
                        <>
                          <FileText className="h-8 w-8 text-accent" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {resumeUpload.originalName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(resumeUpload.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </>
                      ) : isUploading ? (
                        <>
                          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                          <div>
                            <p className="text-sm font-medium">
                              Uploading resume…
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Please wait
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
                              PDF, DOCX, DOC, or TXT (max 10MB)
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
            disabled={!canStart}
            className="w-full"
          >
            {isStarting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isStarting ? "Starting…" : "Start Applications"}
          </Button>

          <Card className="p-4 bg-muted/50 space-y-2 text-xs text-muted-foreground">
            <p>
              The assistant researches each company/role, captures relevant job links, and drafts a cover letter using your resume.
            </p>
            <p>
              Review the generated cover letter and visit the captured links to submit final applications manually.
            </p>
            {statusMessage && (
              <p className="text-accent-foreground font-medium">{statusMessage}</p>
            )}
            {errorMessage && (
              <p className="text-destructive font-medium">{errorMessage}</p>
            )}
          </Card>
        </div>

        <div className="flex-1 p-6 space-y-4 overflow-hidden">
          {resumeInsights && (
            <Card className="p-4 space-y-2">
              <div>
                <h2 className="text-sm font-semibold mb-1">
                  Resume Insights
                </h2>
                <p className="text-xs text-muted-foreground">
                  {resumeInsights.summary}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Key Skills
                  </p>
                  <ul className="space-y-1">
                    {resumeInsights.keySkills.map((skill) => (
                      <li key={skill}>• {skill}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Experience Highlights
                  </p>
                  <ul className="space-y-1">
                    {resumeInsights.experienceHighlights.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground mb-1">
                    Achievements
                  </p>
                  <ul className="space-y-1">
                    {resumeInsights.achievements.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-2">Applications</h2>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Total: {applications.length}</span>
                <span>
                  Ready:{" "}
                  {
                    applications.filter(
                      (app) => app.status === "ready-to-apply" || app.status === "completed"
                    ).length
                  }
                </span>
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-18rem)] pr-4">
              {applications.length === 0 ? (
                <Card className="p-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No applications yet. Upload your resume, add companies and roles, then start the process.
                  </p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {applications.map((app) => (
                    <Card key={app.id} className="p-4 space-y-3 animate-fade-in">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <h3 className="font-medium">{app.company}</h3>
                            <p className="text-sm text-muted-foreground">
                              {app.position}
                            </p>
                            {app.summary && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {app.summary}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusIcon(app.status)}
                          <Badge variant={statusBadgeVariant(app.status)}>
                            {formatStatus(app.status)}
                          </Badge>
                        </div>
                      </div>

                      {app.status !== "completed" &&
                        app.status !== "error" && (
                          <div className="space-y-2">
                            <Progress value={app.progress} />
                            <p className="text-xs text-muted-foreground">
                              {app.progress}% complete
                            </p>
                          </div>
                        )}

                      {app.error && (
                        <Card className="p-3 border-destructive/30 bg-destructive/5 text-xs text-destructive">
                          {app.error}
                        </Card>
                      )}

                      {app.search && app.search.results.length > 0 && (
                        <div className="space-y-2 text-xs">
                          <p className="font-medium text-muted-foreground">
                            Research results
                          </p>
                          <ul className="space-y-2">
                            {app.search.results.map((result) => (
                              <li key={result.url}>
                                <a
                                  href={result.url}
                                  className="font-medium text-primary flex items-center gap-1"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {result.title}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <p className="text-muted-foreground">
                                  {result.snippet}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {app.coverLetter && (
                        <div className="space-y-2 text-xs">
                          <p className="font-medium text-muted-foreground">
                            Suggested cover letter
                          </p>
                          <div className="space-y-2 bg-muted/50 p-3 rounded-md">
                            <p className="font-semibold">{app.coverLetter.subject}</p>
                            <p>{app.coverLetter.opening}</p>
                            {app.coverLetter.body.map((paragraph, idx) => (
                              <p key={idx}>{paragraph}</p>
                            ))}
                            <p>{app.coverLetter.closing}</p>
                            <p className="font-medium">{app.coverLetter.call_to_action}</p>
                          </div>
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
    </div>
  );
}
