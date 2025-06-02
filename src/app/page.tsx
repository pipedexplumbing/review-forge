
"use client";

import React, { useState, useEffect, FormEvent } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import StarRatingInput from '@/components/ui/star-rating-input';
import { useToast } from '@/hooks/use-toast';
import { composeReview, type ComposeReviewInput, type ComposeReviewOutput } from '@/ai/flows/compose-review';
import { Sparkles, Copy, Check, Loader2, Link as LinkIcon, PencilRuler, LogOut, KeyRound } from 'lucide-react';

// --- Authentication Constants ---
const HARDCODED_PASSWORD = "amazon";
const LOCAL_STORAGE_AUTH_KEY = "reviewForgeAuth";
const AUTH_EXPIRY_DAYS = 14;
// --- End Authentication Constants ---

const reviewFormSchema = z.object({
  amazonLink: z.string().url("Please enter a valid Amazon product link."),
  starRating: z.number().min(0).max(5).optional(),
  feedbackText: z.string().optional(),
});

type ReviewFormData = z.infer<typeof reviewFormSchema>;

export default function ReviewForgePage() {
  // --- Authentication State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  // --- End Authentication State ---

  // --- App Specific State (Review Forge) ---
  const [generatedReview, setGeneratedReview] = useState<string | null>(null);
  const [fetchedProductName, setFetchedProductName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { toast, dismiss: dismissToast } = useToast();
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  // --- End App Specific State ---

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  // --- Authentication Effects and Handlers ---
  useEffect(() => {
    // Check auth on mount
    try {
      const authDataString = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY);
      if (authDataString) {
        const authData = JSON.parse(authDataString);
        if (authData && authData.token === 'loggedIn' && authData.expiry && new Date().getTime() < authData.expiry) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY); // Clear invalid/expired token
        }
      }
    } catch (e) {
      console.error("Error reading auth from localStorage", e);
      localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
    }
  }, []);

  const handleLogin = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (passwordInput === HARDCODED_PASSWORD) {
      const expiryTimestamp = new Date().getTime() + AUTH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      try {
        localStorage.setItem(LOCAL_STORAGE_AUTH_KEY, JSON.stringify({ token: 'loggedIn', expiry: expiryTimestamp }));
        setIsAuthenticated(true);
        setLoginError(null);
        setPasswordInput(""); 
      } catch (err) {
        console.error("Error saving auth to localStorage", err);
        setLoginError("Could not save login session. Please try again.");
      }
    } else {
      setLoginError("Incorrect password.");
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY);
    } catch (e) {
      console.error("Error removing auth from localStorage", e);
    }
    setIsAuthenticated(false);
    setGeneratedReview(null);
    setFetchedProductName(null);
    setError(null);
    // Potentially reset other app states if needed
  };
  // --- End Authentication Effects and Handlers ---

  // --- Review Forge Form and Logic ---
  const reviewForm = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      amazonLink: "",
      starRating: 0,
      feedbackText: "",
    },
  });

  const onReviewSubmit: SubmitHandler<ReviewFormData> = async (data) => {
    setIsLoading(true);
    setError(null);
    setGeneratedReview(null);
    setFetchedProductName(null);

    const aiInput: ComposeReviewInput = {
      amazonLink: data.amazonLink,
      starRating: data.starRating === 0 ? undefined : data.starRating,
      feedbackText: data.feedbackText,
    };

    try {
      const result: ComposeReviewOutput = await composeReview(aiInput);
      setGeneratedReview(result.reviewText);
      if (result.fetchedProductName) {
        setFetchedProductName(result.fetchedProductName);
      }
      toast({
        title: "Review Forged!",
        description: "Your AI-crafted review is ready.",
      });
    } catch (e) {
      console.error("Error composing review:", e);
      const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
      setError(`Failed to compose review: ${errorMessage}`);
      toast({
        title: "Error",
        description: `Failed to compose review: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyReview = async () => {
    if (generatedReview) {
      try {
        await navigator.clipboard.writeText(generatedReview);
        setIsCopied(true);
        const { id: toastId } = toast({
          title: "Copied!",
          description: "Review copied to clipboard.",
        });
        setTimeout(() => {
          if (toastId) { // Check if toastId is defined
            dismissToast(toastId);
          }
          setIsCopied(false);
        }, 3000);
      } catch (err) {
        console.error("Failed to copy review:", err);
        toast({
          title: "Copy Failed",
          description: "Could not copy review to clipboard.",
          variant: "destructive",
        });
      }
    }
  };
  // --- End Review Forge Form and Logic ---

  // --- Conditional Rendering: Login Page or App Page ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center py-8 px-4">
        <Card className="w-full max-w-md shadow-xl rounded-lg">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center p-3 bg-primary text-primary-foreground rounded-full mb-4 shadow-lg mx-auto">
              <PencilRuler size={36} />
            </div>
            <CardTitle className="font-headline text-3xl text-primary">Review Forge</CardTitle>
            <CardDescription className="font-body text-muted-foreground pt-1">
              Please login to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="text-base"
                />
              </div>
              {loginError && <p className="text-sm text-destructive">{loginError}</p>}
              <Button type="submit" className="w-full text-lg py-3 font-headline">
                <KeyRound className="mr-2 h-5 w-5" />
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
        <footer className="mt-12 text-center">
          <p className="text-sm text-muted-foreground font-body">
            &copy; {currentYear || ''} Review Forge.
          </p>
      </footer>
      </div>
    );
  }

  // --- Authenticated App View ---
  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-8 px-4 transition-colors duration-300">
      <div className="w-full max-w-3xl flex justify-between items-center mb-6">
        <div></div> {/* Spacer */}
        <Button onClick={handleLogout} variant="outline" size="sm" className="font-headline">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
      
      <header className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-primary text-primary-foreground rounded-full mb-4 shadow-lg">
           <PencilRuler size={48} />
        </div>
        <h1 className="font-headline text-5xl md:text-6xl font-bold text-primary tracking-tight">
          Review Forge
        </h1>
        <p className="font-body text-muted-foreground mt-3 text-lg md:text-xl max-w-2xl mx-auto">
          Transform your thoughts into polished Amazon reviews with the power of AI. Just provide an Amazon link and optionally your rating and feedback.
        </p>
      </header>

      <div className="w-full max-w-3xl space-y-8">
        <Card className="shadow-xl rounded-lg overflow-hidden transition-all hover:shadow-primary/20">
          <CardHeader className="bg-primary/90 p-6">
            <CardTitle className="font-headline text-3xl text-primary-foreground flex items-center">
              <Sparkles className="mr-3 h-7 w-7" />
              Craft Your Review
            </CardTitle>
            <CardDescription className="font-body text-primary-foreground/80 pt-1">
              Fill in the details below to generate your review.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <Form {...reviewForm}>
              <form onSubmit={reviewForm.handleSubmit(onReviewSubmit)} className="space-y-6">
                <FormField
                  control={reviewForm.control}
                  name="amazonLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg text-foreground">Amazon Product Link</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://amazon.com/dp/..." {...field} className="text-base" disabled={isLoading}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={reviewForm.control}
                  name="starRating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg text-foreground">Your Rating (Optional)</FormLabel>
                      <FormControl>
                        <StarRatingInput value={field.value || 0} onChange={field.onChange} disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reviewForm.control}
                  name="feedbackText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg text-foreground">Your Key Feedback (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What did you like or dislike? e.g., 'Loved the battery life, but it's a bit bulky.'"
                          {...field}
                          rows={4}
                          className="text-base resize-none"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full text-lg py-6 font-headline transition-transform hover:scale-105" disabled={isLoading} size="lg">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Forging...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Forge My Review
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {error && (
          <Card className="bg-destructive/10 border-destructive text-destructive shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="font-headline text-xl">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-body">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {(generatedReview || fetchedProductName) && !isLoading && (
          <Card className="shadow-xl rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-primary/90 p-6">
              <CardTitle className="font-headline text-3xl text-primary-foreground flex items-center">
                <PencilRuler className="mr-3 h-7 w-7" /> Your Forged Review
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 md:p-8 space-y-4">
              {fetchedProductName && (
                 <div className="p-4 border rounded-lg flex items-center space-x-4 bg-card hover:border-primary/50 transition-colors">
                    <div>
                        <h3 className="font-headline text-xl font-semibold text-foreground">{fetchedProductName}</h3>
                        {reviewForm.getValues("amazonLink") && <a href={reviewForm.getValues("amazonLink")} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline flex items-center"><LinkIcon size={14} className="mr-1"/>View on Amazon</a>}
                    </div>
                </div>
              )}
              {generatedReview && (
                <div className="prose prose-lg font-body max-w-none text-foreground whitespace-pre-wrap bg-background/50 p-4 rounded-md border border-border">
                  {generatedReview}
                </div>
              )}
            </CardContent>
            {generatedReview && (
              <CardFooter className="p-6 border-t">
                <Button onClick={handleCopyReview} variant="outline" className="w-full text-lg py-6 font-headline transition-transform hover:scale-105" size="lg" disabled={isCopied}>
                  {isCopied ? <Check className="mr-2 h-5 w-5 text-green-500" /> : <Copy className="mr-2 h-5 w-5" />}
                  {isCopied ? 'Copied!' : 'Copy Review Text'}
                </Button>
              </CardFooter>
            )}
          </Card>
        )}
      </div>
      <footer className="mt-12 text-center">
        <p className="text-sm text-muted-foreground font-body">
          &copy; {currentYear || ''} Review Forge. AI-powered review assistance.
        </p>
      </footer>
    </div>
  );
}

    