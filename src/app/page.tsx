
"use client";

import React, { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import StarRatingInput from '@/components/ui/star-rating-input';
import { useToast } from '@/hooks/use-toast';
import { composeReview, type ComposeReviewInput, type ComposeReviewOutput } from '@/ai/flows/compose-review';
import { Sparkles, Copy, Check, Loader2, Link as LinkIcon, VenetianMask } from 'lucide-react';

const formSchema = z.object({
  amazonLink: z.string().url("Please enter a valid Amazon product link."),
  starRating: z.number().min(0).max(5).optional(),
  feedbackText: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function ReviewForgePage() {
  const [generatedReview, setGeneratedReview] = useState<string | null>(null);
  const [fetchedProductName, setFetchedProductName] = useState<string | null>(null);
  const [fetchedProductImageURL, setFetchedProductImageURL] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amazonLink: "",
      starRating: 0,
      feedbackText: "",
    },
  });

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    setIsLoading(true);
    setError(null);
    setGeneratedReview(null);
    setFetchedProductName(null);
    setFetchedProductImageURL(null);

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
      if (result.fetchedProductImageURL) {
        setFetchedProductImageURL(result.fetchedProductImageURL);
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
        toast({
          title: "Copied!",
          description: "Review copied to clipboard.",
        });
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        toast({
          title: "Copy Failed",
          description: "Could not copy review to clipboard.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-8 px-4 transition-colors duration-300">
      <header className="mb-10 text-center">
        <div className="inline-flex items-center justify-center p-3 bg-primary text-primary-foreground rounded-full mb-4 shadow-lg">
           <VenetianMask size={48} />
        </div>
        <h1 className="font-headline text-5xl md:text-6xl font-bold text-primary tracking-tight">
          Review Forge
        </h1>
        <p className="font-body text-muted-foreground mt-3 text-lg md:text-xl max-w-2xl mx-auto">
          Transform your thoughts into polished Amazon reviews with the power of AI. Just provide an Amazon link and optionally your rating and feedback.
        </p>
      </header>

      <div className="w-full max-w-3xl space-y-8">
        <Card className="shadow-2xl rounded-xl overflow-hidden transition-all hover:shadow-primary/20 hover:shadow-xl">
          <CardHeader className="bg-gradient-to-br from-primary/80 to-accent/70 p-6">
            <CardTitle className="font-headline text-3xl text-primary-foreground flex items-center">
              <Sparkles className="mr-3 h-7 w-7" />
              Craft Your Review
            </CardTitle>
            <CardDescription className="font-body text-primary-foreground/80 pt-1">
              Fill in the details below to generate your review.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="amazonLink"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg">Amazon Product Link</FormLabel>
                      <FormControl>
                        <Input type="url" placeholder="https://amazon.com/dp/..." {...field} className="text-base" disabled={isLoading}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="starRating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg">Your Rating (Optional)</FormLabel>
                      <FormControl>
                        <StarRatingInput value={field.value || 0} onChange={field.onChange} disabled={isLoading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="feedbackText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-headline text-lg">Your Key Feedback (Optional)</FormLabel>
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
          <Card className="bg-destructive/10 border-destructive text-destructive shadow-lg rounded-xl">
            <CardHeader>
              <CardTitle className="font-headline text-xl">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-body">{error}</p>
            </CardContent>
          </Card>
        )}
        
        {(generatedReview || fetchedProductName || fetchedProductImageURL) && (
          <Card className="shadow-2xl rounded-xl overflow-hidden animate-in fade-in-50 duration-500">
            <CardHeader className="bg-gradient-to-br from-accent/70 to-primary/80 p-6">
              <CardTitle className="font-headline text-3xl text-primary-foreground flex items-center">
                <VenetianMask className="mr-3 h-7 w-7" /> Your Forged Review
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 md:p-8 space-y-4">
              {fetchedProductName && (
                <div className="p-4 border rounded-lg flex items-center space-x-4 bg-card hover:border-primary/50 transition-colors">
                  {fetchedProductImageURL && (
                    <Image
                      src={fetchedProductImageURL}
                      alt={fetchedProductName || "Product Image"}
                      width={80}
                      height={80}
                      className="rounded-md object-cover"
                      data-ai-hint="product photo"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'; 
                        const placeholder = document.createElement('div');
                        placeholder.className = 'w-[80px] h-[80px] bg-muted rounded-md flex items-center justify-center text-xs text-muted-foreground';
                        placeholder.textContent = 'No Image';
                        e.currentTarget.parentElement?.insertBefore(placeholder, e.currentTarget);
                       }}
                    />
                  )}
                  <div>
                    <h3 className="font-headline text-xl font-semibold text-foreground">{fetchedProductName}</h3>
                    {form.getValues("amazonLink") && <a href={form.getValues("amazonLink")} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline flex items-center"><LinkIcon size={14} className="mr-1"/>View on Amazon</a>}
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
                <Button onClick={handleCopyReview} variant="outline" className="w-full text-lg py-6 font-headline transition-transform hover:scale-105" size="lg">
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
          &copy; {new Date().getFullYear()} Review Forge. AI-powered review assistance.
        </p>
      </footer>
    </div>
  );
}

    