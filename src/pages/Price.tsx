import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  TrendingDown,
} from "lucide-react";

interface PriceResult {
  id: string;
  store: string;
  price: number;
  currency: string;
  url: string;
  availability: "in-stock" | "out-of-stock" | "low-stock";
  rating?: number;
  title?: string;
  source?: string;
}

const getCurrencySymbol = (code: string) => {
  switch ((code || "").toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    case "AUD":
      return "A$";
    case "CAD":
      return "C$";
    default:
      return (code || "").toUpperCase();
  }
};

export default function Price() {
  const [query, setQuery] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [results, setResults] = useState<PriceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<
    "scrape" | "llm" | "api" | "api+scrape" | "none" | null
  >(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Enter a product name to compare prices.");
      return;
    }

    setIsSearching(true);
    setError(null);
    setSummary("");
    setResults([]);
    setMode(null);

    try {
      const response = await fetch("http://localhost:3001/api/price/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: query.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch price data");
      }

      const data = await response.json();
      const allowedAvailability: PriceResult["availability"][] = [
        "in-stock",
        "low-stock",
        "out-of-stock",
      ];

      const incoming: PriceResult[] = (data.results || []).map((result: any, index: number) => {
        const numericPrice = Number(result.price);
        const availability = allowedAvailability.includes(result.availability)
          ? (result.availability as PriceResult["availability"])
          : "in-stock";

        const currencyCode =
          typeof result.currency === "string"
            ? result.currency.toUpperCase()
            : "INR";

        return {
          id: result.id || `result-${index}`,
          store: result.store || result.source || "Unknown store",
          price: Number.isFinite(numericPrice) ? numericPrice : 0,
          currency: currencyCode,
          url: result.url || "#",
          availability,
          rating: typeof result.rating === "number" ? result.rating : undefined,
          title: result.title,
          source: result.source,
        };
      });

      setResults(incoming);
      setSummary(data.summary || "");
      setMode(
        (data.mode as "scrape" | "llm" | "api" | "api+scrape" | "none") ?? null
      );

      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const firstError = data.errors
          .map((err: { site?: string; message?: string }) =>
            err.site ? `${err.site}: ${err.message}` : err.message
          )
          .filter(Boolean)
          .join(" | ");
        if (firstError) {
          setError(firstError);
        }
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Something went wrong while searching prices."
      );
      setMode(null);
    } finally {
      setIsSearching(false);
    }
  };

  const pricedResults = results.filter(
    (result) => typeof result.price === "number" && !Number.isNaN(result.price)
  );
  const lowestPrice =
    pricedResults.length > 0
      ? Math.min(...pricedResults.map((r) => r.price))
      : 0;
  const highestPrice =
    pricedResults.length > 0
      ? Math.max(...pricedResults.map((r) => r.price))
      : 0;
  const canSearch = query.trim().length > 0;
  const currencyCode = pricedResults[0]?.currency ?? "INR";
  const currencySymbol = getCurrencySymbol(currencyCode);

  const summaryBadge = (() => {
    switch (mode) {
      case "llm":
        return (
          <Badge
            variant="outline"
            className="text-amber-600 border-amber-500/50"
          >
            AI estimates
          </Badge>
        );
      case "api":
        return (
          <Badge
            variant="outline"
            className="text-blue-600 border-blue-500/50"
          >
            Google API
          </Badge>
        );
      case "api+scrape":
        return (
          <Badge
            variant="outline"
            className="text-purple-600 border-purple-500/50"
          >
            API + Scrape
          </Badge>
        );
      case "scrape":
        return <Badge variant="outline">Live scrape</Badge>;
      case "none":
        return <Badge variant="outline">No data</Badge>;
      default:
        return null;
    }
  })();

  const summaryNote = (() => {
    switch (mode) {
      case "llm":
        return "These prices are generated by the local model for guidance—visit the retailer links to confirm current offers.";
      case "api":
        return "Prices retrieved via the configured Google price API. Confirm final amounts on the retailer pages.";
      case "api+scrape":
        return "Combined results from the Google price API and live scraping—verify details before purchasing.";
      default:
        return null;
    }
  })();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div>
          <h1 className="text-xl font-semibold">Price Comparison</h1>
          <p className="text-xs text-muted-foreground">
            AI-powered price search
          </p>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Search Box */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (error) {
                      setError(null);
                    }
                  }}
                  placeholder="Search for a product..."
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSearch();
                    }
                  }}
                />
                <input
                  type="file"
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload">
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />
                      Image
                    </span>
                  </Button>
                </label>
                <Button
                  onClick={handleSearch}
                  disabled={!canSearch || isSearching}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </Button>
              </div>

              {image && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{image.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setImage(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {error && (
            <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </Card>
          )}

          {/* Results */}
          {isSearching ? (
            <Card className="p-12">
              <div className="text-center space-y-4">
                <div className="h-12 w-12 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Searching across multiple stores...
                </p>
              </div>
            </Card>
          ) : results.length > 0 ? (
            <>
              {/* Summary */}
              {summary && (
                <Card className="p-6 bg-accent/10 border-accent/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-accent" />
                      Price Summary
                    </h3>
                    {summaryBadge}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {summary}
                  </p>
                  {summaryNote && (
                    <p
                      className={`text-xs ${
                        mode === "llm"
                          ? "text-amber-600"
                          : mode === "api" || mode === "api+scrape"
                          ? "text-blue-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {summaryNote}
                    </p>
                  )}
                </Card>
              )}

              {/* Price Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Lowest Price
                  </p>
                  <div>
                    <p className="text-2xl font-bold text-green-500">
                      {currencySymbol}
                      {lowestPrice.toFixed(2)}
                    </p>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {currencyCode}
                    </p>
                  </div>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Highest Price
                  </p>
                  <div>
                    <p className="text-2xl font-bold text-destructive">
                      {currencySymbol}
                      {highestPrice.toFixed(2)}
                    </p>
                    <p className="text-[10px] uppercase text-muted-foreground">
                      {currencyCode}
                    </p>
                  </div>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Stores Found
                  </p>
                  <p className="text-2xl font-bold">{results.length}</p>
                </Card>
              </div>

              {/* Results Table */}
              <Card>
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold">Price Comparison</h3>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {results
                      .filter(
                        (result) =>
                          typeof result.price === "number" &&
                          !Number.isNaN(result.price)
                      )
                      .sort((a, b) => a.price - b.price)
                      .map((result, index) => (
                        <div
                          key={result.id}
                          className="p-4 hover:bg-muted/50 transition-smooth"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                  index === 0
                                    ? "bg-green-500/20 text-green-500"
                                    : "bg-muted"
                                }`}
                              >
                                #{index + 1}
                              </div>
                              <div>
                                <h4 className="font-medium">{result.store}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  {result.source && (
                                    <Badge variant="outline" className="text-xs">
                                      {result.source}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={
                                      result.availability === "in-stock"
                                        ? "default"
                                        : result.availability === "low-stock"
                                        ? "secondary"
                                        : "destructive"
                                    }
                                    className="text-xs"
                                  >
                                    {result.availability}
                                  </Badge>
                                  {result.rating && (
                                    <span className="text-xs text-muted-foreground">
                                      ⭐ {result.rating}
                                    </span>
                                  )}
                                </div>
                                {result.title && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {result.title}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-2xl font-bold">
                                  {getCurrencySymbol(result.currency)}
                                  {result.price.toFixed(2)}
                                </p>
                                <p className="text-[10px] uppercase text-muted-foreground">
                                  {result.currency}
                                </p>
                                {index === 0 && (
                                  <p className="text-xs text-green-500 flex items-center justify-end gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    Best price
                                  </p>
                                )}
                              </div>
                              <Button size="sm" variant="outline" asChild>
                                <a
                                  href={result.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </Card>
            </>
          ) : (
            <Card className="p-12">
              <div className="text-center space-y-2">
                <Search className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Enter a product name or upload an image to start comparing
                  prices
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
