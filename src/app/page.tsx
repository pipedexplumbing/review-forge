
"use client";

import React, { useState, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StarRatingInput from '@/components/ui/star-rating-input';
import { useToast } from '@/hooks/use-toast';
import { composeReview, type ComposeReviewInput, type ComposeReviewOutput } from '@/ai/flows/compose-review';
import { Sparkles, Copy, Check, Loader2, Link as LinkIcon, PencilRuler, LogOut, KeyRound, Highlighter, RotateCcw } from 'lucide-react';

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
  const [generatedReviewTitle, setGeneratedReviewTitle] = useState<string | null>(null);
  const [fetchedProductName, setFetchedProductName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewCopied, setIsReviewCopied] = useState(false);
  const [isTitleCopied, setIsTitleCopied] = useState(false);
  const { toast, dismiss: dismissToast } = useToast();
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  // --- End App Specific State ---

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  // --- Authentication Effects and Handlers ---
  useEffect(() => {
    try {
      const authDataString = localStorage.getItem(LOCAL_STORAGE_AUTH_KEY);
      if (authDataString) {
        const authData = JSON.parse(authDataString);
        if (authData && authData.token === 'loggedIn' && authData.expiry && new Date().getTime() < authData.expiry) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_AUTH_KEY); 
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
    setGeneratedReviewTitle(null);
    setFetchedProductName(null);
    setError(null);
    reviewForm.reset();
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
    setGeneratedReviewTitle(null);
    setFetchedProductName(null);
    setIsReviewCopied(false);
    setIsTitleCopied(false);

    const aiInput: ComposeReviewInput = {
      amazonLink: data.amazonLink,
      starRating: data.starRating === 0 ? undefined : data.starRating,
      feedbackText: data.feedbackText,
    };

    try {
      const result: ComposeReviewOutput = await composeReview(aiInput);
      setGeneratedReview(result.reviewText);
      setGeneratedReviewTitle(result.reviewTitle);
      if (result.fetchedProductName) {
        setFetchedProductName(result.fetchedProductName);
      }
      toast({
        title: "Review Forged!",
        description: "Your AI-crafted review title and body are ready.",
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

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      reviewForm.handleSubmit(onReviewSubmit)();
    }
  };

  const handleCopy = async (textToCopy: string | null, type: 'title' | 'review') => {
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      const toastTitle = type === 'title' ? 'Title Copied!' : 'Review Copied!';
      const toastDescription = type === 'title' ? 'Review title copied to clipboard.' : 'Review body copied to clipboard.';
      
      if (type === 'title') setIsTitleCopied(true);
      else setIsReviewCopied(true);

      const { id: toastId } = toast({
        title: toastTitle,
        description: toastDescription,
      });

      setTimeout(() => {
        if (toastId) dismissToast(toastId); // Ensure toastId is defined before dismissing
        if (type === 'title') setIsTitleCopied(false);
        else setIsReviewCopied(false);
      }, 3000);
    } catch (err) {
      toast({
        title: 'Copy Failed',
        description: `Could not copy ${type} to clipboard.`,
        variant: 'destructive',
      });
    }
  };

  const handleClearForm = () => {
    reviewForm.reset({
      amazonLink: "",
      starRating: 0,
      feedbackText: "",
    });
    setGeneratedReview(null);
    setGeneratedReviewTitle(null);
    setFetchedProductName(null);
    setError(null);
    setIsReviewCopied(false);
    setIsTitleCopied(false);
  };
  // --- End Review Forge Form and Logic ---

  // --- Conditional Rendering: Login Page or App Page ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md shadow-xl rounded-lg">
          <CardHeader className="text-center p-8">
            <div className="inline-flex items-center justify-center p-3.5 bg-primary text-primary-foreground rounded-full mb-6 shadow-lg mx-auto">
              <PencilRuler size={40} />
            </div>
            <CardTitle className="font-headline text-4xl text-primary">Review Forge</CardTitle>
            <CardDescription className="font-body text-muted-foreground pt-2 text-lg">
              Please login to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-7 pt-2">
            <form onSubmit={handleLogin} className="space-y-7">
              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-xl font-medium font-body text-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="text-base h-12"
                />
              </div>
              {loginError && <p className="text-lg text-destructive font-body">{loginError}</p>}
              <Button type="submit" className="w-full text-xl py-3.5 font-headline font-semibold" size="lg">
                <KeyRound className="mr-2.5 h-6 w-6" />
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
        <footer className="mt-16 text-center">
          <p className="text-lg text-muted-foreground font-body">
            &copy; {currentYear || ''} Review Forge.
          </p>
      </footer>
      </div>
    );
  }

  // --- Authenticated App View ---
  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-4 transition-colors duration-300">
      <div className="w-full max-w-3xl flex justify-end items-center mb-8">
        <Button onClick={handleLogout} variant="outline" size="md" className="font-headline font-semibold text-base py-2.5 px-5">
          <LogOut className="mr-2 h-5 w-5" />
          Logout
        </Button>
      </div>
      
      <header className="mb-12 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-primary text-primary-foreground rounded-full mb-6 shadow-xl">
           <PencilRuler size={64} />
        </div>
        <h1 className="font-headline text-6xl md:text-7xl font-bold text-primary tracking-tight mb-2">
          Review Forge
        </h1>
        <p className="font-body text-muted-foreground mt-4 text-xl md:text-2xl max-w-2xl mx-auto">
          Transform your thoughts into polished Amazon reviews. Provide a link and your insights.
        </p>
      </header>

      <div className="w-full max-w-3xl space-y-10">
        <Card className="shadow-xl rounded-lg overflow-hidden transition-all hover:shadow-primary/20">
          <CardHeader className="bg-primary/90 p-7">
            <CardTitle className="font-headline text-4xl text-primary-foreground flex items-center">
              <Sparkles className="mr-3.5 h-8 w-8" />
              Craft Your Review
            </CardTitle>
            <CardDescription className="font-body text-primary-foreground/80 pt-2 text-lg">
              Fill in the details below to generate your review.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-7 md:p-8">
            <Form {...reviewForm}>
              <form onSubmit={reviewForm.handleSubmit(onReviewSubmit)} className="space-y-10">
                <FormField
                  control={reviewForm.control}
                  name="amazonLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl font-bold text-foreground mb-3 block">Amazon Product Link</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://amazon.com/dp/..." {...field} className="text-lg h-14 px-5" disabled={isLoading}/>
                      </FormControl>
                      <FormMessage className="text-lg" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={reviewForm.control}
                  name="starRating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl font-bold text-foreground mb-3 block">Your Rating (Optional)</FormLabel>
                      <FormControl>
                        <StarRatingInput value={field.value || 0} onChange={field.onChange} disabled={isLoading} size={44} />
                      </FormControl>
                      <FormMessage className="text-lg" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reviewForm.control}
                  name="feedbackText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl font-bold text-foreground mb-3 block">Your Key Feedback (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What did you like or dislike? e.g., 'Loved the battery life, but it's a bit bulky.'"
                          {...field}
                          onKeyDown={handleTextareaKeyDown}
                          rows={6}
                          className="text-lg resize-none p-5"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage className="text-lg" />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <Button 
                        type="submit" 
                        className="w-full text-2xl py-7 font-headline font-bold transition-transform hover:scale-[1.02] sm:col-span-2" 
                        disabled={isLoading} 
                        size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-3.5 h-7 w-7 animate-spin" />
                          Forging...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-3.5 h-7 w-7" />
                          Forge My Review
                        </>
                      )}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClearForm}
                        className="w-full text-xl py-7 font-headline font-semibold"
                        disabled={isLoading}
                        size="lg"
                    >
                        <RotateCcw className="mr-2.5 h-6 w-6" />
                        Clear
                    </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {error && (
          <Card className="bg-destructive/10 border-destructive text-destructive-foreground shadow-lg rounded-lg">
            <CardHeader className="p-6">
              <CardTitle className="font-headline text-2xl">Error</CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <p className="font-body text-xl">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {fetchedProductName && !isLoading && (
             <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
                <CardHeader className="bg-card/95 p-6 border-b">
                    <CardTitle className="font-headline text-2xl text-foreground">
                        Product: {fetchedProductName}
                    </CardTitle>
                    {reviewForm.getValues("amazonLink") && 
                        <a 
                            href={reviewForm.getValues("amazonLink")} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-lg text-accent hover:underline flex items-center pt-1.5 font-body"
                        >
                            <LinkIcon size={16} className="mr-2"/>View on Amazon
                        </a>
                    }
                </CardHeader>
            </Card>
        )}

        {generatedReviewTitle && !isLoading && (
          <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-secondary/80 p-7">
              <CardTitle className="font-headline text-3xl text-secondary-foreground flex items-center">
                <Highlighter className="mr-3.5 h-8 w-8" /> Review Title
              </CardTitle>
            </CardHeader>
            <CardContent className="p-7">
              <div className="font-body text-foreground bg-background/80 p-5 rounded-md border border-border/80 text-xl">
                {generatedReviewTitle}
              </div>
            </CardContent>
            <CardFooter className="p-7 border-t bg-card/60">
                <Button 
                    onClick={() => handleCopy(generatedReviewTitle, 'title')}
                    variant="outline" 
                    className="w-full text-xl py-4 font-headline font-semibold transition-transform hover:scale-[1.02]" 
                    size="lg" 
                    disabled={isTitleCopied}
                >
                  {isTitleCopied ? <Check className="mr-3 h-6 w-6 text-green-500" /> : <Copy className="mr-3 h-6 w-6" />}
                  {isTitleCopied ? 'Title Copied!' : 'Copy Title'}
                </Button>
            </CardFooter>
          </Card>
        )}

        {generatedReview && !isLoading && (
          <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-primary/90 p-7">
              <CardTitle className="font-headline text-3xl text-primary-foreground flex items-center">
                <PencilRuler className="mr-3.5 h-8 w-8" /> Review Body
              </CardTitle>
            </CardHeader>
            <CardContent className="p-7">
              <div className="font-body text-foreground whitespace-pre-wrap bg-background/80 p-5 rounded-md border border-border/80 text-xl leading-relaxed">
                {generatedReview}
              </div>
            </CardContent>
            <CardFooter className="p-7 border-t bg-card/60">
              <Button 
                onClick={() => handleCopy(generatedReview, 'review')}
                variant="outline" 
                className="w-full text-xl py-4 font-headline font-semibold transition-transform hover:scale-[1.02]" 
                size="lg" 
                disabled={isReviewCopied}
              >
                {isReviewCopied ? <Check className="mr-3 h-6 w-6 text-green-500" /> : <Copy className="mr-3 h-6 w-6" />}
                {isReviewCopied ? 'Copied!' : 'Copy Review Body'}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
      <footer className="mt-20 mb-10 text-center">
        <p className="text-lg text-muted-foreground font-body">
          &copy; {currentYear || ''} Review Forge. AI-powered review assistance.
        </p>
      </footer>
    </div>
  );
}

