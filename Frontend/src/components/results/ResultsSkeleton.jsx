import React from 'react';
import Navbar from '../Navbar';

export default function ResultsSkeleton() {
  return (
    <div className="min-h-screen bg-background pt-16">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-elevated animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="h-9 w-52 bg-muted rounded-lg" />
            <div className="h-9 w-64 bg-muted rounded-lg" />
          </div>
          <div className="h-12 w-full bg-muted/60 rounded-t-xl" />
          <div className="h-[500px] w-full bg-muted/40 rounded-b-xl" />
        </div>
        <div className="bg-card rounded-2xl border border-border p-6 shadow-elevated animate-pulse">
          <div className="h-6 w-48 bg-muted rounded mb-6" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 border-b border-border/60 flex items-center gap-4 px-2">
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="h-4 w-12 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="ml-auto h-8 w-32 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
