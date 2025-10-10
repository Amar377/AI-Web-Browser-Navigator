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
  TrendingUp,
} from "lucide-react";

interface PriceResult {
  id: string;
  store: string;
  price: number;
  currency: string;
  url: string;
  availability: "in-stock" | "out-of-stock" | "low-stock";
  rating?: number;
}

export default function Price() {
  const [query, setQuery] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [results, setResults] = useState<PriceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [summary, setSummary] = useState("");

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSearch = () => {
    if (!query && !image) return;
    setIsSearching(true);

    // Simulate search results
    setTimeout(() => {
      const mockResults: PriceResult[] = [
        {
          id: "1",
          store: "Amazon",
          price: 299.99,
          currency: "USD",
          url: "https://amazon.com",
          availability: "in-stock",
          rating: 4.5,
        },
        {
          id: "2",
          store: "Best Buy",
          price: 319.99,
          currency: "USD",
          url: "https://bestbuy.com",
          availability: "in-stock",
          rating: 4.3,
        },
        {
          id: "3",
          store: "Walmart",
          price: 289.99,
          currency: "USD",
          url: "https://walmart.com",
          availability: "low-stock",
          rating: 4.4,
        },
      ];
      setResults(mockResults);
      setSummary(
        "Based on 3 retailers, the average price is $303.32. Walmart offers the best deal at $289.99 (3% below average), but stock is limited. Amazon and Best Buy have better availability."
      );
      setIsSearching(false);
    }, 2000);
  };

  const lowestPrice = results.length > 0 ? Math.min(...results.map((r) => r.price)) : 0;
  const highestPrice = results.length > 0 ? Math.max(...results.map((r) => r.price)) : 0;

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
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for a product..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
                  disabled={(!query && !image) || isSearching}
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
                <Card className="p-6 bg-accent/10 border-accent/20">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-accent" />
                    AI Summary
                  </h3>
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </Card>
              )}

              {/* Price Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Lowest Price
                  </p>
                  <p className="text-2xl font-bold text-green-500">
                    ${lowestPrice.toFixed(2)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Highest Price
                  </p>
                  <p className="text-2xl font-bold text-destructive">
                    ${highestPrice.toFixed(2)}
                  </p>
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
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-2xl font-bold">
                                  ${result.price.toFixed(2)}
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
