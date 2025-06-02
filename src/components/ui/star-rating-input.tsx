"use client";

import type { FC } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
  maxRating?: number;
  size?: number;
  className?: string;
  disabled?: boolean;
}

const StarRatingInput: FC<StarRatingInputProps> = ({
  value,
  onChange,
  maxRating = 5,
  size = 28, // Increased size for better touch interaction
  className,
  disabled = false,
}) => {
  return (
    <div className={cn("flex items-center space-x-1 py-1", className)}>
      {[...Array(maxRating)].map((_, index) => {
        const starValue = index + 1;
        return (
          <button
            type="button"
            key={starValue}
            disabled={disabled}
            onClick={() => !disabled && onChange(starValue)}
            className={cn(
              "p-1 rounded-md transition-all duration-150 ease-in-out transform",
              !disabled && "hover:scale-110 hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
            )}
            aria-label={`Rate ${starValue} out of ${maxRating} stars`}
            data-testid={`star-${starValue}`}
          >
            <Star
              size={size}
              className={cn(
                "transition-colors duration-150 ease-in-out",
                starValue <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            />
          </button>
        );
      })}
    </div>
  );
};

export default StarRatingInput;
