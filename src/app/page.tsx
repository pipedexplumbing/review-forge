
"use client";

import React, { useState, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';

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
  const [fetchedProductImageURL, setFetchedProductImageURL] = useState<string | null>(null);
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
    setFetchedProductImageURL(null);
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
    setFetchedProductImageURL(null);
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
      if (result.fetchedProductImageURL) {
        setFetchedProductImageURL(result.fetchedProductImageURL);
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

      const toastInstance = toast({ // capture the toast instance
        title: toastTitle,
        description: toastDescription,
      });

      setTimeout(() => {
        if (toastInstance && toastInstance.id) { // Check if toastInstance and its id exist
           dismissToast(toastInstance.id); // Use dismissToast with the specific ID
        }
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
    setFetchedProductImageURL(null);
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
            <div className="inline-flex items-center justify-center p-3 bg-primary text-primary-foreground rounded-full mb-6 shadow-lg mx-auto transform transition-transform hover:scale-110">
              <PencilRuler size={48} />
            </div>
            <CardTitle className="font-headline text-5xl text-primary">Review Forge</CardTitle>
            <CardDescription className="font-body text-muted-foreground pt-2 text-xl">
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
                  className="text-lg h-14 px-5"
                />
              </div>
              {loginError && <p className="text-lg text-destructive font-body">{loginError}</p>}
              <Button type="submit" className="w-full text-2xl py-7 font-headline font-bold" size="lg">
                <KeyRound className="mr-3 h-7 w-7" />
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
        <footer className="mt-20 text-center">
          <p className="text-xl text-muted-foreground font-body">
            &copy; {currentYear || ''} Review Forge.
          </p>
      </footer>
      </div>
    );
  }

  // --- Authenticated App View ---
  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-4 transition-colors duration-300">
      <div className="w-full max-w-3xl flex justify-end items-center mb-10">
        <Button onClick={handleLogout} variant="outline" size="md" className="font-headline font-semibold text-lg py-3 px-6">
          <LogOut className="mr-2.5 h-5 w-5" />
          Logout
        </Button>
      </div>
      
      <header className="mb-16 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-primary text-primary-foreground rounded-full mb-8 shadow-xl transform transition-transform hover:scale-105">
           <PencilRuler size={72} />
        </div>
        <h1 className="font-headline text-6xl md:text-8xl font-bold text-primary tracking-tight mb-4">
          Review Forge
        </h1>
        <p className="font-body text-muted-foreground mt-5 text-xl md:text-2xl max-w-2xl mx-auto">
          Transform your thoughts into polished Amazon reviews. Provide a link and your insights.
        </p>
      </header>

      <div className="w-full max-w-3xl space-y-12">
        <Card className="shadow-xl rounded-lg overflow-hidden transition-all hover:shadow-primary/20">
          <CardHeader className="bg-primary/90 p-8">
            <CardTitle className="font-headline text-4xl md:text-5xl text-primary-foreground flex items-center">
              <Sparkles className="mr-4 h-10 w-10" />
              Craft Your Review
            </CardTitle>
            <CardDescription className="font-body text-primary-foreground/80 pt-2 text-lg md:text-xl">
              Fill in the details below to generate your review.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 md:p-10">
            <Form {...reviewForm}>
              <form onSubmit={reviewForm.handleSubmit(onReviewSubmit)} className="space-y-12">
                <FormField
                  control={reviewForm.control}
                  name="amazonLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl md:text-3xl font-bold text-foreground mb-4 block">Amazon Product Link</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://amazon.com/dp/..." {...field} className="text-lg h-16 px-6" disabled={isLoading}/>
                      </FormControl>
                      <FormMessage className="text-lg mt-2" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={reviewForm.control}
                  name="starRating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl md:text-3xl font-bold text-foreground mb-4 block">Your Rating (Optional)</FormLabel>
                      <FormControl>
                        <StarRatingInput value={field.value || 0} onChange={field.onChange} disabled={isLoading} size={48} />
                      </FormControl>
                      <FormMessage className="text-lg mt-2" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={reviewForm.control}
                  name="feedbackText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-2xl md:text-3xl font-bold text-foreground mb-4 block">Your Key Feedback (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="What did you like or dislike? e.g., 'Loved the battery life, but it's a bit bulky.'"
                          {...field}
                          onKeyDown={handleTextareaKeyDown}
                          rows={7}
                          className="text-lg resize-none p-6"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage className="text-lg mt-2" />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-3">
                    <Button 
                        type="submit" 
                        className="w-full text-2xl md:text-3xl py-8 font-headline font-bold transition-transform hover:scale-[1.02] sm:col-span-2" 
                        disabled={isLoading} 
                        size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-4 h-8 w-8 animate-spin" />
                          Forging...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-4 h-8 w-8" />
                          Forge My Review
                        </>
                      )}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClearForm}
                        className="w-full text-xl md:text-2xl py-8 font-headline font-semibold transition-transform hover:scale-[1.02]"
                        disabled={isLoading}
                        size="lg"
                    >
                        <RotateCcw className="mr-3 h-7 w-7" />
                        Clear
                    </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {error && (
          <Card className="bg-destructive/10 border-destructive text-destructive-foreground shadow-lg rounded-lg">
            <CardHeader className="p-7">
              <CardTitle className="font-headline text-3xl">Error</CardTitle>
            </CardHeader>
            <CardContent className="p-7 pt-0">
              <p className="font-body text-xl">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {(fetchedProductName || fetchedProductImageURL) && !isLoading && (
             <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
                <CardHeader className="bg-card/95 p-7 border-b">
                    {fetchedProductImageURL && fetchedProductName && (
                      <div className="mb-5 flex justify-center">
                        <Image 
                          src={fetchedProductImageURL} 
                          alt={fetchedProductName || 'Product Image'} 
                          width={250} 
                          height={250} 
                          className="rounded-lg object-contain border border-border shadow-md" 
                        />
                      </div>
                    )}
                    <CardTitle className="font-headline text-3xl text-foreground text-center">
                        {fetchedProductName || "Product Information"}
                    </CardTitle>
                    {reviewForm.getValues("amazonLink") && 
                        <a 
                            href={reviewForm.getValues("amazonLink")} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-lg text-accent hover:underline flex items-center justify-center pt-2.5 font-body"
                        >
                            <LinkIcon size={18} className="mr-2.5"/>View on Amazon
                        </a>
                    }
                </CardHeader>
            </Card>
        )}

        {generatedReviewTitle && !isLoading && (
          <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-secondary/80 p-8">
              <CardTitle className="font-headline text-3xl md:text-4xl text-secondary-foreground flex items-center">
                <Highlighter className="mr-4 h-9 w-9" /> Review Title
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="font-body text-foreground bg-background/80 p-6 rounded-md border border-border/80 text-xl md:text-2xl leading-relaxed">
                {generatedReviewTitle}
              </div>
            </CardContent>
            <CardFooter className="p-8 border-t bg-card/60">
                <Button 
                    onClick={() => handleCopy(generatedReviewTitle, 'title')}
                    variant="outline" 
                    className="w-full text-xl md:text-2xl py-7 font-headline font-semibold transition-transform hover:scale-[1.02]" 
                    size="lg" 
                    disabled={isTitleCopied}
                >
                  {isTitleCopied ? <Check className="mr-3.5 h-7 w-7 text-green-500" /> : <Copy className="mr-3.5 h-7 w-7" />}
                  {isTitleCopied ? 'Title Copied!' : 'Copy Title'}
                </Button>
            </CardFooter>
          </Card>
        )}

        {generatedReview && !isLoading && (
          <Card className="shadow-lg rounded-lg overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-primary/90 p-8">
              <CardTitle className="font-headline text-3xl md:text-4xl text-primary-foreground flex items-center">
                <PencilRuler className="mr-4 h-9 w-9" /> Review Body
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="font-body text-foreground whitespace-pre-wrap bg-background/80 p-6 rounded-md border border-border/80 text-xl md:text-2xl leading-relaxed">
                {generatedReview}
              </div>
            </CardContent>
            <CardFooter className="p-8 border-t bg-card/60">
              <Button 
                onClick={() => handleCopy(generatedReview, 'review')}
                variant="outline" 
                className="w-full text-xl md:text-2xl py-7 font-headline font-semibold transition-transform hover:scale-[1.02]" 
                size="lg" 
                disabled={isReviewCopied}
              >
                {isReviewCopied ? <Check className="mr-3.5 h-7 w-7 text-green-500" /> : <Copy className="mr-3.5 h-7 w-7" />}
                {isReviewCopied ? 'Copied!' : 'Copy Review Body'}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
      <footer className="mt-24 mb-12 text-center">
        <p className="text-xl text-muted-foreground font-body">
          &copy; {currentYear || ''} Review Forge. AI-powered review assistance.
        </p>
      </footer>
    </div>
  );
}
