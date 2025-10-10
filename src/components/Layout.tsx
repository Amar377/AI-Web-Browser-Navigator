import { useState } from "react";
import { Outlet, useLocation, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Globe,
  Briefcase,
  ShoppingCart,
  Settings,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Chat", href: "/", icon: MessageSquare },
  { name: "Browser Navigator", href: "/navigator", icon: Globe },
  { name: "Job Assistant", href: "/jobs", icon: Briefcase },
  { name: "Price Comparison", href: "/price", icon: ShoppingCart },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2 animate-fade-in">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
                <Sparkles className="h-4 w-4 text-accent-foreground" />
              </div>
              <span className="font-semibold text-sidebar-foreground">AI Assistant</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8"
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-smooth",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <span className="animate-fade-in">{item.name}</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        {sidebarOpen && (
          <div className="border-t border-sidebar-border p-4 animate-fade-in">
            <div className="rounded-lg bg-sidebar-accent/50 p-3">
              <p className="text-xs text-sidebar-foreground/70">
                Local AI • Privacy First
              </p>
              <p className="mt-1 text-xs font-medium text-sidebar-foreground">
                Ollama Connected
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
